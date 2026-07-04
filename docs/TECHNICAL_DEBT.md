# FIFO PRO — Technical Debt & Known Limitations

## Tax calculation — losing trades were not receiving their 25% tax offset (FIXED, redeployed and confirmed live by the trader)

**Found via a full-history audit** (user noticed May 2026's net total didn't
match their original manual spreadsheet by exactly $2,875.00). A programmatic,
field-by-field comparison between the hardcoded `SEED` array in `js/app.js`
(108 historical trades, a snapshot of the original data) and the live
FIFO-derived trades confirmed **zero discrepancies in any identifying field**
(symbol, buy/sell date, qty, buy/sell price) or in `gross` — ruling out FIFO
lot-matching order, source data, and import-process explanations entirely.
The only mismatches (28 of 108 trades, spanning 11 months and 10 symbols,
totaling $9,585.78) were every single losing trade (`gross < 0`), where the
live engine showed `tax: 0` instead of the negative (offsetting) tax the
original data and `CLAUDE.md`'s own documented formula (`tax = gross × 0.25`,
no sign condition) both call for.

**Root cause:** `applyFIFO_()` in `AppScript_FULL.gs` computed
`tax = gross > 0 ? round(gross * 0.25, 2) : 0` — clamping tax to zero on
losses instead of applying the same 25% rate symmetrically. This meant every
losing trade's `net` understated the loss's actual after-tax severity (i.e.
the trade looked worse than it should) by exactly 25% of its loss magnitude,
compounding across the entire trade history.

**Fix implemented:** removed the `gross > 0 ?` condition —
`tax = round(gross * 0.25, 2)` unconditionally, so a losing trade gets a
negative tax (a 25% offset) and `net = gross - tax` moves back toward zero,
matching both the documented formula and the original historical data
exactly. `gross`, FIFO lot-matching, commission handling, and every other
field are **unchanged** — this is a single-line, tax-sign-only fix.

**Verified before redeploy** by simulating the corrected formula in the
browser against the live (pre-fix) trade data (since `gross` is identical
either way and commissions are confirmed zero throughout the dataset):
May 2026's total moves from $27,979.99 to **$30,854.99** (exactly matching
the user's manual spreadsheet), and the full-history total moves by
**+$9,585.77** (matches the audit's independently-computed $9,585.78 to
within a cent, the difference being rounding order — 28 trades rounded
individually vs. 110 trades summed then rounded once).

**Status:** backend-only change (`AppScript_FULL.gs`) — manually redeployed
and confirmed live by the trader. Since `getOperations` recomputes trades
from the raw transaction log on every load (nothing is stored), the fix
took effect **retroactively across all history** the moment it was
redeployed — every past month's displayed total shifted upward, with no
data migration needed.

## Data integrity — position target/stop/notes silently dropped (FIXED, pending backend redeploy)

**Confirmed live via direct API calls against production** (`curl`'ing
`getOperations` and `getPositions` on the live Apps Script URL): the
primary data path (`getOperations`, tried first by `js/api.js`'s
`loadAll()`) derives open positions fresh on every load via FIFO matching
over a raw transactions log (`"פעולות"` sheet), hardcoding `target`,
`stop_loss`, and `notes` to `''` (`applyFIFO_` in `AppScript_FULL.gs`).
The real, currently-open positions (QBTX, ONDL) confirmed this — both
came back with those three fields blank. Meanwhile the position edit
modal (`Positions.submit()` in `js/positions.js`) wrote those fields to a
*separate*, legacy `Positions` sheet keyed by a numeric `id` — and that
sheet's one existing row (OKLL) wasn't even one of the two real open
positions, and its `id` was a small integer with real collision potential
against the synthetic per-load ids `applyFIFO_` hands out (1, 2, ...).
**The actual risk was worse than "values don't round-trip"**: an edit
could have silently overwritten an unrelated row that happened to share
the same small integer id, and the frontend's status message
(`res.ok ? '✓ ...' : '✓ נשמר מקומית'`) reported success on the UI
regardless of whether the backend call actually succeeded — so this was
invisible by design, not just by omission.

**Fix implemented (this session):**
- `mergePositionMeta_()` (new, `AppScript_FULL.gs`) — overlays
  `target`/`stop_loss`/`notes` from the legacy `Positions` sheet onto
  `getOperations`-derived positions, matched by **symbol**, called from
  `handleGetOperations_` right after `applyFIFO_`.
