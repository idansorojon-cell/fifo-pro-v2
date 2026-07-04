# FIFO PRO — Session Handoff

_Paste this entire document into a new Claude Code session to resume work
with full context. Detailed docs live in `/docs` — this file is the
condensed, self-contained summary._

---

## 1. Project Overview

**FIFO PRO** is a personal trading journal and analytics dashboard for an
Israeli trader who trades US stocks. It is a real, daily-use production
tool — not a demo.

- **Tax model:** Israeli capital gains, 25% flat, applied client-side
  (`gross → tax → net`).
- **Currency:** USD primary, ILS secondary via a monthly exchange-rate table.

**Architecture:**
```
Browser (static site, GitHub Pages)
  index.html + css/*.css + js/*.js  (no framework, no build step)
        │ fetch (GET/POST)
        ▼
Google Apps Script Web App (doGet/doPost) — the entire "backend"
        │
        ├── Google Sheets   (Trades, Positions, Watchlist, Settings)
        ├── Finnhub API      (live prices, news — server-side only)
        └── Anthropic API    (AI Chat — server-side only, key never in browser)
```

**Tech stack:** vanilla HTML/CSS/JS (ES6+), Chart.js via CDN, Google Apps
Script backend, Google Sheets as the database, GitHub Pages hosting, a
service-worker-backed PWA shell.

**Deployment — two independent steps that do NOT happen together:**
1. Frontend: `git push origin main` → GitHub Pages auto-rebuilds (~30–90s).
2. Backend: `AppScript_FULL.gs` must be **manually pasted** into
   script.google.com and redeployed (*Deploy → Manage deployments → Edit →
   New version → Deploy*). Git push does nothing to the live backend.

**APIs:** Apps Script Web App (all CRUD/prices/AI Chat, called from
`js/api.js`); Finnhub `/quote` + news endpoints (backend-only); Anthropic
API (backend-only, proxied).

**Authentication:** Currently **fully disabled** on both frontend
(`js/auth.js`, `js/api.js` — `AUTH_DISABLED = true`) and backend
(`AppScript_FULL.gs` — `AUTH_DISABLED = true`). The login screen was
removed from `index.html` entirely (not just hidden). The underlying
session-token/password-hash system still exists and works — see §7 for
how to restore it. **This is a known, accepted-for-now security gap, not
a bug** — don't "fix" it without being asked.

**Data flow:** Boot → `_initApp()` → `load()` → `API.loadAll()` (GET
`getOperations`/`getGoal`/`getWatchlist`) → populates global `window.APP`
→ only Mission Control renders. Navigation (`switchTab`) lazily renders
whichever screen was just opened. Prices poll every 15s via
`Positions.refreshPrices()` → Apps Script `getPrices` → Finnhub → updates
`APP.liveData` → re-renders positions grid + Mission Control.

