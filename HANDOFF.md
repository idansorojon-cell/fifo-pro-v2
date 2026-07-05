# FIFO PRO — Session Handoff

_Paste this entire document into a new Claude Code session to resume work
with full context. Detailed docs live in `/docs` — this file is the
condensed, self-contained summary._

---

## 1. Project Overview

**FIFO PRO** is a personal trading journal and analytics dashboard for an
Israeli trader who trades US stocks. It is a real, daily-use production
tool — not a demo.

- **Tax model:** Israeli capital gains, 25% flat, computed **server-side**
  in `applyFIFO_()` (`AppScript_FULL.gs`) — `tax = gross × 0.25` applies
  symmetrically to both signs (a losing trade gets a negative tax, i.e. a
  25% offset). This was a real, fixed bug this session — see §5.
- **Currency:** USD primary, ILS secondary via a monthly exchange-rate table.

**Architecture:**
```
Browser (static site, GitHub Pages)
  index.html + css/*.css + js/*.js  (no framework, no build step)
        │ fetch (GET/POST)
        ▼
Google Apps Script Web App (doGet/doPost) — the entire "backend"
        │
        ├── Google Sheets   ("פעולות" raw log = source of truth;
        │                    legacy Trades/Positions sheets = annotation-
        │                    only stores; Watchlist, Settings sheets)
        ├── Finnhub API      (live prices, news — server-side only)
        └── Anthropic API    (AI Chat — server-side only, key never in browser)
```

**Tech stack:** vanilla HTML/CSS/JS (ES6+), Chart.js via CDN, Google Apps
Script backend, Google Sheets as the database, GitHub Pages hosting, a
service-worker-backed PWA shell.

**Deployment — two independent steps that do NOT happen together:**
1. Frontend: `git push origin main` → GitHub Pages auto-rebuilds (~30–90s).
   ⚠️ **GitHub Pages failed to deploy once this session for an unconfirmed
   reason** (leading hypothesis: the legacy Jekyll pipeline's soft
   build-rate-limit, tripped by a burst of ~8 commits in ~2.5 hours) — it
   succeeded on the very next push with no code change. If a push doesn't
   show up live, check `idansorojon-cell.github.io/fifo-pro-v2` deployment
   status before assuming the code is wrong.
2. Backend: `AppScript_FULL.gs` must be **manually pasted** into
   script.google.com and redeployed (*Deploy → Manage deployments → Edit →
   New version → Deploy*). Git push does nothing to the live backend.
   **⚠️ Important operational fact learned this session: the trader has
   been copying `AppScript_FULL.gs` directly off local disk (not via git)
   into the Apps Script editor and redeploying, sometimes ahead of a
   commit.** This means the live backend can genuinely be ahead of the
   last commit — always verify live behavior directly (`curl` a GET
   action) rather than assuming git HEAD == production. This exact
   situation happened this session (see §5) and was resolved by diffing
   the live source against the local working tree and committing a
   "sync" commit once they were confirmed identical.

**APIs:** Apps Script Web App (all CRUD/prices/AI Chat, called from
`js/api.js`); Finnhub `/quote` + news endpoints (backend-only); Anthropic
API (backend-only, proxied).

**Authentication:** Currently **fully disabled** on both frontend
(`js/auth.js`, `js/api.js` — `AUTH_DISABLED = true`) and backend
(`AppScript_FULL.gs` — `AUTH_DISABLED = true`). **This is a known,
accepted-for-now security gap, not a bug** — don't "fix" it without being
asked.

**Data flow:** Boot → `_initApp()` → `load()` → `API.loadAll()` (GET
`getOperations`/`getGoal`/`getWatchlist`) → populates global `window.APP`
→ only Mission Control renders. Navigation (`switchTab`) lazily renders
whichever screen was just opened. Prices poll every 15s via
`Positions.refreshPrices()` → Apps Script `getPrices` → Finnhub → updates
`APP.liveData` → re-renders positions grid + Mission Control.

