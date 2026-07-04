# FIFO PRO — Architecture

## Folder structure

```
/
├── index.html              shell: header, nav, all panel markup, modals
├── manifest.json           PWA manifest
├── sw.js                   service worker (cache-first static assets)
├── AppScript_FULL.gs        the entire backend (Sheets automation + Web API)
├── AppScript_PATCH.gs       legacy patch file — not deployed, historical only
├── CLAUDE.md                project rules / instructions for AI assistants
├── README.md                (near-empty, legacy)
├── README_AI.md              legacy AI-facing architecture notes (predates docs/)
├── docs/                    ← current documentation (this folder)
├── css/
│   ├── style.css            all component/layout styles
│   └── mobile.css           responsive overrides (small screens)
└── js/                      one file per feature module, loaded via <script> tags
    ├── utils.js              formatting, date parsing, calcStats, LS helpers
    ├── auth.js                session/token handling (currently bypassed)
    ├── learningEngine.js      supporting logic for Decision Engine
    ├── api.js                 ALL network calls to Apps Script
    ├── charts.js              Chart.js wrappers (equity/monthly/drawdown/symbol)
    ├── dashboard.js            main dashboard KPIs + goals tab
    ├── positions.js            open positions: cards, live prices, alerts
    ├── watchlist.js            watchlist CRUD + live prices
    ├── journal.js              trade journal table + modal
    ├── analytics.js            insights, mistake detector, performance center
    ├── decisionEngine.js       pre-trade analysis (technical + discipline + news)
    ├── aiCoach.js              behavioral analysis / coaching insights
    ├── aiChat.js               chat UI, proxies to Apps Script → Anthropic
    ├── trades.js               closed trades table, CRUD, CSV export
    ├── quicktrade.js           fast trade entry form + position sizer
    ├── dailyGrade.js           daily trading grade/score
    ├── tradeReplay.js          visual month-by-month trade replay
    ├── performanceTimeline.js  monthly performance timeline (collapsible)
    ├── settings.js             settings screen (password change, prefs)
    └── app.js                  global state, boot sequence, tab routing,
                                 Mission Control — loaded LAST (script order matters)
```

Root-level duplicates of every `js/*.js` and `css/style.css` file **used to
exist** (leftovers from GitHub web-UI "Add files via upload" pushes) and
were removed — see [CURRENT_STATUS.md](CURRENT_STATUS.md). `index.html`
has only ever loaded from `js/` and `css/`; keep it that way.

`Script.html` / `Style.html` at the repo root are Apps Script HTML-service
leftovers, unrelated to the GitHub Pages site (not referenced by
`index.html`). Left in place, not cleaned up — flagged in
[TECHNICAL_DEBT.md](TECHNICAL_DEBT.md).

## Rendering flow (navigation model)

The app uses a **hub → tab** two-level navigation, all client-side, no
router library:

- 5 top-level **categories**: דשבורד (dashboard), מסחר (trading), ניתוח
  (analysis), בינה מלאכותית (AI), הגדרות (settings). `switchCategory(cat)`
  shows that category's **hub panel** (`#tab-hub-<cat>`) — a landing page
  of nav cards.
- Each hub card calls `switchTab(name)`, which shows `#tab-<name>` (a leaf
  screen) and hides every other `.panel` (CSS: `.panel{display:none}`,
  `.panel.active{display:block}` — exactly one panel visible at a time).
- `switchTab()`'s `switch(name)` statement is where **lazy rendering**
  lives (see below) — each case populates that screen's DOM the moment
  it's opened.

## Lazy rendering (important — read before touching `renderAll()`)

`renderAll()` in `app.js` is intentionally minimal:

```js
function renderAll() {
  renderMissionControl();
}
```

It used to eagerly call `Dashboard.render()`, `Charts.render*()`,
`Trades.render()`, `Journal.render()`, `Positions.render()` on every boot —
building full DOM content for panels that were hidden anyway. This was
fixed (see CURRENT_STATUS.md) — verified via browser testing that
`#kpi-grid`, `#trades-tbody`, `#journal-tbody`, `#pos-grid` are genuinely
empty at boot and only populate when their tab is opened.

**Rule going forward:** any new screen/module must render itself in its own
`switchTab()` case, NOT in `renderAll()`. `renderAll()` is reserved for
Mission Control only, because Mission Control is the one thing visible at
boot and after every data mutation.

Mutation call sites (`Trades.submit()`, `Journal.save()`,
`Positions.submit()`, etc.) already call their own module's `render()`
directly before calling `renderAll()` — that's what keeps the *currently
open* tab fresh after an edit. `renderAll()` → `renderMissionControl()`
just keeps the home screen's live numbers in sync.

## Module responsibilities

Each `js/*.js` file is an IIFE exposing a single global object (e.g.
`const Positions = (() => { ... return {...}; })();`). No module system,
no imports — load order in `index.html`'s `<script>` tags is significant
(`utils.js` first, `app.js` last, since it depends on everything else
existing on `window` already).