**⚠️ Two possible Google Sheets, not one.** `getOperations` (tried first)
reads a `"פעולות"` transactions log — possibly in a *different*
spreadsheet identified by the `OPERATIONS_SPREADSHEET_ID` Script Property
(falls back to a hardcoded ID if unset) — and derives both trades and
positions from it via FIFO matching. Derived positions always have
`target`/`stop_loss`/`notes` hardcoded blank. The legacy `getTrades`/
`getPositions` fallback path reads a separate `Positions` sheet directly,
where those fields are real. **The position edit modal always writes to
the legacy sheet regardless of which path is active** — if `getOperations`
is the live path (it appears to be, based on this session's testing),
target/stop/notes edits will not round-trip. See §7/§10 and
`docs/ARCHITECTURE.md`'s "Data model" section — do not assume this is
fixed or that it's safe to ignore.

**Script Properties (Apps Script → Project Settings), not in git:**
`LOGIN_PASSWORD`, `SESSION_TTL_HOURS` (dormant while auth disabled),
`FINNHUB_API_KEY`, `ANTHROPIC_API_KEY` (both active/required),
`OPERATIONS_SPREADSHEET_ID` (see above), `POLYGON_API_KEY`,
`YAHOO_FALLBACK_ENABLED` (both dormant). Full table:
`docs/PROJECT_OVERVIEW.md`.

---

## 2. Product Philosophy

> **Evolution, not Revolution.**

Never perform unnecessary rewrites or large refactors. The smallest change
that correctly fixes the stated problem wins. If a bigger architectural
change seems tempting, propose it and explain why — don't just do it.

Existing project rules (from `CLAUDE.md`, still authoritative): never
break existing functionality; if a feature works, keep it working and
extend rather than replace it; never remove functionality unless
explicitly instructed; ask before deleting code.

---

## 3. Current Features

**Dashboard category:** Mission Control (home — live Open P&L, today/week/
month P&L, positions summary, biggest-risk position, one AI insight, alert
badge, nav cards); Main Dashboard (KPIs, equity/monthly/drawdown charts);
Daily Brief; Goals (progress ring, simulation); Progress (win-rate/PF over
time); Performance Timeline (collapsed to latest 3 months by default);
Daily Grade.

**Trading category:** Open Positions (large cards: risk-status pill,
live price, daily %, entry, qty, current value, P&L $/%, target/stop,
alert system); Trades table (closed trades, latest 20 + "load more",
CSV export); Quick Trade (fast entry + position sizer); Watchlist; Journal
(latest 20 + "load more").

**Analysis category:** Symbol charts, Performance Center, Insights/
Mistake Detector, Trade Replay, Portfolio Heatmap, Calendar Heatmap,
Symbol Notes.

**AI category:** Decision Engine (pre-trade technical + discipline score +
news), AI Coach (full behavioral analysis, lazy-rendered only when opened),
AI Chat (proxied to Anthropic).

**Settings category:** password change (dormant while auth is disabled),
theme, monthly goal.

**Cross-cutting:** dark/light mode, RTL Hebrew UI, mobile-responsive
(bottom nav on small screens), installable PWA.

Full detail: `docs/FEATURES.md`.

---

## 4. Architecture

**Folder structure:**
```
index.html, manifest.json, sw.js, AppScript_FULL.gs, CLAUDE.md
css/  style.css, mobile.css
js/   utils.js, auth.js, learningEngine.js, api.js, charts.js,
      dashboard.js, positions.js, watchlist.js, journal.js, analytics.js,
      decisionEngine.js, aiCoach.js, aiChat.js, trades.js, quicktrade.js,
      dailyGrade.js, tradeReplay.js, performanceTimeline.js, settings.js,
      app.js  (loaded LAST — depends on everything else)
docs/ (this documentation set)
```
Root-level duplicates of every `js/*.js` file used to exist (stale GitHub
web-UI upload leftovers) — **removed**. `Script.html`/`Style.html` at root
are unrelated Apps Script HTML-service leftovers, not referenced by
`index.html`, left in place (not confirmed dead, out of scope to remove).

**Rendering flow:** hub → tab, two-level, all client-side, no router
library. 5 categories, each with a hub landing panel of nav cards;
`switchTab(name)` shows exactly one `#tab-<name>` panel
(`.panel{display:none}` / `.panel.active{display:block}`).

**Lazy rendering (important):** `renderAll()` in `app.js` only calls
`renderMissionControl()`. Every other screen (dashboard/trades/journal/
positions/etc.) renders itself the first time its own `switchTab()` case
runs — this was a real fix this session (previously `renderAll()` eagerly
built full DOM for hidden panels at boot). **Rule: new screens render
themselves in their own switchTab case, never in renderAll().**

**Module responsibilities:** each `js/*.js` is an IIFE exposing one global
(`const X = (() => {...; return {...}})();`). No module system — script
tag order in `index.html` matters. `api.js` is the only file that talks to
the network. `positions.js` owns price polling + the alert system.
`utils.js` owns `calcStats()` (production trading-math, be careful).

**State:** single global `window.APP` object (trades, positions,
watchlist, liveData, monthGoal, statsCache, etc.), defined in `app.js`.
`APP.liveData[symbol]` is the shared source of live price data for both
positions cards and Mission Control — never recompute day-change from
`prevClose` client-side (guards against a real historical bug).

**Service Worker (`sw.js`):** cache-first for all static assets;
Apps Script requests always network (never cached). **`CACHE_NAME`/
`STATIC_CACHE` (currently `fifopro-v4`) must be manually bumped any time
`index.html` or `js/*.js` changes** — otherwise returning users can get
stuck on a stale bundle indefinitely (this happened once this session).

**Live prices:** no real WebSocket (`connectWS`/`disconnectWS` are named
stubs for API compatibility, just toggle a "Polling" UI dot). Real
mechanism: `setInterval` every 15s → `Positions.refreshPrices()` →
Finnhub via Apps Script → `APP.liveData` → re-render. Alerts deduped by
`symbol+type+threshold` in `localStorage`, once/day.

**PWA:** installable, RTL, standalone manifest. Icons at
`assets/icon-*.png` — not verified to exist this session.

Full detail: `docs/ARCHITECTURE.md`.

---

## 5. Production Status

Live at `idansorojon-cell.github.io/fifo-pro-v2`, branch `main`, latest
commit `1bd0f82` at handoff time. Verified via direct `curl` against the
live URL after every push this session (not just "code looks right
locally").

**Deployed and confirmed working:**
- Login screen fully removed, boots straight into the app.
- Mission Control home screen with live data.
- Alert de-dup (once/day per symbol+type+threshold) + persistent badge.
- Enlarged position cards with risk-status pills.
- Trades/Journal tables paginated (latest 20 + load more).
- Performance Timeline collapsed to latest 3 months by default.
- Genuine lazy rendering (verified empty-at-boot via browser DOM checks).
- Service worker bumped to `fifopro-v4`.
- 21 stale root-level duplicate files removed (`/app.js` now 404s,
  `/js/app.js` serves current code).

**Backend (`AppScript_FULL.gs` in git):**
- `handleGetPrices_` → Finnhub only (sole provider). Polygon/Yahoo code
  present but unwired (disabled, not deleted).
- `AUTH_DISABLED = true`.
- `FINNHUB_API_KEY` confirmed already correctly configured server-side.

⚠️ **Unverified:** whether the git version of `AppScript_FULL.gs` matches
what's actually deployed to Apps Script right now — that step is manual
and doesn't happen automatically. Confirm with `testAuth_()`/
`testFinnhub_()` run directly in the Apps Script editor before assuming
backend behavior matches what's described here.

Full detail + session history: `docs/CURRENT_STATUS.md`.

---

## 6. Outstanding Work

**P0 (security/correctness):** restore authentication (see §7); confirm
live Apps Script deployment matches git; **confirm whether position
target/stop-loss/notes actually round-trip** (likely broken under the
primary `getOperations` data path — see §1/§4/§7, ask the project owner
before changing anything); identify source of recurring stale GitHub
web-UI uploads (see §9/§10).

**P1 (reliability):** switch service worker to network-first for HTML/JS;
resolve fate of `Script.html`/`Style.html`/`AppScript_PATCH.gs`; some form
of manual smoke-test checklist post-deploy.

**P2 (product):** decide Polygon's long-term fate (keep dormant vs.
remove); consider whether Mission Control's single AI-insight sentence
needs more depth.

**P3 (deferred, explicitly out of scope unless asked):** automated tests
(none exist); real-time price streaming; verify PWA icon assets exist.

Full detail: `docs/ROADMAP.md`.

---

## 7. Technical Debt

- **Position `target`/`stop_loss`/`notes` may be silently dropped**
  (likely bug, unconfirmed). See §1's "Two possible Google Sheets" note.
  The edit modal's writes and the primary read path (`getOperations`)
  target different sheets. Not introduced this session — appears to
  predate it. Verify with the project owner before touching.
- **Auth fully bypassed** — real, live exposure if used beyond a trusted
  device. To restore: set `AUTH_DISABLED = false` in `AppScript_FULL.gs`,
  `js/auth.js`, `js/api.js`; ensure `LOGIN_PASSWORD` Script Property is
  set; restore the login overlay markup in `index.html` (removed, not
  hidden — `auth.js`'s `showLoginScreen()`/`hideLoginScreen()` still
  reference `#login-overlay`/`#login-password`/`#login-btn`/`#login-error`
  by ID, useful for rebuilding it); redeploy Apps Script manually.
- **Cache-first service worker** requires manual cache-version bumps on
  every frontend change — no systemic enforcement, already bit us once.
- **`Script.html`/`Style.html`/`AppScript_PATCH.gs`** — likely dead,
  unconfirmed, not removed (out of scope this session).
- **Repeated GitHub web-UI stale uploads** fought against git pushes 3+
  times this session — root cause never identified.
- **Polygon/Yahoo price-provider code** present but fully unwired —
  intentional "disabled, not deleted" debt.
- **No automated tests whatsoever.** All verification this session was
  manual (browser preview tools + `curl`). Real risk for a financial-data
  app, even a personal one.
- **No build step/bundler** — script load order in `index.html` is
  manually maintained, no dependency graph enforcement.
- **Hardcoded `API_URL`** in `js/api.js` — changes require explicit
  permission per `CLAUDE.md`, and must be updated if the Apps Script
  deployment URL ever changes.

Full detail: `docs/TECHNICAL_DEBT.md`.

---

## 8. Development Rules

**Local development, read first:** project root is
`/Users/idansorojon/Desktop/claude/fifo/files` (note nested `files/`).
`python3 -m http.server` fails here (sandbox permission error) — use the
`.claude/launch.json` preview config named exactly **`"fifo-pro"`**
(port 5176, custom inline Node static server). ⚠️ The same launch.json
also has `"trading-dashboard"` and `"dana-care-app"` for *unrelated*
sibling projects — an inexact name can silently launch the wrong app
(happened once this session). Before testing any change, clear the
service worker + caches via `preview_eval` (see `docs/DEVELOPMENT_RULES.md`
for the exact snippet) or you'll be looking at stale cached code. The
local preview talks to the real, live Apps Script backend — there is no
mock; test data changes are real.

- **Diagnose before fixing** — reproduce the reported bug in a real
  browser (preview tools: screenshot, console, network, DOM state) before
  changing code. More than once this session, the real cause differed
  from the first hypothesis.
- **Small, targeted diffs** — scope fixes to exactly the function/file
  needed.
- **Disable, don't delete**, when reverting an experiment (Polygon, Yahoo,
  auth) — a single flag/flip should be able to undo the revert later.