**⚠️ The persistence architecture — read this before touching any
add/edit/delete flow.** This was the single biggest finding this session
(§5/§6). `"פעולות"` (a raw BUY/SELL transaction log, possibly in a
*different* spreadsheet via the `OPERATIONS_SPREADSHEET_ID` Script
Property) is the **sole source of truth** for trades/positions, derived
fresh on every `getOperations` call via `applyFIFO_()` (FIFO lot-matching).
**Nothing in the app can write to `"פעולות"` itself** — it's edited by
hand by the trader. Two legacy sheets (`Trades`, `Positions`) exist
alongside it, and the app went through an *incomplete* migration from
"CRUD these sheets directly" to "derive everything from `"פעולות"`": only
ONE write path was ever updated to bridge old and new (position
target/stop/notes, `upsertPositionMeta`, matched by symbol). Every other
write path (Trades add/edit/delete, Journal, Trade Notes, Quick Trade's
buy/sell) still wrote to the legacy sheets using pre-migration
assumptions (matching by a synthetic, regenerated-every-load id), which
the new read path never consulted — so those edits appeared to save, then
silently reverted on refresh. **Golden rule going forward: never match
derived data by a synthetic/regenerated id — always match by a stable,
content-derived key** (symbol for positions; a composite
`symbol+buy_date+sell_date+qty+buy_price+sell_price` key for trades,
proven unique across the full historical dataset). See §5/§6 for exactly
what's fixed and what's still pending.

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

This session added a corollary, learned the hard way: **when multiple
screens show the same symptom (data vanishes after refresh), stop and
look for one shared root cause before patching each screen individually.**
That's exactly what happened — a "New Position bug" report led to a full
persistence audit, which found one incomplete migration behind four
different-looking symptoms, and a single fix strategy (not four patches).

Existing project rules (from `CLAUDE.md`, still authoritative): never
break existing functionality; if a feature works, keep it working and
extend rather than replace it; never remove functionality unless
explicitly instructed; ask before deleting code.

---

## 3. Current Features

**Dashboard category:** Mission Control (home — live Open P&L, today/week/
month P&L, positions summary, biggest-risk position, one AI insight, alert
badge, nav cards); Main Dashboard (KPIs, equity/monthly/drawdown charts);
Daily Brief; Goals (progress ring, simulation — also editable from the
Dashboard tab itself via `saveGoal()`, hits the same safe `setGoal`
endpoint as Settings); Progress (win-rate/PF over time); Performance
Timeline (collapsed to latest 3 months by default); Daily Grade.

**Trading category:** Open Positions (large cards: risk-status pill, live
price, daily %, entry, qty, current value, P&L $/%, target/stop, alert
system — target/stop/notes editing works and persists; qty/avg_price are
now **read-only** in the edit modal, since they're always sourced from
FIFO derivation; creating a brand-new position not backed by a real FIFO
lot is **disabled** with an explanation); Trades table (closed trades,
latest 20 + "load more", CSV export — **add/edit/delete are currently
disabled**, see §6 P0); Quick Trade (fast entry + position sizer — the
calculator/preview still works; **submitting is disabled**, both the buy
and sell branches, since both wrote to the same broken legacy paths);
Watchlist (fully persistent, unaffected by any of this); Journal
(entry/exit reason, respected stop, followed plan, lesson, emotion — **now
genuinely persists**, fixed this session via `upsertTradeMeta`/
`mergeTradeMeta_`); Trade Notes (same fix, same endpoint).

**Analysis category:** Symbol charts, Performance Center, Insights/
Mistake Detector, Trade Replay, Portfolio Heatmap, Calendar Heatmap,
Symbol Notes (a read-only aggregation of Journal/Notes content — will
naturally improve now that Journal actually persists).

**AI category:** Decision Engine (pre-trade technical + discipline score +
news), AI Coach (full behavioral analysis, lazy-rendered only when opened),
AI Chat (proxied to Anthropic).

**Settings category:** ~35 controls audited this session (§6) — roughly 7
actually do something (theme, monthly goal, connection badge, clear-cache,
export CSV/JSON, sync-now, validate-data, password/session mgmt — the
latter three dormant while auth is disabled), 1 is actively broken
(last-price-update timestamp, never written), 1 is meaningfully misleading
(JSON import only restores prefs, silently discards trades/positions/
watchlist despite claiming to), and ~25 are pure decoration (localStorage-
only, read by nothing else in the app — currency, date format, timezone,
risk %, stop-loss %, take-profit %, tax %, alerts, AI model selector,
module-visibility toggles, etc.). **Audited, not yet implemented/fixed —
explicitly deferred until persistence work is done, per instruction.**

