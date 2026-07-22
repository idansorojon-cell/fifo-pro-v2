/**
 * FIFO PRO — sw.js  ·  FIFO PRO 2.0 update-safe service worker
 * ─────────────────────────────────────────────────────────────
 * Strategy: ATOMIC VERSIONED SNAPSHOT.
 *
 *   · install  — precache every core asset into ONE cache named after
 *                the build (BUILD_CACHE, stamped by tools/bump-version.sh).
 *                The install fails atomically if any core file fails to
 *                download, so a half-new snapshot can never activate.
 *   · fetch    — cache-first FROM THE ACTIVE SNAPSHOT ONLY. Because every
 *                asset in a snapshot was downloaded together, new HTML can
 *                never run against old JS (the mixed-version bug class).
 *   · update   — the app layer (js/versionGuard.js) polls version.json
 *                with cache:'no-store'; when a newer build is live it
 *                shows a BLOCKING overlay, calls registration.update(),
 *                messages the waiting worker SKIP_WAITING, waits for
 *                controllerchange, then reloads — landing fully on the
 *                new snapshot.
 *   · activate — deletes every fifopro-* cache that isn't this build's,
 *                then clients.claim() so the new worker controls all
 *                open tabs immediately.
 *
 * version.json and script.google.com are NEVER cached — version checks
 * and data are always live. History of the pre-2.0 manual cache bumps
 * (v1..v35) is preserved in git; the version constant is now stamped by
 * the bump script instead of edited by hand.
 */

const BUILD_CACHE = 'fifopro-v2.0.1-2026-07-22.4';

// NOTE: relative paths so this works both at a domain root and under a
// GitHub Pages project subpath.
const CORE_ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'css/mobile.css',
  'css/system.css',
  'js/version.js',
  'js/versionGuard.js',
  'js/utils.js',
  'js/home.js',
  'js/tradeTicket.js',
  'js/performance.js',
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
  'js/cockpit.js',
  'js/ledger.js',
  'js/coach.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
];

// ── Install: atomic snapshot ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(BUILD_CACHE);
    // cache:'reload' bypasses the HTTP cache so the snapshot is truly
    // the deployed bytes, not a browser-cached mixture. addAll is
    // all-or-nothing: any failure rejects install and the OLD worker
    // keeps serving its own complete snapshot.
    await cache.addAll(CORE_ASSETS.map(u => new Request(u, { cache: 'reload' })));
    // Do NOT skipWaiting() here — activation is user-consented via the
    // update overlay (SKIP_WAITING message below), so an update can
    // never yank the rug mid-action.
  })());
});

// ── Activate: evict every other fifopro cache, claim clients ─
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('fifopro') && k !== BUILD_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ── Messages: consented activation + version query ───────────
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'GET_BUILD' && event.source) {
    event.source.postMessage({ type: 'SW_BUILD', cache: BUILD_CACHE });
  }
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Always-live, never cached: the backend and the version manifest.
  if (url.hostname.includes('script.google.com')) return;           // straight to network
  if (url.pathname.endsWith('/version.json')) return;               // straight to network

  event.respondWith((async () => {
    const cache = await caches.open(BUILD_CACHE);
    // Serve from this build's snapshot (ignore query strings so
    // cache-busted requests still hit the snapshot).
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(request);
      // Opportunistically add same-origin 200s to THIS snapshot only
      // (e.g. manifest.json, icons) — never to a foreign cache name.
      if (res && res.status === 200 && res.type === 'basic') {
        cache.put(request, res.clone());
      }
      return res;
    } catch (err) {
      // Offline navigation fallback: the snapshot's shell.
      if (request.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
