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

## Data integrity — position target/stop/notes silently dropped (FIXED, redeployed, confirmed live)

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

**Status:** both the frontend fix (shipped on `git push`) and the backend
fix (`AppScript_FULL.gs`, manually redeployed) are live. **Confirmed live
2026-07-05** via a direct, read-only API call: both real open positions
(QBTX, ONDL) return `target`/`stop_loss`/`notes` fields from the
`mergePositionMeta_` overlay (currently empty because the trader hasn't
set values for them yet, not because the merge is missing).

**Deliberately not touched:** deleting a position that came from
`getOperations` — that's a separate, pre-existing UX question (the
position would likely just reappear on the next load since it's derived
from the trade log), out of scope for this fix.

## Persistence architecture — incomplete data-model migration (Phase A and Phase B shipped, confirmed live; Trades' own CRUD still pending)

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
| Trades (add/edit) | `addTrade`/`updateTrade` -> legacy `Trades` sheet, **by id** — **disabled at the UI entry point since Phase A**, original logic kept behind an early `return` | `getOperations` -> `applyFIFO_`, never reads `Trades` | ⏸ Intentionally disabled, not silently broken — still needs its own composite-key fix + product decision (P0, unimplemented, see ROADMAP.md) |
| Trades (delete) | `deleteTrade`, **by id** — **disabled at the UI entry point since Phase A** | same | ⏸ Intentionally disabled — was the one path with real corruption risk before being disabled |
| Journal (entry/exit reason, respected stop, followed plan, lesson, emotion) | `upsertTradeMeta` -> legacy `Trades` sheet, matched by a **composite key** (`symbol+buy_date+sell_date+qty+buy_price+sell_price`) — **Phase B** | `mergeTradeMeta_()` overlays all 6 fields by the same composite key | ✅ Fixed (Phase B) — confirmed live 2026-07-05 via direct API check; genuinely persists now |
| Trade Notes | `upsertTradeMeta`, same composite key — **Phase B** | `mergeTradeMeta_()`, same overlay | ✅ Fixed (Phase B) — confirmed live 2026-07-05, same shape as Journal |
| Positions — target/stop/notes on an *existing* derived position | `upsertPositionMeta`, **by symbol** | `mergePositionMeta_` overlays these 3 fields by symbol | ✅ Fully persistent — confirmed live 2026-07-05 via direct API check |
| Positions — qty/avg_price on an *existing* position | **disabled at the UI since Phase A** — inputs are now `disabled`, can no longer be typed into | n/a | ⏸ Intentionally disabled — was silently discarding input before being disabled |
| Positions — brand-new symbol, no FIFO lot | **disabled at the UI since Phase A** — creation blocked with an explanation | n/a | ⏸ Intentionally disabled — was the originally-reported "New Position" bug |
| Positions — Quick Trade "buy" tab | **disabled at the UI since Phase A** — `QuickTrade.submit()`'s buy branch disabled entirely | n/a | ⏸ Intentionally disabled — was a second, unpatched id-collision risk; Phase C (point it at `upsertPositionMeta`) still pending |
| Quick Trade "sell" tab | **disabled at the UI since Phase A** — `QuickTrade.submit()`'s sell branch disabled entirely | n/a | ⏸ Intentionally disabled — was a phantom-trade bug |
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
bugs on its own. **Since Phase A, this path is disabled rather than
silently live** — the corruption risk is neutralized for now, but the
feature gap (no way to edit/delete a trade at all) remains open and is
still the top P0 item; see ROADMAP.md.

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

Phases: **A** ✅ shipped, confirmed live (frontend-only, disable every
fake-persistence path — see below) -> **B** ✅ shipped, confirmed live
(backend, generalize the annotation pattern to trades: new
`upsertTradeMeta` + `mergeTradeMeta_` — see below) -> **C** (not started,
frontend-only, point Quick Trade's "buy" tab at the already-existing
`upsertPositionMeta`) -> **D** (optional/future, writing real trades to
`"פעולות"` itself — its own design conversation, not scheduled) -> **E**
(Settings fake-controls cleanup, after persistence is safe, per explicit
instruction) -> **F** (remaining Phase 5 UI polish). Trades' own
add/edit/delete is intentionally not part of this phase list — it needs
its own product decision (see ROADMAP.md P0) before it can be scheduled
as a phase.

### Phase A — shipped, confirmed live

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

**Followed immediately by:** Phase B, below — also confirmed live.

### Phase B — shipped, confirmed live

New `upsertTradeMeta` endpoint (`AppScript_FULL.gs`) and
`mergeTradeMeta_()` read-side merge, generalizing the position-meta
pattern to trades via the same kind of stable, content-derived key:
`symbol+buy_date+sell_date+qty+buy_price+sell_price`, proven unique
across the full 108-trade history during the tax audit.
`js/api.js`/`js/journal.js` redirected to the new endpoint.

**The deployment path here was unusual and is worth recording.** While
verifying Phase B against the live backend, the live Apps Script was
found to **already have this exact code** — traced to the trader copying
`AppScript_FULL.gs` directly off local disk (not via git) and
redeploying, ahead of any commit for it. Implementation was paused
immediately per explicit instruction, a test write (`lesson:
'TEST-VERIFY'` on a real trade) was reverted via the same endpoint, and
nothing further was redeployed. The trader then provided the live Apps
Script source directly; it was compared byte-for-byte against the local
working tree (which still had the uncommitted Phase B edits) on every
checked marker (dispatcher, tax-fix comment, all Phase B functions) —
confirmed identical. A sync commit (`89e6948`, "Sync repo with live Apps
Script Phase B backend") was made to bring git in line with what was
already live; **it deployed nothing new.**

**Verified live** (2026-07-05, via a direct read-only `curl` against the
live Apps Script `exec` URL): `getOperations` returns `entry_reason`/
`exit_reason`/`respected_stop`/`followed_plan`/`lesson`/`emotion` on
every trade — the fields exist and are populated by the merge, just not
yet filled in by the trader for historical trades.

**Not yet done:** Trades' own add/edit/delete (still disabled per Phase
A, pending its own composite-key fix and a product decision — see
ROADMAP.md P0) and Phase C (Quick Trade's buy tab → `upsertPositionMeta`).

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