**Cross-cutting:** dark/light mode, RTL Hebrew UI, mobile-responsive
(bottom nav on small screens), installable PWA, hand-authored SVG icon
sprite (no more emoji in nav/hub chrome, table row-actions, or the three
lazily-rendered empty states — Phase 5a this session).

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

**Rendering flow:** hub → tab, two-level, all client-side, no router
library. 5 categories, each with a hub landing panel of nav cards;
`switchTab(name)` shows exactly one `#tab-<name>` panel.

**Lazy rendering (important):** `renderAll()` in `app.js` only calls
`renderMissionControl()`. Every other screen renders itself the first
time its own `switchTab()` case runs. **Rule: new screens render
themselves in their own switchTab case, never in renderAll().**

**Module responsibilities:** each `js/*.js` is an IIFE exposing one global.
No module system — script tag order in `index.html` matters. `api.js` is
the only file that talks to the network. `positions.js` owns price
polling + the alert system. `utils.js` owns `calcStats()` (production
trading-math) and the `icon(name)` helper for the SVG sprite. Bare
top-level functions/consts in `utils.js` (e.g. `icon`, `ddToISO`,
`isoToDD`) are true globals, callable directly from any later-loaded file
without destructuring `Utils` first.

**State:** single global `window.APP` object (trades, positions,
watchlist, liveData, monthGoal, statsCache, etc.), defined in `app.js`.
`APP.liveData[symbol]` is the shared source of live price data — never
recompute day-change from `prevClose` client-side.

**The persistence/annotation-overlay pattern (read before adding any new
editable field):** `handleGetOperations_` calls `applyFIFO_()` (derives
trades+positions fresh from `"פעולות"`), then `mergePositionMeta_()`
(overlays position target/stop/notes from the legacy `Positions` sheet,
matched **by symbol**) and `mergeTradeMeta_()` (overlays trade
entry_reason/exit_reason/respected_stop/followed_plan/lesson/emotion/notes
from the legacy `Trades` sheet, matched by a **composite key**:
`symbol+buy_date+sell_date+qty+buy_price+sell_price`). The write sides are
`handleUpsertPositionMeta_`/`handleUpsertTradeMeta_` (both find-or-create
by the same stable key, never by row id). **Any future editable
annotation field must follow this exact pattern** — write via a
key-matched upsert, and add the corresponding overlay in
`handleGetOperations_`. Never add a new field that writes to a legacy
sheet without also adding the read-side merge, and never match by a
synthetic id.

**What's currently disabled, not broken-and-silent (Phase A, this
session):** Trades add/edit/delete, Quick Trade's buy/sell submit, and
brand-new-position creation are all disabled at their UI entry point
(`js/trades.js`, `js/quicktrade.js`, `js/positions.js`) with a clear
explanatory toast (`.action-disabled` CSS class, warn-styled) — **not
deleted**. Original logic sits behind an early `return`, kept as a
reference for when Trades gets the same composite-key fix Journal/Notes
already got.

**Service Worker (`sw.js`):** cache-first for all static assets. Current
version `fifopro-v13`. **Must be manually bumped any time `index.html` or
`js/*.js` changes.**

**Live prices:** `setInterval` every 15s → `Positions.refreshPrices()` →
Finnhub via Apps Script → `APP.liveData` → re-render. Alerts deduped by
`symbol+type+threshold` in `localStorage`, once/day.

Full detail: `docs/ARCHITECTURE.md`.

---

## 5. What happened this session (chronological, high-level)

1. **Phase 5 UX audit** (forms/tables/controls) → **Phase 5a** shipped:
   table row-action icons + 3 empty states migrated from emoji to the SVG
   sprite; consolidated a duplicate `.empty-state` CSS block.
2. **Phase 5b** shipped: Trades modal date fields → native `type="date"`.
3. **User reported a discrepancy** between FIFO PRO and their manual
   spreadsheet for May 2026 ($2,875 gap). Full audit traced this to a
   **systemic tax-calculation bug**: `applyFIFO_` clamped tax to 0 on
   losing trades instead of applying the symmetric 25% rate — proven via
   an exact field-by-field diff against a hardcoded `SEED` array (108
   historical trades) in `js/app.js`. 28 of 108 trades affected, 11
   months, $9,585.78 total understatement. **Fixed, redeployed by the
   trader, confirmed live.**