- **Verify in a real browser** before claiming a UI fix is done — not
  "the code looks right," actually screenshot/inspect it.
- **Verify the live deployment separately** — local correctness ≠ GitHub
  Pages rebuilt ≠ Apps Script redeployed (the last one is a manual human
  step). `curl` the live URL after every push.
- **Ask before large destructive actions** — prove files are truly
  unreferenced/stale before deleting them (as was done before removing the
  21 root-level duplicates).
- **Never change `API_URL`, Apps Script endpoint contracts, or
  `utils.js`'s trading-math functions** without explicit permission and
  full understanding of the implications.
- **RTL Hebrew UI, existing CSS variables/classes, existing hub→tab
  pattern** — match, don't introduce new paradigms.
- **New heavy content renders lazily on tab-open**, never eagerly at boot.

Full detail + verification checklist: `docs/DEVELOPMENT_RULES.md`.

---

## 9. Git Status

_As observed at handoff time — verify freshly, don't trust this if time
has passed:_

- Repo: `idansorojon-cell/fifo-pro-v2`, remote `origin`, single branch
  `main`.
- Working tree was clean (`nothing to commit`) after the last push this
  session.
- Recent commits (newest first): `1bd0f82` (lazy rendering + SW cache
  bump), `124f971` (remove stale root-level duplicates), `af6309c`
  (Mission Control + alert de-dup + table pagination), `769edfc`/
  `3469bc7` (Finnhub revert + merge), earlier commits for auth
  removal/bypass and the original Polygon integration.