- `handleUpsertPositionMeta_()` (new endpoint, `upsertPositionMeta`) —
  finds-or-creates a row **by symbol**, not id, eliminating the id-collision
  risk entirely. Existing endpoints (`addPosition`/`updatePosition`/
  `deletePosition`/`getPositions`) are **untouched** — nothing about the
  legacy fallback path changed.
- `js/positions.js`'s `submit()` now calls `API.upsertPositionMeta()` and
  **surfaces real failures** (`❌ <error>`) instead of always reporting
  success — verified live: with the (still unpatched) production backend,
  the app now correctly shows `❌ Unknown action: upsertPositionMeta`
  instead of a false green checkmark.

**Status:** frontend fix ships automatically on `git push`. **Backend fix
requires a manual Apps Script redeploy** (paste `AppScript_FULL.gs` into
script.google.com, new deployment version) before target/stop/notes
actually save in production — until then, the app will correctly show the
`Unknown action` error above rather than silently losing data, which is a
strict improvement over the previous silent-failure state even
pre-redeploy.

**Deliberately not touched:** deleting a position that came from
`getOperations` — that's a separate, pre-existing UX question (the
position would likely just reappear on the next load since it's derived
from the trade log), out of scope for this fix.

## Persistence architecture — incomplete data-model migration (Phase A shipped, Phase B next)

### The full picture

FIFO PRO migrated its primary data model once, from plain CRUD sheets
(`Trades`/`Positions`, edited by row id) to data **derived fresh on every
load** from a raw transaction log (`"פעולות"`, via `applyFIFO_`). Exactly
one write path was updated to bridge old and new: position
`target`/`stop_loss`/`notes`, via `mergePositionMeta_`/`upsertPositionMeta`,
matched by **symbol** (not id). Every other write path in the app still
wrote into the pre-migration sheets, using pre-migration assumptions,
and the new read path was never taught to look at any of them. A key
supporting fact: **there is no handler anywhere in `AppScript_FULL.gs`
that writes to `"פעולות"` itself** — `getOperationsSheet_()` is called
exactly once, read-only, from `handleGetOperations_`. The one sheet the
primary read path actually trusts can only be edited by hand.

Full per-module trace (write path -> read path -> outcome):

| Module | Write path | Read path | Outcome |
|---|---|---|---|
| Trades (add/edit) | `addTrade`/`updateTrade` -> legacy `Trades` sheet, **by id** | `getOperations` -> `applyFIFO_`, never reads `Trades` | ❌ Broken — invisible after refresh |
| Trades (delete) | `deleteTrade`, **by id** | same | ❌ Broken, **and the one with real corruption risk** — see below |
| Journal (entry/exit reason, respected stop, followed plan, lesson, emotion) | `updateTrade` -> legacy `Trades` sheet, by id | `applyFIFO_` **hardcodes all 6 fields to `''`** — no merge function exists for them at all | ❌ Broken, deterministically, for every trade — this is why the Journal table always shows "—" |
| Trade Notes | `updateTrade` -> legacy `Trades` sheet | `applyFIFO_` populates `notes` from the raw `"פעולות"` row's own notes column, **not** the legacy `Trades` sheet | ❌ Broken, same shape as Journal |
| Positions — target/stop/notes on an *existing* derived position | `upsertPositionMeta`, **by symbol** | `mergePositionMeta_` overlays these 3 fields by symbol | ✅ Fully persistent — the one path already fixed |
| Positions — qty/avg_price on an *existing* position | `upsertPositionMeta` writes them too | `mergePositionMeta_` **deliberately never reads them back** | ❌ Broken, silently — fake success, input discarded on reload |
| Positions — brand-new symbol, no FIFO lot | `upsertPositionMeta`, new row | never derived, never merged | ❌ Broken — the originally-reported "New Position" bug |
| Positions — Quick Trade "buy" tab | `addPosition` (the **old**, id-keyed endpoint, not the fixed one) | same as above | ❌ Broken, and a **second, still-unpatched** id-collision risk |
| Quick Trade "sell" tab | `addTrade` -> legacy `Trades` sheet | same as Trades add | ❌ Broken — phantom trade |
| Watchlist | `addWatchlist`/`removeWatchlist` -> `Watchlist` sheet, by symbol | `getWatchlist` -> same sheet, same key | ✅ Fully persistent — never went through the migration, single sheet/key throughout |
| Goals (monthly) | `setGoal` -> `Settings` sheet, key `goal` | `getGoal` -> same sheet, same key | ✅ Fully persistent |