4. **User reported "New Position" and Trading Journal changes vanish
   after refresh.** Investigation found the root cause (legacy sheets
   never read by the primary path) and, at the user's request, this
   expanded into a **full persistence audit of every editable module**.
5. **Persistence audit complete:** confirmed this is one incomplete
   data-model migration, not isolated bugs (see §1/§4). Trades' own
   edit/delete elevated to P0 (matches by numeric id — the exact
   mechanism already proven risky and fixed for positions; real
   silent-corruption risk, not just "invisible after refresh").
6. **Unified fix strategy agreed** (not implemented all at once):
   Phase A (frontend-only, disable every fake-persistence path) → Phase B
   (backend, generalize the position-meta pattern to trades) → Phase C
   (point Quick Trade's buy tab at the already-correct endpoint) →
   Phase D (optional/future: writing real trades to `"פעולות"` itself,
   not scheduled) → Phase E (Settings fake-controls cleanup, deferred
   per explicit instruction) → Phase F (remaining Phase 5 polish).
7. **Phase A implemented, verified live in the browser (not just read in
   source), committed.** GitHub Pages then **failed to deploy** this
   commit — investigated locally (ruled out Jekyll/Liquid syntax, front
   matter, encoding, repo size, git conflicts; leading hypothesis is a
   Pages build-rate-limit from a burst of commits).
8. **Phase B implemented** (`handleUpsertTradeMeta_`/`mergeTradeMeta_` +
   composite key, `js/api.js`/`js/journal.js` redirected to it). While
   verifying against the live backend, discovered **the live Apps Script
   already had this exact code** — traced to the trader copying
   `AppScript_FULL.gs` directly off local disk (not via git) and
   redeploying, ahead of any commit. **Paused Phase B implementation
   immediately** per explicit instruction, cleaned up a test write, and
   did not redeploy or overwrite anything further.
9. **User provided the live Apps Script source directly.** Compared
   against the local working tree (which still had the uncommitted
   Phase B edits) — confirmed byte-for-byte match on every checked marker
   (dispatcher, tax-fix comment, all Phase B functions). Conclusion: live
   backend == local working tree, exactly.
10. **Sync commit made** (`89e6948`, "Sync repo with live Apps Script
    Phase B backend") — this makes git match production; it does not
    deploy anything new. Pushed. **GitHub Pages deployed successfully
    this time** (confirmed via live `curl`, both the version bump and the
    actual disabled-path/Phase-B content).

**Current state: Phase A and Phase B are both fully live and confirmed
working in production.** Trades' own add/edit/delete remains intentionally
disabled (that's the P0 item still pending its own composite-key fix).

Full detail + evidence for every step above: `docs/TECHNICAL_DEBT.md` —
"Persistence architecture" section, and "Tax calculation" section.

---

## 6. Outstanding Work

**P0 (correctness, do next):**
- **Trades' own add/edit/delete still disabled.** Needs the same fix
  Journal/Notes already got: a composite-key-matched write/read (either
  extend `handleUpsertTradeMeta_`'s pattern to cover the core trade
  fields too, or design a separate mechanism) — this is genuinely
  different from Journal/Notes because it would mean *editing derived
  facts*, not just annotations, which only makes sense if it's coupled
  to fixing the source row in `"פעולות"` too (see Phase D discussion,
  §1/§5). Needs a product decision before implementation, not just a
  code fix.
- **`seedToSheets()`'s dormant `seedAll` path** — writes to the legacy
  `Trades` sheet only when zero trades exist (never fires in current
  production data, but is a latent instance of the same bug class).
- Confirm live Apps Script deployment matches git going forward — now
  that a "sync commit" precedent exists, re-verify after any future
  manual redeploy rather than assuming git is ahead.

**P1 (reliability):**
- Switch service worker to network-first for `index.html`/`js/*.js`.
- Resolve fate of `Script.html`/`Style.html`/`AppScript_PATCH.gs`.
- Some form of manual smoke-test checklist post-deploy.
- Understand the GitHub Pages deployment-failure root cause more
  definitively if it recurs (only a hypothesis was confirmed useful —
  rate-limiting — not a certain root cause).

**P2 (product, explicitly deferred until persistence work is settled):**
- **Settings Functionality Audit → implementation.** Full classification
  already done (§3) — decide per-control: keep, wire up, hide, or remove.
- Phase C (Quick Trade's buy tab → `upsertPositionMeta`, frontend-only,
  endpoint already exists).
- Phase 5 continuation (5c: `.s-input` unification; 5d: `confirm()` →
  styled modal; 5e: skeleton loading states; 5f: Journal filter bar).
- Verify Polygon is fully unwired; decide its long-term fate.

**P3 (deferred, explicitly out of scope unless asked):** automated tests;
real-time price streaming; verify PWA icon assets exist; Phase D (writing
real trades to `"פעולות"` from the app).

Full detail: `docs/ROADMAP.md`.

---

## 7. Technical Debt

- **Persistence architecture — see §1/§4/§5.** Full audit, root cause,
  and fix status in `docs/TECHNICAL_DEBT.md` — "Persistence architecture."
- **Tax calculation — fixed, redeployed, confirmed live.** See §5.
- **Trades' own CRUD still disabled** pending its own fix (P0, §6).
- **~25 decorative Settings controls** — audited, not yet acted on (P2, §6).
- **Auth fully bypassed** — real, live exposure if used beyond a trusted
  device. Deliberate, not a bug.
- **Cache-first service worker** requires manual cache-version bumps.
- **`Script.html`/`Style.html`/`AppScript_PATCH.gs`** — likely dead,
  unconfirmed, not removed.
- **Polygon/Yahoo price-provider code** present but fully unwired —
  intentional "disabled, not deleted" debt.
- **No automated tests whatsoever.**
- **No build step/bundler.**
- **Hardcoded `API_URL`** in `js/api.js`.
- **The trader may redeploy Apps Script directly from local disk**,
  ahead of any git commit — always verify live behavior, don't assume
  git HEAD reflects production, and don't assume production reflects the
  last thing *you* wrote either.

Full detail: `docs/TECHNICAL_DEBT.md`.

---

## 8. Development Rules

**Local development, read first:** project root is
`/Users/idansorojon/Desktop/claude/fifo/files` (note nested `files/`).
`python3 -m http.server` fails here — use the `.claude/launch.json`
preview config named exactly **`"fifo-pro"`** (port 5176). ⚠️ The same
launch.json also has `"trading-dashboard"` and `"dana-care-app"` for
*unrelated* sibling projects. Before testing any change, clear the
service worker + caches via `preview_eval` (see `docs/DEVELOPMENT_RULES.md`)
or you'll be looking at stale cached code. The local preview talks to the
real, live Apps Script backend — there is no mock; test data changes are
real. `node` is not available in this shell (no `node --check` for
syntax-verifying `.gs`/`.js` edits — use brace/paren-balance counts and
careful reading instead).

- **Diagnose before fixing** — reproduce in a real browser before
  changing code. This session, "one bug" repeatedly turned out to be a
  much broader pattern once actually investigated (position bug → full
  persistence audit).
- **Small, targeted diffs.**
- **Disable, don't delete**, when reverting/pausing something — a single
  early-return should be reversible later without reconstructing logic.
- **Verify in a real browser** before claiming a UI fix is done.
- **Verify the live deployment separately** — local correctness ≠
  GitHub Pages rebuilt ≠ Apps Script redeployed. `curl` the live URL
  after every push. **This session, GitHub Pages itself failed once for
  no code-level reason** — verify the actual deployment status, not just
  that you pushed.
- **Never write live test data into production without cleaning it up
  immediately** — this session, a Phase B verification test wrote
  `lesson: 'TEST-VERIFY'` onto a real trade; it was reverted via the same
  endpoint within the same turn, confirmed via a follow-up read.
- **Ask before large destructive actions.**
- **Never change `API_URL`, Apps Script endpoint contracts, or
  `utils.js`'s trading-math functions** without explicit permission.
- **RTL Hebrew UI, existing CSS variables/classes, existing hub→tab
  pattern** — match, don't introduce new paradigms.
- **New heavy content renders lazily on tab-open**, never eagerly at boot.
- **No new emoji in the UI** — use the SVG sprite (`icon(name)` helper
  from JS, direct `<use>` reference from static HTML).
- **When matching derived data server-side, never use a synthetic/
  regenerated id — always a stable, content-derived key** (this
  session's central lesson, see §1/§4).

Full detail + verification checklist: `docs/DEVELOPMENT_RULES.md`.

---

## 9. Git Status

_As observed at handoff time — verify freshly, don't trust this if time
has passed:_

- Repo: `idansorojon-cell/fifo-pro-v2`, remote `origin`, single branch
  `main`.
- Working tree clean after the last push this session.
- Recent commits (newest first): `89e6948` (sync repo with live Apps
  Script Phase B backend), `21ab2b3` (Phase A: disable every
  fake-persistence write path), `7fe934a` (Phase 5b: native date
  fields), `0006fcc` (document Settings audit as future phase), `7a8eb53`
  (fix tax calculation), `f4bcdbb` (Phase 5a: icon migration + empty-state
  de-dup), plus earlier Phase 2–4 design-system commits from the prior
  session.
- Live production confirmed synced with `89e6948` — both frontend
  (`sw.js` → `fifopro-v13`) and backend (Apps Script already had this
  exact code before the commit existed, per §5 point 8–9).

---

## 10. Critical Context (do not rediscover these)

- **The persistence architecture is one incomplete migration, not four
  bugs** — see §1/§4/§5. Don't propose or implement a one-off patch for
  a "new" disappearing-data symptom without first checking whether it's
  the same root cause (legacy-sheet write + synthetic-id match + no
  read-side merge).
- **Never match derived trades/positions by a synthetic/regenerated id.**
  Always a stable, content-derived key — symbol for positions, the
  composite `symbol+buy_date+sell_date+qty+buy_price+sell_price` for
  trades. This is the one thing that already worked (position meta) and
  the one thing every broken path skipped.
- **Tax formula: `tax = gross × 0.25`, unconditionally** — a losing trade
  gets a *negative* tax (25% offset). Do not clamp to 0 on losses — that
  was a real, fixed bug (see §5) that silently understated every loss.
- **Trades' own add/edit/delete are deliberately disabled right now** —
  not a bug, don't silently re-enable without the composite-key fix.
  Quick Trade's submit and brand-new-position creation are disabled for
  the same reason.
- **Position editing IS supposed to work** for target/stop/notes on an
  *existing* FIFO-derived position — qty/avg_price/symbol/date are
  deliberately read-only there now, not a regression.
- **Journal and Trade Notes now genuinely persist** (Phase B) — this is
  a fix, not new fragile behavior; don't revert to the old
  `updateTrade`-based path.
- **The trader may paste-redeploy `AppScript_FULL.gs` directly from local
  disk, bypassing git entirely, sometimes before a commit exists** —
  confirmed this session. Always verify live backend behavior directly
  (a read-only GET action) rather than assuming git HEAD matches
  production, in either direction.
- **GitHub Pages can fail to deploy for no discoverable code-level
  reason** (confirmed once this session, likely a build-rate-limit from
  a burst of commits) — if a push doesn't show up live, check deployment
  status before assuming the code is broken; a retry may just work.
- **Settings' ~25 decorative controls are audited and documented, not a
  mystery to re-investigate** — see §3/§6, `docs/TECHNICAL_DEBT.md`.
  Deferred until persistence work is done, per explicit instruction.
- **Auth bypass is deliberate**, Finnhub is the sole price provider by
  explicit final instruction, day-change % must come from the backend's
  `changePctValid` flag, alert dedup key is `symbol+type+threshold` —
  all unchanged from prior sessions, still true.
- **Verification standard on this project is "curl the live URL / call
  the live endpoint directly and check the actual response,"** not "the
  local diff looks correct" or "the code should work."
- **Preview-tool naming collision:** always launch the local preview with
  the exact name `"fifo-pro"`.

---

## 11. Engineering Review (recommendations only — not implemented)

Carried forward from the prior handoff, still valid, plus one addition:

- The no-build, manually-ordered-`<script>`-tags approach and the
  single-Apps-Script-file backend still work fine at this size but carry
  the same long-term risks noted previously (no dependency enforcement,
  one large `.gs` file with no test coverage).
- **New this session:** the persistence-architecture incident is a
  concrete argument for *some* form of automated backend smoke test —
  even a simple script that calls `getOperations` and asserts a known
  trade's journal fields round-trip correctly would have caught the
  original Journal bug immediately, rather than requiring a user report
  and a multi-step audit. Worth real consideration given how much this
  exact class of bug just cost in investigation time — but still not
  scheduled, per "no automated tests" being explicitly out of scope
  unless asked.
- Everything else from the prior review (script-splitting, `clasp` for
  automated backend deploys, cache-strategy fix, scalability notes)
  remains valid and unimplemented.