- **Recurring issue:** `git push` was rejected 3+ times this session
  because `origin/main` had moved — every time traced to a GitHub web-UI
  "Add files via upload" commit reintroducing a stale snapshot. Each time
  resolved via `git fetch` → inspect → `git merge --no-commit` →
  `git checkout --ours <files>` → commit → push. **If this happens again,
  don't assume the remote is right — diff it first.**

---

## 10. Critical Context (do not rediscover these)

- **Auth bypass is deliberate and repeated-request-driven**, not a bug —
  don't silently re-add a login prompt.
- **Finnhub is the sole price provider by explicit, final instruction**
  after a full Polygon integration was built and then explicitly reverted.
  Don't re-introduce Polygon without being asked.
- **Day-change % must always come from the backend's `changePctValid`
  flag** — recomputing from `prevClose` client-side resurrects a real
  historical bug (ONDL showing a fake ~-42% change from a stale reference
  close). See "BUG FIX" comments in `positions.js`.
- **Alert dedup key is `symbol + type + threshold`, stored in
  `localStorage`, once per calendar day** — comparing the full rendered
  message string (which includes the live price) was the original bug;
  don't revert to that.
- **`renderAll()` is deliberately thin** (`renderMissionControl()` only) —
  this is the fix, not a regression. Don't restore eager full-page
  rendering there.