- **`app.js`** — global `window.APP` state object, boot IIFE, tab/category
  routing, Mission Control rendering, daily brief, portfolio heatmap, smart
  goals. The closest thing to an "orchestrator."
- **`api.js`** — the only place that talks to the network. All GET/POST to
  the Apps Script Web App go through `authedUrl_()`/`authedGet_()`/`post()`.
  Also owns the `AUTH_DISABLED` frontend flag and the connectWS/disconnectWS
  no-op stubs (see Live price mechanism below).
- **`positions.js`** — open positions CRUD, the price-polling entry point
  (`refreshPrices()`), risk-status classification (`riskStatus()`, also
  used by Mission Control), and the alert system (dedup, toast, badge,
  dropdown).
- **`utils.js`** — pure functions: date parsing (`parseDD`/`toDD`),
  currency formatting, `calcStats()` (the trade-stats aggregator — this is
  "production" logic per CLAUDE.md, don't change without understanding it),
  `LS` (localStorage get/set wrapper), `debounce()`.

## API layer (`js/api.js`)

- `API_URL` — the deployed Apps Script Web App URL. Changing this requires
  redeploying Apps Script and is explicitly called out in `CLAUDE.md` as
  needing permission.
- `authedUrl_(action, extra)` — builds a GET URL with `?action=...&token=...`.
  Token is currently always `'auth-disabled'` (see Authentication in
  PROJECT_OVERVIEW.md).
- `post(body)` — POST with token injected into the body (except
  login/logout/revokeAllSessions).
- `check401_()` / `handle401_()` — normally would clear the session and show
  the login screen on a 401; currently short-circuited to no-ops while
  `AUTH_DISABLED = true`.
- `loadAll()` — the main data bootstrap: tries `getOperations` (derives
  trades+positions from a "פעולות" sheet via FIFO), falls back to legacy
  `getTrades`+`getPositions`.
- `fetchPrices(symbols)` — calls `getPrices`, logs full response to console
  for debuggability (`[fetchPrices]` prefix).
- `diagnose()` — callable from the browser console (`API.diagnose()`) to
  probe GET/POST health without touching app state.

## Data model: two possible sources for trades/positions

`js/api.js`'s `loadAll()` tries `getOperations` **first**, falling back to
legacy `getTrades`+`getPositions` only if it fails:

- **`getOperations` (primary path — confirmed active in production):**
  reads a `"פעולות"` (raw BUY/SELL log) sheet — possibly in a *different
  spreadsheet* than the Apps Script project's bound one, see
  PROJECT_OVERVIEW.md — "Two spreadsheets." Both `trades` and `positions`
  are **derived on every call** via FIFO lot-matching (`applyFIFO_` in
  `AppScript_FULL.gs`). `applyFIFO_` itself still returns
  `target`/`stop_loss`/`notes` as `''` — it has no way to know about them,
  they aren't part of the raw transaction log.

**Tax fix (this session): symmetric `tax = gross × 0.25`.** `applyFIFO_`
previously clamped tax to `0` on losing trades (`gross > 0 ? tax : 0`),
silently understating every loss's severity by 25% — found via a full-
history audit comparing the hardcoded `SEED` array (`js/app.js`, the
original historical data) against live output: 28 of 108 trades mismatched,
100% of them losses, 0% of them differing in any identifying field or in
`gross` itself. Fixed by removing the sign condition, matching `CLAUDE.md`'s
documented formula exactly. See `docs/TECHNICAL_DEBT.md` for the full audit
evidence and per-month impact. Since trades are derived fresh on every
`getOperations` call (nothing stored), this fix is retroactive across all
history the instant it's redeployed — no migration step exists or is
needed.
- **`getTrades`+`getPositions` (fallback path):** reads the legacy
  `Trades`/`Positions` sheets directly — rows are the real source of
  truth here, including whatever `target`/`stop_loss`/`notes` were saved.

**Fix (this session): `mergePositionMeta_()`.** Immediately after
`applyFIFO_()` returns, `handleGetOperations_` calls
`mergePositionMeta_(result.positions)`, which reads the legacy
`Positions` sheet and overlays `target`/`stop_loss`/`notes` onto each
derived position **matched by symbol**. The legacy sheet is now treated
purely as an annotation store for these three fields, while `qty`/
`avg_price`/`added_date` on open positions always come from the FIFO
derivation (the actual source of truth for "what do I currently hold").

**Write path: `handleUpsertPositionMeta_()` (new endpoint,
`upsertPositionMeta`).** The position edit modal (`Positions.submit()` in
`js/positions.js`) now calls this instead of `addPosition`/
`updatePosition`. It finds-or-creates the legacy sheet row **by symbol**,
not by the numeric `id` `applyFIFO_` hands out synthetically on every call
(which never matched a real row id, and could in principle have collided
with an unrelated row's id — confirmed via live testing that the one
existing legacy row, a stale `OKLL` position, wasn't even one of the two
real open positions at the time). `addPosition`/`updatePosition`/
`deletePosition`/`getPositions` are unchanged — the legacy fallback path's
behavior is identical to before.

**Deployment note:** this fix lives in `AppScript_FULL.gs` and, like any
backend change, only takes effect after a manual Apps Script redeploy —
see PROJECT_OVERVIEW.md "Deployment." Until redeployed, the frontend will
correctly show `❌ Unknown action: upsertPositionMeta` rather than the
previous silent-success behavior.

**This turned out to be the one write path of many that got updated for
the FIFO migration** — Trades add/edit/delete, Journal, Trade Notes, and
Quick Trade's buy/sell tabs all still wrote to pre-migration sheets this
read path never looks at. See `docs/TECHNICAL_DEBT.md` — "Persistence
architecture" for the full audit and the phased fix (Phase A disabled
every one of those paths at the UI level; Phase B will generalize this
exact symbol/composite-key overlay pattern to trades).