**Trades' edit/delete path is the one elevated to P0**, independent of the
others: `findRowById_` matches by numeric id, the exact mechanism already
proven risky and replaced for positions. The legacy `Trades` sheet (108
rows, ids 1-108, a one-time mirror from the original `seedAll` import)
currently aligns numerically with the FIFO-derived list's synthetic ids
only because both were built from the same original chronological order —
coincidental, not structural, and it has already partially drifted (the 2
newest trades, ids 109-110, have no legacy row at all). Real financial
data, silent-corruption potential, and the single most-used CRUD action in
the app is a combination that outranks the "just invisible after refresh"
bugs on its own.

### Unified fix strategy (agreed)

Two sources of truth going forward, not one: `"פעולות"` + `applyFIFO_`
remain sole authority for transactional facts (what happened, what was
earned) — untouched, and the app will **not** be given write access to it
in this round (it's the actual source of P&L truth, may live in a
different spreadsheet, and the trader edits it by hand — concurrent
app-writes are a new failure mode not worth introducing for this fix).
Annotations (journal, notes, target/stop/notes) get a generalized version
of the one pattern that already works: overlay by a **stable, content-
derived key** (symbol for positions; a composite
`symbol+buy_date+sell_date+qty+buy_price+sell_price` key for trades,
proven unique across the full 108-trade history during the tax audit),
never a synthetic/regenerated id.

Phases: **A** (frontend-only, disable every fake-persistence path — this
section) -> **B** (backend, generalize the annotation pattern to trades:
new `upsertTradeMeta` + `mergeTradeMeta_`) -> **C** (frontend-only, point
Quick Trade's "buy" tab at the already-existing `upsertPositionMeta`) ->
**D** (optional/future, writing real trades to `"פעולות"` itself — its own
design conversation, not scheduled) -> **E** (Settings fake-controls
cleanup, after persistence is safe, per explicit instruction) -> **F**
(remaining Phase 5 UI polish).

### Phase A — shipped this commit

Every fake-persistence path disabled at its UI entry point (not deleted —
original logic kept in place behind an early `return`, as a reference for
Phase B/D):

- `Trades.openAddForm()` / `openEdit()` / `submit()` / `remove()` — all
  four now show a toast explaining why and do nothing else.
- `Journal.openModal()` / `save()` / `openNote()` / `saveNote()` — same,
  all four.
- `Positions.openForm()` (new position) — disabled. `Positions.submit()`
  gets a guard for the same case (defense-in-depth). `Positions.openEdit()`
  for an *existing* derived position is **unaffected** — target/stop/notes
  remain fully editable via the already-correct `upsertPositionMeta` path.
- `Positions.remove()` — disabled. Found in passing: the old code showed a
  green "✓ נמחק מקומית" success message even when the API call failed —
  exactly the fake-success pattern this phase exists to eliminate.
- Position modal's symbol/date/qty/avg-price inputs are now `disabled`
  (grayed, with an explanatory note) for the same reason —
  they were already silently discarded on save; now they can't be typed
  into at all.
- `QuickTrade.submit()` — disabled entirely (both the buy and sell
  branches); the calculator/preview above it (`calc()`) is unaffected,
  since it never persisted anything.
- All corresponding buttons get a shared `.action-disabled` CSS class
  (dimmed, `cursor:not-allowed`) plus an updated `title` tooltip, so the
  disabled state is visible at rest, not just on click.

**Verified, not assumed:** every one of the above was actually invoked in
the running app (via `preview_eval`, not just read in source) and
confirmed to (a) show the explanatory toast, (b) leave `APP.trades`/
`APP.positions` byte-for-byte unchanged, and (c) never open a modal that
can't do anything useful. Editing an *existing* position's target/stop/
notes was separately confirmed still fully functional. Checked at both
desktop and mobile (375x812).

**Not yet done:** Phase B (real trade/journal/notes persistence via
`upsertTradeMeta`/`mergeTradeMeta_`) — see ROADMAP.md.

## Security

- **Authentication is fully bypassed** (`AUTH_DISABLED = true` in
  `js/auth.js`, `js/api.js`, and `AppScript_FULL.gs`). The login screen is
  removed from the DOM entirely. Anyone with the Apps Script Web App URL
  can read/write all trades, positions, and watchlist data, and can call
  `getPrices`/AI Chat. This was an explicit, deliberate request (for
  debugging convenience) — but it is a real, live exposure and should be
  the first thing addressed if this app is used beyond a single trusted
  device. See "Restoring authentication" below.
- The session-token/password-hash auth system underneath is otherwise
  intact and was working correctly before being bypassed — it does not
  need to be rebuilt, just re-enabled.

### Restoring authentication
1. In `AppScript_FULL.gs`: set `AUTH_DISABLED = false`. Ensure
   `LOGIN_PASSWORD` is set in Script Properties (as a `__hash__:<sha256>`
   value, or plaintext for first-run auto-hashing — see `handleLogin_`
   comments).
2. In `js/auth.js` and `js/api.js`: set `AUTH_DISABLED = false`.
3. Restore the login overlay markup in `index.html` (was removed, not just
   hidden — check git history around the "Remove login completely" commit
   for the exact markup to reintroduce, or rebuild from `auth.js`'s
   `showLoginScreen()`/`hideLoginScreen()` which still reference
   `#login-overlay`/`#login-password`/`#login-btn`/`#login-error` by ID).
4. Redeploy Apps Script (manual step, see PROJECT_OVERVIEW.md — Deployment).

## Service worker cache strategy

Cache-first for all static assets means **any future change to
`index.html` or `js/*.js` requires manually bumping `CACHE_NAME`/
`STATIC_CACHE` in `sw.js`**, or returning users get stuck on stale code
indefinitely. This already happened once this session. Nothing enforces
this — it's a manual discipline requirement (documented in
DEVELOPMENT_RULES.md), not a systemic fix.