- **The positions table under the card grid was removed on purpose**
  (exact duplicate of the card grid's data) — don't re-add it.
- **Root-level duplicate JS/CSS files were removed on purpose** —
  `index.html` only ever loaded from `js/`/`css/`. If they reappear,
  that's very likely another stale GitHub web-UI upload, not something to
  "fix" by keeping both.
- **Two separate deployment targets, always say which one a fix needs**:
  git push (frontend, automatic) vs. manual Apps Script redeploy
  (backend, human step, easy to forget).
- **`sw.js` cache version must be bumped whenever `index.html`/`js/*.js`
  changes** — cache-first strategy means otherwise stale bundles persist
  indefinitely for returning users.
- **Verification standard on this project is "curl the live URL and grep
  for the specific change,"** not "the local diff looks correct."
- **There may be two Google Sheets, not one** — see §1. Position
  target/stop/notes edits likely don't round-trip under the primary data
  path. Don't assume this is fixed; don't "fix" it without asking which
  sheet is meant to be authoritative.
- **Preview-tool naming collision:** always launch the local preview with
  the exact name `"fifo-pro"` — `"trading-dashboard"` and
  `"dana-care-app"` are different projects in sibling folders and will
  launch silently with no error if you get the name slightly wrong.

---

## 11. Engineering Review (recommendations only — not implemented)

As a senior engineer looking at this codebase fresh, here's what I'd flag
for future consideration. None of this should be acted on without
explicit go-ahead — it's offered as informed opinion, not a task list.

**Architecture:**
- The no-build, no-module-system, manually-ordered-`<script>`-tags
  approach has served this project fine at its current size, but it's
  already at ~20 JS files with implicit load-order dependencies. If it
  grows much further, even a zero-config bundler (esbuild, no framework
  change needed) would remove an entire class of "forgot to add the
  script tag" or "loaded out of order" bugs, without requiring a rewrite.
- The single-Apps-Script-file-as-backend approach (`AppScript_FULL.gs`,
  ~2700 lines) is doing a lot: web API layer, sheet CRUD, price fetching,
  AI proxying, session auth. It works, but it's one giant file with no
  test coverage. If it keeps growing, splitting into logically-separate
  `.gs` files (Apps Script supports multiple files in one project) would
  help readability without changing behavior at all — a genuinely safe,
  low-risk improvement whenever there's appetite for it.

**Maintainability:**
- The recurring GitHub web-UI upload collisions are a process problem,
  not a code problem, but they've cost real time this session. Worth
  actually finding the source (is this project also open in another
  browser tab's file editor? A second machine? Some sync tool?) rather
  than continuing to just resolve the merge conflict each time it recurs.
- No tests means every "fix" this session required manual browser
  re-verification. For a project of this size, even a handful of
  smoke-test scripts (could be as simple as a Node script hitting the
  Apps Script URL and asserting shapes) would catch backend regressions
  far faster than manual `curl`+`grep` each time.

**Performance:**
- Nothing alarming currently. The lazy-rendering fix this session was the
  right call and addresses the main risk (unbounded DOM growth on boot as
  trade history grows). Table pagination (latest 20 + load more) is a
  reasonable, low-effort mitigation for the same class of problem in
  Trades/Journal.
- 15-second polling for prices is a reasonable middle ground given the
  constraint of not exposing a provider API key to the browser. If this
  ever needs to feel more "live," the honest options are (a) a thin proxy
  server that can hold a provider WebSocket connection server-side and
  relay to the browser, or (b) accepting the current polling cadence —
  there's no good client-only trick that improves on this without
  exposing a key.

**UX/UI:**
- Mission Control is a strong addition — it directly addresses the "too
  much on screen at once" complaint. The one AI-insight sentence there is
  currently a cheap heuristic (consecutive losses / no-stop pattern / win
  rate threshold) rather than a call into the full AI Coach analysis —
  that's a reasonable tradeoff for a home-screen glance, but worth being
  explicit that it's not the same depth as opening AI Coach directly.
- The alert system's dedup-per-day is right for "don't spam," but if the
  trader wants to be re-alerted intraday as a position moves *further*
  into risk (e.g., -5% alert already shown, now it's -15%), the current
  threshold-based ID (`symbol_warn_-5`) wouldn't re-toast for that
  worsening — only the stop/target thresholds are position-specific
  values that would naturally change. Worth confirming this matches the
  trader's actual expectations before assuming it's fully correct.

**Reliability:**
- The two-deployment-target problem (frontend auto-deploys, backend
  requires a manual step) is the single most likely source of future
  "I fixed it but it's not working" confusion. If this becomes a frequent
  pain point, it's technically possible to script the Apps Script
  deployment via `clasp` (Google's Apps Script CLI) so `git push` could
  trigger both deployments — a real, scoped improvement if it's ever
  worth the setup cost.
- The cache-first service worker strategy is the other main reliability
  risk, already documented in TECHNICAL_DEBT.md with a concrete
  recommended fix (network-first for HTML/JS, cache-first only for truly
  static assets).

**Scalability:**
- Everything here is scoped to a single user's trade history — there's no
  multi-user concern to design for, and building for one wasn't a mistake
  given the stated goal. If this ever needs to support more than one
  trader, the current architecture (one spreadsheet, one Apps Script
  deployment, one hardcoded `API_URL`) would need real redesign at that
  point — but that's speculative future work, not a current gap.
