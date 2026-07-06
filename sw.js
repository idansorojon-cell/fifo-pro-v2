/**
 * FIFO PRO — sw.js
 * Service Worker: offline caching + background sync
 */

// Bumped v1 -> v2: STATIC_ASSETS changed (learningEngine.js added,
// decisionEngine.js rewritten) — old caches are evicted in 'activate'.
// Bumped v3 -> v4: app.js/index.html changed significantly this session
// (auth removal, Polygon->Finnhub, Mission Control, lazy tab rendering)
// without ever bumping the cache version — returning users were stuck
// on a cache-first-served stale bundle indefinitely. Bump this version
// any time index.html or any js/*.js file changes, or clients will keep
// serving old code forever regardless of what's deployed.
// Bumped v4 -> v5: icon system (Design Phase 1) — index.html (icon
// sprite + markup), css/style.css, js/utils.js, js/app.js, js/settings.js
// all changed.
// Bumped v5 -> v6: Mission Control hierarchy (Design Phase 3) —
// index.html (new icon symbol), css/style.css, css/mobile.css, js/app.js.
// Bumped v6 -> v7: live-status UX (ambient header dot/timestamp vs
// fixed-position toast, no more layout shift on every 15s price poll) —
// css/style.css, index.html, js/api.js, js/app.js, js/positions.js,
// js/watchlist.js.
// Bumped v7 -> v8: Design Phase 2 (broader emoji cleanup) — card-titles,
// alert badge/toasts, risk pills, target/stop labels, Mission Control
// coach insight, Daily Brief — index.html, css/style.css, js/app.js,
// js/positions.js.
// Bumped v8 -> v9: removed the manual-refresh success toast entirely —
// replaced with a spinning refresh-button icon (API.setButtonBusy) plus
// the existing ambient dot/timestamp — index.html, css/style.css,
// js/api.js, js/positions.js, js/watchlist.js.
// Bumped v9 -> v10: Design Phase 4 (KPI/card differentiation) — unified
// .kpi styling (merged a dormant, conflicting !important duplicate),
// aligned .prog-kpi/.week-card/.brief-kpi typography, chart-card and
// list-card (.card--flush) differentiation, removed confirmed-dead CSS
// (.kpi-v3, .card-glass, .kpi-trend, .prog-kpi-val) — css/style.css,
// css/mobile.css, index.html, js/dashboard.js.
// Bumped v17 -> v18: Stability Sprint, write-through create-only Phase 1 —
// New Position now appends a real BUY row to "פעולות" (AppScript_FULL.gs
// handleAppendOperation_/handleAddTradeOperation_, js/api.js
// appendOperation/addTradeOperation, js/positions.js openForm/openEdit/
// submit) — index.html, js/api.js, js/positions.js, AppScript_FULL.gs.
// Bumped v18 -> v19: write-through create-only Phase 2 — Quick Trade
// Buy/Sell and Add Trade now also append real ops to "פעולות" (js/
// quicktrade.js submit, js/trades.js openAddForm/submit); removed the
// stale .action-disabled class from all three now-live buttons in
// index.html (Add Trade, New Position, Quick Trade submit) — index.html,
// js/quicktrade.js, js/trades.js.
// Bumped v19 -> v20: Functional cleanup — Settings audit (hid ~15
// decorative controls never read anywhere: timezone, weeklyGoal/
// dailyGoal, maxConsecLosses, commission, the whole AI section,
// alertGoal/alertDrawdown/alertConsecLosses, sessionTimeout; wired up
// maxPositionSize into Decision Engine's exposure-risk coloring and
// alertStop into positions.js's stop/warn alert gating, both previously
// collected but never consulted) — js/settings.js, js/decisionEngine.js,
// js/positions.js.
// Bumped v20 -> v21: Delete Position restored — a mistaken open position
// is now deleted by appending a SELL of the full remaining quantity at
// its own avg_price (cost basis) via the existing appendOperation
// endpoint, closing it out with zero P&L impact. Pure addition, no
// backend changes, no mutation of any existing row. Edit/Delete Trade
// remain disabled — a closed trade's lot is already consumed, so this
// same pure-addition approach doesn't apply there — js/positions.js.
// Bumped v22 -> v23: Phase 1 owner login restored — login overlay markup
// back in index.html, boot flow now gated on Auth.init()/_onAuthSuccess
// (was silently broken: login succeeded but the app never actually booted
// or started price polling — see docs/TECHNICAL_DEBT.md "Restoring
// authentication") — index.html, js/auth.js, js/api.js, js/app.js.
// Bumped v23 -> v24: Phase 2 viewer (read-only) role — role now stored in
// the session (Auth.getRole()), new Settings -> Security -> "Manage
// Viewer" section (owner-only) to create/rename/re-password/lock the
// viewer account — js/auth.js, js/api.js, js/settings.js.
// Bumped v24 -> v25: Phase 3 — every write-capable UI control is now
// hidden (not just blocked server-side) for a viewer session: Trades/
// Positions/Watchlist/Quick Trade add buttons, Positions/Watchlist/
// Journal row actions, Dashboard goal editor, AI Chat input, Settings'
// password-change/revoke-sessions rows. Personal greeting (time-of-day +
// display name) on Cockpit/Dashboard; Settings -> Security gained Owner
// display-name + Viewer display-name fields (UI-only, never used for
// permissions) — index.html, js/app.js, js/auth.js, js/api.js,
// js/utils.js, js/settings.js, js/cockpit.js, js/dashboard.js,
// js/positions.js, js/watchlist.js, js/journal.js, js/trades.js.
const CACHE_NAME   = 'fifopro-v27';
const STATIC_CACHE = 'fifopro-static-v27';

// NOTE: paths are relative (no leading "/") so they resolve correctly
// both at a domain root AND under a GitHub Pages project subpath
// (e.g. https://user.github.io/repo-name/). A leading "/" would always
// resolve to the domain root and 404 on project pages.
const STATIC_ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'css/mobile.css',
  'js/utils.js',
  'js/learningEngine.js',
  'js/api.js',
  'js/app.js',
  'js/charts.js',
  'js/dashboard.js',
  'js/positions.js',
  'js/watchlist.js',
  'js/journal.js',
  'js/analytics.js',
  'js/decisionEngine.js',
  'js/aiCoach.js',
  'js/aiChat.js',
  'js/trades.js',
  'js/quicktrade.js',
  'js/auth.js',
  'js/dailyGrade.js',
  'js/tradeReplay.js',
  'js/performanceTimeline.js',
  'js/settings.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll(STATIC_ASSETS.map(url => {
        return new Request(url, { cache: 'reload' });
      })).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err.message);
      })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== STATIC_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip: Google Apps Script (always live — trades/positions/watchlist/
  // prices/indicators/AI Chat all proxy through it, never call third
  // -party APIs directly from the browser)
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return res;
      }).catch(() => {
        // Offline fallback for navigation
        if (request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});