**Recommended (not implemented) fix:** switch `index.html` and `js/*.js` to
a network-first (or stale-while-revalidate) strategy in the fetch handler,
so a code change is visible on next load without needing a manual cache
version bump. Cache-first would remain fine for the Chart.js CDN URl and
truly static images/icons.

## Root-level orphan files

`Script.html` and `Style.html` at the repo root are not referenced by
`index.html` and appear to be Apps Script HTML-service artifacts (possibly
from an earlier bound-script deployment approach that was abandoned in
favor of the current separate-Web-App architecture). They were
deliberately **not deleted** this session (out of scope of what was asked)
but are almost certainly dead weight. Confirm with the project owner
before removing.

`AppScript_PATCH.gs` is a legacy patch file, superseded by
`AppScript_FULL.gs`. Not deployed, not loaded by anything, kept for
historical reference only. Candidate for removal or an explicit
"deprecated" note at the top of the file.

## GitHub web-UI upload collisions

See CURRENT_STATUS.md's "Known repo hygiene issue." Repeated stale
re-uploads via the GitHub web UI fought against git pushes multiple times
this session. Root cause was never identified. **Recommended:** add a
short note to the top of the GitHub repo's README or to `CLAUDE.md`
instructing anyone (human or otherwise) to always use `git` for pushes to
this repo, never the web UI's "Add file → Upload files" flow, since it
does not merge — it silently overwrites whatever was last in that
uploader's local folder.

## Price provider churn

Polygon.io code (`fetchPolygonPrices_` in `AppScript_FULL.gs`) is fully
implemented and currently unused (disabled via not being called from
`handleGetPrices_`), left in place per instruction ("disabled, not
deleted") in case Polygon is revisited. This is intentional debt — if
Polygon is confirmed permanently abandoned, this ~150-line function and
its Script Properties reference (`POLYGON_API_KEY`) could be removed for
clarity. Same applies to the Yahoo Finance code path
(`fetchYahooBatch_`/`parseYahooResult_`/`fetchYahooChart_`), which is also
present-but-unused (`YAHOO_FALLBACK_ENABLED` Script Property gates it, and
it's currently never checked since Finnhub is called directly, not
through the old fallback chain).

## No automated tests

There is no test suite (unit, integration, or e2e) anywhere in this
project. All verification this session was done via manual browser testing
(Claude's preview tools) and direct `curl` checks against the deployed
site. Any regression must be caught by hand. This is a significant risk
for a financial-data application, even a personal one — a silent
miscalculation in `calcStats()` or the P&L formulas would not be caught by
anything automatically.

## No build step / no bundling

Every `js/*.js` file is loaded as a separate `<script>` tag in a specific,
manually-maintained order in `index.html`. Adding a new module means:
remembering to add both the `<script src="js/...">` line AND ensuring it
loads after its dependencies. There's no dependency graph enforcement.
This is a deliberate architectural choice (no build tooling, no
node_modules, simplest possible deploy story for GitHub Pages) — flagging
it as debt only in the sense that it doesn't scale gracefully if the app
keeps growing.

## Hardcoded deployment URL

`API_URL` in `js/api.js` is a hardcoded Apps Script exec URL. If the Apps
Script project is ever redeployed as a genuinely new deployment (not "new
version" of the existing one), this URL changes and must be manually
updated in `js/api.js` and pushed. `CLAUDE.md` already flags this as
requiring explicit permission to change — good, keep that rule.