## State flow

Single global mutable object: `window.APP` (defined in `app.js`):

```js
APP = {
  trades: [], positions: [], watchlist: [], liveData: {},
  monthGoal, darkMode, sortCol, sortDir, charts: {},
  statsCache, editId, posEditId, journalId, noteId, pollingInterval,
  currentCategory, lastTab: {...}
}
```

- `getStats()` lazily computes and caches `Utils.calcStats(APP.trades)`;
  `invalidateStats()` clears the cache (called after any trade mutation).
- `APP.liveData[symbol]` holds the latest price object from `getPrices`
  (`{ price, prevClose, change, changePct, changePctValid, source, ... }`).
  Both `positions.js` (card rendering) and `app.js` (Mission Control) read
  from this same object — never recompute day-change client-side from
  `prevClose` (see the "BUG FIX" comments in `positions.js` — a past bug
  resurfaced exactly this way).

## Service Worker & cache strategy (`sw.js`)

- Cache-first for all static assets (`STATIC_ASSETS` list — every
  `js/*.js`, both CSS files, `index.html`, the Chart.js CDN URL).
- Apps Script requests (`script.google.com`) are always network — never
  cached (data must always be live).
- **Critical:** `CACHE_NAME`/`STATIC_CACHE` version (currently `fifopro-v4`)
  MUST be bumped any time `index.html` or any `js/*.js` file changes.
  Because the fetch handler is cache-first, a returning browser will keep
  serving an old cached bundle **forever** if the cache name doesn't
  change — this actually happened this session (stuck on a stale
  pre-Mission-Control bundle) and is the most likely culprit any time a
  deployed fix "isn't showing up" for a specific user/device. See
  TECHNICAL_DEBT.md for a proposed permanent fix (network-first for HTML).

## Live price update mechanism

- No real WebSocket — `API.connectWS()`/`disconnectWS()` are named stubs
  kept for API compatibility; they just update the "Polling" UI indicator.
  A real streaming connection would require exposing a provider API key to
  the browser, which is explicitly avoided (see PROJECT_OVERVIEW.md APIs).
- Actual mechanism: `setInterval` in `app.js` (`startPolling()`) calls
  `Positions.refreshPrices()` every 15 seconds, which calls
  `API.fetchPrices(symbols)` → Apps Script `getPrices` → Finnhub
  `/quote` per symbol (via `UrlFetchApp.fetchAll` for parallel batch
  fetch) → response cached into `APP.liveData` → `positions.js` re-renders
  the grid → `renderMissionControl()` re-runs (Open P&L, biggest risk).
- Alert de-duplication (`positions.js`) is keyed by
  `symbol + alertType + threshold` and stored in `localStorage`
  (`fifo_alerts_shown_v1`) so the same alert only toasts once per day,
  even though `checkAlerts()` recomputes on every 15s poll.

## Icon system

Main nav, hub headers, hub cards, mobile bottom nav, and header actions
use a hand-authored SVG `<symbol>` sprite (defined once near the top of
`index.html`'s `<body>`) instead of emoji — full spec, rationale, and
the icon inventory live in `docs/DESIGN_SYSTEM.md`. Card-title and
in-content emoji (alert badge, risk pills, Mission Control glyphs) are
intentionally not yet migrated — see that doc's "Phase log."

## PWA behavior

- `manifest.json` declares a standalone, portrait, RTL (`dir: "he"`) app
  named "FIFO PRO — Trading Dashboard".
- Installable on mobile home screens; icons referenced at
  `assets/icon-192.png` / `icon-512.png` (verify these exist if install
  prompts look broken — not verified in this session).
- Service worker registered at the end of `_initApp()` in `app.js`,
  `.catch(() => {})` — install failure is silently ignored (acceptable;
  offline support is a nice-to-have, not core functionality, per the
  Apps Script backend being the actual source of truth).
