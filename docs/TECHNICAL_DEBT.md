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

## Persistence architecture — incomplete data-model migration (Phase A, B, Stability Sprint write-through create-only, and Delete Position all shipped, confirmed live; only Trades' own edit/delete still pending)

### The full picture

FIFO PRO migrated its primary data model once, from plain CRUD sheets
(`Trades`/`Positions`, edited by row id) to data **derived fresh on every
load** from a raw transaction log (`"פעולות"`, via `applyFIFO_`). At the
time of the persistence audit, exactly one write path had been updated
to bridge old and new: position `target`/`stop_loss`/`notes`, via
`mergePositionMeta_`/`upsertPositionMeta`, matched by **symbol** (not
id). Every other write path in the app wrote into the pre-migration
sheets, using pre-migration assumptions, and the new read path was never
taught to look at any of them. At that time, **there was no handler
anywhere in `AppScript_FULL.gs` that wrote to `"פעולות"` itself** —
`getOperationsSheet_()` was called exactly once, read-only, from
`handleGetOperations_`.

**This changed in the Stability Sprint session** (see "Write-through
create-only paths" below): after investigating the *original* design of
New Position / Add Trade / Quick Trade (they were never designed around
`"פעולות"` — they were built when the app's only data model was plain
CRUD on `Trades`/`Positions`, and worked correctly then; the migration
to `"פעולות"`-derived reads simply never updated them), the decision was
made to make `"פעולות"` genuinely writable for **new** facts only.
`handleAppendOperation_`/`handleAddTradeOperation_` now append real
BUY/SELL rows. Editing or deleting an *already-recorded* row is still
out of scope — `"פעולות"` remains hand-edited-only for corrections.

Full per-module trace (write path -> read path -> outcome):

| Module | Write path | Read path | Outcome |
|---|---|---|---|
| Trades (add) — brand-new closed trade | `addTradeOperation` -> appends a matched **BUY+SELL pair straight to `"פעולות"`** — **Stability Sprint write-through** | `getOperations` -> `applyFIFO_`, derives it like any other trade | ✅ Fixed — confirmed live 2026-07-05, survives a full page refresh |
| Trades (edit/delete of an *already-recorded* trade) | `updateTrade`/`deleteTrade` -> legacy `Trades` sheet, **by id** — **still disabled at the UI entry point**, original logic kept behind an early `return` | `getOperations` -> `applyFIFO_`, never reads `Trades` | ⏸ Intentionally disabled, not silently broken — deliberately out of scope for the write-through phase (mutating a fact FIFO has already lot-matched is a harder problem than appending a new one) — still needs its own product decision (P0, see ROADMAP.md) |
| Journal (entry/exit reason, respected stop, followed plan, lesson, emotion) | `upsertTradeMeta` -> legacy `Trades` sheet, matched by a **composite key** (`symbol+buy_date+sell_date+qty+buy_price+sell_price`) — **Phase B** | `mergeTradeMeta_()` overlays all 6 fields by the same composite key | ✅ Fixed (Phase B) — confirmed live 2026-07-05 via direct API check; genuinely persists now |
| Trade Notes | `upsertTradeMeta`, same composite key — **Phase B** | `mergeTradeMeta_()`, same overlay | ✅ Fixed (Phase B) — confirmed live 2026-07-05, same shape as Journal |
| Positions — target/stop/notes on an *existing* derived position | `upsertPositionMeta`, **by symbol** | `mergePositionMeta_` overlays these 3 fields by symbol | ✅ Fully persistent — confirmed live 2026-07-05 via direct API check |
| Positions — qty/avg_price on an *existing* position | **disabled at the UI since Phase A** — inputs are now `disabled`, can no longer be typed into | n/a | ⏸ Intentionally disabled — was silently discarding input before being disabled |
| Positions — brand-new symbol, no FIFO lot ("New Position") | `appendOperation` -> appends a **BUY row straight to `"פעולות"`** — **Stability Sprint write-through** | `getOperations` -> `applyFIFO_`, derives it like any other position | ✅ Fixed — confirmed live 2026-07-05, survives a full page refresh; symbol/date/qty/price fields are only editable in the "new position" case, still read-only when editing an existing derived position |
| Positions — delete | `appendOperation` -> appends a **SELL of the full remaining quantity at the position's own `avg_price`** (cost basis) straight to `"פעולות"` — **Functional Cleanup, pure-addition correction** | `getOperations` -> `applyFIFO_`, the position closes out naturally since its lot is now fully consumed | ✅ Fixed — confirmed live 2026-07-05; gross/tax/net land at exactly $0 since sell price equals buy price; works because an *open* position's lot is still available in FIFO's bookkeeping (unlike a closed trade's lot, already consumed by its own matching sell — see "Trades' own edit/delete" below for why this same trick doesn't extend there) |
| Quick Trade "buy" tab | `appendOperation` -> appends a **BUY row straight to `"פעולות"`**, same endpoint as New Position — **Stability Sprint write-through** | same as above | ✅ Fixed — confirmed live 2026-07-05 |
| Quick Trade "sell" tab | `appendOperation` -> appends a **SELL row straight to `"פעולות"`**, matched against existing open lots by `applyFIFO_` server-side (no buy price/date needed from the form) — **Stability Sprint write-through** | `getOperations` -> `applyFIFO_` | ✅ Fixed — confirmed live 2026-07-05; rejects a SELL that exceeds the real open FIFO quantity for that symbol |
| Watchlist | `addWatchlist`/`removeWatchlist` -> `Watchlist` sheet, by symbol | `getWatchlist` -> same sheet, same key | ✅ Fully persistent — never went through the migration, single sheet/key throughout |
| Goals (monthly) | `setGoal` -> `Settings` sheet, key `goal` | `getGoal` -> same sheet, same key | ✅ Fully persistent |

**Trades' edit/delete path (of an already-recorded trade) is the one
elevated to P0**, independent of the others: `findRowById_` matches by
numeric id, the exact mechanism already proven risky and replaced for
positions. The legacy `Trades` sheet (108 rows, ids 1-108, a one-time
mirror from the original `seedAll` import) currently aligns numerically
with the FIFO-derived list's synthetic ids only because both were built
from the same original chronological order — coincidental, not
structural, and it has already partially drifted (the 2 newest trades,
ids 109-110, have no legacy row at all). Real financial data, silent-
corruption potential, and the single most-used CRUD action in the app is
a combination that outranks the "just invisible after refresh" bugs on
its own. **Since Phase A, this path is disabled rather than silently
live** — the corruption risk is neutralized for now, but the feature gap
(no way to edit/delete a trade at all) remains open and is still the top
P0 item; see ROADMAP.md. **This is unaffected by the Stability Sprint
write-through work below**, which deliberately only restored *creating*
new facts (Add Trade, New Position, Quick Trade) — mutating an
already-recorded row is a different, harder problem (see "The full
picture" above) and still needs its own product decision.

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
`upsertTradeMeta` + `mergeTradeMeta_` — see below) -> **Write-through
create-only (Stability Sprint)** ✅ shipped, confirmed live — after
investigating the *original* design of New Position/Add Trade/Quick
Trade (they predate `"פעולות"` entirely and were never designed around
it — see below), the decision was made to make `"פעולות"` genuinely
writable for new facts: New Position and Quick Trade Buy append a BUY
row, Quick Trade Sell appends a SELL row, Add Trade appends a matched
BUY+SELL pair. This supersedes the originally-planned Phase C (Quick
Trade's buy tab → `upsertPositionMeta`) with a more complete fix. **E**
(Settings fake-controls cleanup, after persistence is safe, per explicit
instruction) -> **F** (remaining Phase 5 UI polish). Trades' own
edit/delete of an *already-recorded* trade, and Delete Position, are
intentionally not part of this phase list — they need their own product
decision (see ROADMAP.md P0) before they can be scheduled as a phase.

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

**Not yet done (as of Phase B):** New Position, Quick Trade, and Add
Trade were all still disabled per Phase A — fixed in the Stability
Sprint session below. Trades' own edit/delete of an *already-recorded*
trade remains disabled, pending a product decision — see ROADMAP.md P0.

### Write-through create-only paths (Stability Sprint) — shipped, confirmed live

**Investigated before implementing anything:** rather than assume New
Position/Add Trade/Quick Trade needed a new architecture, their git
history was traced back to the very first commit of `AppScript_FULL.gs`
(2026-06-16, before `"פעולות"`/`applyFIFO_` existed in the web app at
all). At that point `handleAddTrade_`/`handleGetTrades_` and
`handleAddPosition_`/`handleGetPositions_` read and wrote the **same**
sheet, matched by the **same** id — a genuinely closed, correct loop.
`"פעולות"`/`applyFIFO_` was introduced later (commit `82d28ff`,
2026-07-02) as an **additive, documented fallback** (`js/api.js`'s
`loadAll()` comment: "Try getOperations first... Falls back to the
legacy getTrades + getPositions endpoints if not available") — the old
write endpoints were never removed or modified, they simply became
orphaned once `"פעולות"` was permanently present and the fallback path
stopped being exercised. **This was restoring an existing capability,
not inventing a new one** — see HANDOFF.md for the full commit-by-commit
trace.

**Options considered:** (A) write-through to `"פעולות"` itself, keeping
it the single source of truth; (B) keep the legacy sheets and show two
visibly separate categories of trade/position (rejected — breaks FIFO
correctness across the boundary, re-introduces two sources of truth);
(C) a staged/pending queue requiring manual approval before promotion
into `"פעולות"` (rejected — real new architecture, adds friction to
Quick Trade's whole reason for existing). **Option A was chosen**,
scoped to **create-only**: appending new facts is architecturally simple
(`applyFIFO_` is fully stateless — it re-derives everything fresh from
all rows on every call, so insertion order doesn't matter); editing or
deleting an *already-recorded* row remains out of scope, since mutating
a fact FIFO has already lot-matched against others is a materially
harder problem.

**Implemented:** `handleAppendOperation_` (single BUY/SELL row) and
`handleAddTradeOperation_` (matched BUY+SELL pair), both in
`AppScript_FULL.gs`, wired to new `appendOperation`/`addTradeOperation`
POST actions. `validateOperation_` rejects malformed input; SELL is
rejected if it exceeds the real open FIFO quantity for that symbol
(`getOpenQtyForSymbol_`, which re-runs `applyFIFO_` for just that symbol
off the current sheet contents — never a stale cached value). Frontend:
`js/positions.js` (`openForm`/`submit` — New Position), `js/quicktrade.js`
(`submit` — both branches), `js/trades.js` (`openAddForm`/`submit` — add
only, edit/delete untouched) all call the new endpoints instead of the
old, disabled legacy-sheet paths. The stale `.action-disabled` CSS class
was removed from all three now-live buttons in `index.html` (a bug
introduced and caught within the same session — the JS worked but the
buttons still looked/behaved disabled).

**Date-handling bug found during live verification, and its real root
cause.** The first implementation constructed a JS `Date` object for the
date picked in a native `<input type="date">` (a plain `"YYYY-MM-DD"`
string). Verifying live, a `2026-07-05` pick showed up in the raw
`"פעולות"` cell as `7/4/2026 17:00:00` — wrong day, plus a nonzero
time-of-day. Two attempts to fix this by changing *which timezone* the
`Date` object was anchored to both failed:
1. `new Date(isoStr)` — parsed as UTC midnight per ECMA-262.
2. `new Date(y, m-1, d)` — local midnight in the **Apps Script project's**
   own configured Time Zone (a setting completely independent from the
   destination **spreadsheet's own** file-level Time Zone). This
   produced `7/4/2026 14:00:00` — a different, but still wrong, result.
   The fact that switching the timezone reference frame produced a
   *different* wrong answer (not the same one) was the clue that this
   diagnosis, while internally consistent with the observed numbers, was
   still solving the wrong layer of the problem.

**The actual root cause:** a `"YYYY-MM-DD"` value from a date picker is
a **calendar date, not a point in time**, and should never become a JS
`Date` object on the write side at all. None of the 110 pre-existing
rows in `"פעולות"` were ever written this way — a human types a date
string directly into the cell, and Google Sheets' own native date
recognition converts it, with zero `Date` objects and zero timezone math
anywhere in that path. The fix: `isValidIsoDateOnly_()` validates the
`"YYYY-MM-DD"` shape and the callers pass the **string itself** straight
into `appendRow()`, exactly matching how every hand-typed row already
works. Buy-before-sell date ordering in `handleAddTradeOperation_` now
uses plain string comparison (valid for ISO 8601 date-only strings)
instead of `Date.getTime()`.

**Verified live** (2026-07-05) via three iterations of a real UI test
(New Position, symbols `ZZDATE`/`ZZDATE2`/`ZZDATE3`): the first two
showed the wrong day/time in the raw `"פעולות"` cell (confirmed by
direct visual inspection of the sheet, not assumed), the third showed a
clean `2026-07-05` with no time component. A fresh, cache-busted
`getOperations` reload confirmed FIFO derivation, month grouping, and
hold-day calculation are all unaffected, and that QBTX/ONDL/the real 110
trades are byte-for-byte unchanged throughout. All test rows (5 from the
create-path testing, 3 from the date-bug investigation) were cleaned up
from `"פעולות"` and reconfirmed absent via fresh cache-busted reloads.
One real gotcha hit during cleanup: the rows were initially deleted from
the wrong spreadsheet (`"FIFO PRO - WEB"`, which has no `"פעולות"` tab at
all) before the correct one (resolved via the `OPERATIONS_SPREADSHEET_ID`
Script Property, or the hardcoded fallback ID if that property is unset)
was identified.

Committed as `be930b9` (create-path restoration) and `dc2dd81` (date-fix,
after two earlier incorrect attempts), both pushed and confirmed live via
the GitHub Deployments API and a cache-busted fetch of the live `sw.js`/
`js/positions.js`.

### Delete Position (Functional Cleanup) — shipped, confirmed live

A position is derived from an **open** BUY lot — the shares are still
"available" in `applyFIFO_`'s bookkeeping, unlike an already-closed
trade's lot, which is fully consumed by its own matching sell. This
asymmetry is why Delete Position could be fixed with the exact same
pure-addition pattern as the create-only write-through work (no backend
changes needed), while Trades' own edit/delete cannot (see below).

**Design considered and rejected before implementing:** offsetting a
closed trade by appending new ops doesn't work, because by the time a
correction is written, the original BUY lot has already been fully
matched against the original SELL — there's no remaining quantity left
to "sell back." Appending a new SELL at that point would incorrectly
consume a *different*, unrelated lot (e.g. a real currently-open
position for the same symbol), not cancel the historical trade. This
ruled out using the same technique for Trades' edit/delete, and confirms
Delete Position and Trades' edit/delete are not variations of the same
problem — they're genuinely different in kind.

**Implemented:** `Positions.remove(id)` now appends a SELL of the
position's full remaining quantity at its own `avg_price` (cost basis)
via the existing `appendOperation` endpoint. Since sell price equals buy
price, `gross`/`tax`/`net` all land at exactly $0 — the position closes
out with zero P&L impact, a real confirmation dialog explains this
before anything is written, and the result is verified via a fresh
`getOperations` reload (never assumed). One known, accepted cosmetic
side effect: if a position's `avg_price` blends multiple separate buy
lots at different individual prices, this correction shows up as a
handful of small offsetting trades that net to exactly $0 in total,
rather than one single $0 trade — economically correct, slightly noisy
in the raw ledger.

**Verified live** (2026-07-05) with clearly-marked test data (`ZZDEL`,
qty 6 @ $4.25): resulting trade showed `gross:0/tax:0/net:0/pct:0`
exactly, the position disappeared from a fresh cache-busted
`getOperations` reload, and QBTX/ONDL/the real 110 trades were confirmed
byte-for-byte unchanged. Test rows cleaned up from `"פעולות"` and
reconfirmed absent. Committed `3c488c1`, pushed, confirmed deployed.
Frontend-only — no Apps Script changes.

## Settings audit (Functional Cleanup) — shipped, confirmed live

Every visible Settings control now either does something real or is
explicitly hidden (commented out, not deleted) — confirmed via a
full-codebase grep of every `Settings.get()` key to see what, if
anything, outside `settings.js` actually consumes it.

**Hidden (zero consumers found anywhere):** `timezone` (no trading-hours
feature exists to use it — that feature is itself already hidden, see
the SPRINT 0 note in `js/settings.js`), `weeklyGoal`/`dailyGoal` (only
`monthlyGoal` has a real display surface, via `APP.monthGoal` on
Dashboard — building week/day equivalents would be new UI, not a wiring
fix), `maxConsecLosses` (no consecutive-loss-streak detection exists to
gate), `commission` (no trade-entry form collects a commission value —
Add Trade/Quick Trade/New Position all hardcode it to 0), the entire
`AI` section — `aiDetailLevel`/`aiAfterTrade`/`aiDailyReview`/
`aiWeeklyReview` (no scheduled/triggered AI review exists, and AI Chat
doesn't consult a detail-level preference), `alertGoal`/`alertDrawdown`/
`alertConsecLosses` (no real alert-firing code for these categories —
positions.js's alert system only ever checked target/stop/warn
thresholds), `sessionTimeout` (the real session TTL is server-side via
Script Property `SESSION_TTL_HOURS`, this local dropdown was fully
disconnected from it, and moot anyway while `AUTH_DISABLED = true`).

**Wired up (previously collected, silently ignored):**
- `maxPositionSize` now drives the "total exposure" risk-coloring
  threshold in Decision Engine's pre-trade discipline score
  (`js/decisionEngine.js`'s `buildDisciplineScore` — was hardcoded to
  `30`). Verified: the same 25% exposure shows `gold` at
  `maxPositionSize=20` and `muted` at `maxPositionSize=50`.
- `alertStop` now actually gates `positions.js`'s stop-hit and
  approaching-stop alerts in `_computeActiveAlerts()` — toggling it off
  previously had no effect at all. Verified: with it off, the alert
  badge disappears entirely (`style.display` becomes `'none'`); with it
  on, a triggered stop alert shows as before.

Frontend-only, no Apps Script changes. Committed `1f09aa7`, pushed,
confirmed deployed.

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
