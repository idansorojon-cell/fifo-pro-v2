# FIFO PRO — Roadmap / Outstanding Work

Grouped by priority. Nothing here has been started unless explicitly noted.

## P0 — Security / correctness (do before wider use)

- [ ] **Restore authentication** (see TECHNICAL_DEBT.md — "Restoring
      authentication"). Currently fully open.
- [x] **Confirm live Apps Script deployment matches `AppScript_FULL.gs` in
      git.** Re-verified 2026-07-05 via direct, read-only `curl` calls
      against the live Apps Script `exec` URL (not just `testAuth_()`/
      `testFinnhub_()` in the editor): `getOperations` returns the
      symmetric tax fix, the Phase B journal-annotation fields, and the
      position-meta overlay, all live. Git, GitHub Pages, and the live
      backend are all in sync as of this check. **This is a snapshot, not
      a standing guarantee** — re-verify again after any future manual
      redeploy, since the trader has redeployed from local disk ahead of
      git before (see TECHNICAL_DEBT.md).
- [x] **New Position, Quick Trade Buy/Sell, and Add Trade — restored via
      write-through create-only.** Root-cause investigation found these
      were never designed around `"פעולות"` — they predate it entirely
      (built against plain CRUD on `Trades`/`Positions`, which worked
      correctly until `"פעולות"` was added later as a read-path fallback
      that quietly became the only path, orphaning the old writes). Now
      append real BUY/SELL rows directly to `"פעולות"` via new
      `appendOperation`/`addTradeOperation` endpoints — `"פעולות"` stays
      the single source of truth, nothing writes to the legacy sheets for
      these new facts. SELL is rejected if it exceeds the real open FIFO
      quantity. Verified live 2026-07-05 end-to-end (real UI, clearly-
      marked test data, fresh cache-busted `getOperations` reloads,
      cleaned up and reconfirmed absent). Committed `be930b9`, pushed and
      confirmed deployed. See TECHNICAL_DEBT.md — "Write-through
      create-only paths."
- [x] **Date-handling bug in the new write-through paths — found and
      fixed.** A `"YYYY-MM-DD"` date-picker value was being converted to
      a JS `Date` object before writing, which is wrong for a calendar
      date (two timezone-based fix attempts both failed for this reason).
      Fixed by writing the plain string directly, matching how every
      pre-existing hand-typed row in `"פעולות"` already works. Verified
      live via 3 iterations of a real test. Committed `dc2dd81`, pushed
      and confirmed deployed. See TECHNICAL_DEBT.md for the full trace.
- [x] **Delete Position — restored.** A mistaken open position is now
      deleted by appending a SELL of its full remaining quantity at its
      own `avg_price` (cost basis) via the existing `appendOperation`
      endpoint — gross/tax/net land at exactly $0, zero P&L impact, zero
      Apps Script changes. This works because an *open* position's lot
      is still available in FIFO's bookkeeping. Verified live 2026-07-05
      with clearly-marked test data (`ZZDEL`): resulting trade showed
      `gross:0/tax:0/net:0` exactly, position gone on fresh reload, real
      data (QBTX/ONDL/110 trades) unaffected throughout. Committed
      `3c488c1`, pushed, confirmed deployed. See TECHNICAL_DEBT.md.
- [ ] **Trades' own edit/delete of an *already-recorded* trade still
      disabled.** The same pure-addition trick used for Delete Position
      does **not** work here: a closed trade's BUY lot is already fully
      consumed by its matching SELL, so there's nothing left to sell
      back to cancel it — appending more ops would just consume a
      *different*, unrelated lot. The only correct fix requires backend
      row-provenance tracking in `applyFIFO_` (trace a derived trade
      back to its exact source row(s), only when unambiguous — no
      partial-fill splitting) — a real Apps Script change, not attempted
      yet. Needs its own product decision on whether it's worth building
      before implementation, not just a code fix.
- [ ] **`seedToSheets()`'s dormant `seedAll` path** — writes to the legacy
      `Trades` sheet only when zero trades exist (never fires against
      current production data, but is a latent instance of the same
      synthetic-id bug class).
- [x] **Position target/stop-loss/notes silent data-loss — fixed in code,
      redeployed.** Confirmed live (via direct API calls) that the
      primary data path was hardcoding these fields blank and the edit
      modal wrote them to a different sheet, with real id-collision risk
      and a frontend bug that reported success even on failure. Fixed via
      `mergePositionMeta_`/`handleUpsertPositionMeta_` (symbol-keyed, see
      TECHNICAL_DEBT.md and ARCHITECTURE.md — "Data model"). Manually
      redeployed by the trader — treated as live, not independently
      re-verified this session.
- [x] **Tax calculation understated every losing trade by 25% — fixed in
      code, redeployed and confirmed by the trader.** Found via a
      full-history audit (`SEED` array in `js/app.js` vs. live
      `getOperations` output, matched field-by-field on symbol/dates/qty/
      prices — zero data/lot-matching discrepancies, 28 of 108 trades
      mismatched, 100% of them losses). `applyFIFO_` clamped tax to 0 on
      losses instead of applying the same 25% rate symmetrically
      (`CLAUDE.md`'s own documented formula has no sign condition). Fixed
      by removing the clamp. Verified by simulation against live pre-fix
      data: May 2026 moves from $27,979.99 to $30,854.99 (matches the
      trader's manual spreadsheet exactly); full-history total moves by
      +$9,585.77. See TECHNICAL_DEBT.md and ARCHITECTURE.md — "Data
      model". Manually redeployed and verified live by the trader.
- [x] **Persistence architecture audit — complete.** Full trace of every
      editable module's write path vs. read path confirmed this is one
      incomplete data-model migration, not isolated bugs: exactly one
      write path (position target/stop/notes) was ever updated to read
      from the new FIFO-derived model; every other path (Trades add/edit/
      delete, Journal, Trade Notes, Quick Trade's buy/sell) still writes
      to pre-migration sheets the primary read path never reads. Trades'
      edit/delete elevated to P0 independently — it matches by numeric id
      (`findRowById_`), the exact mechanism already proven risky and fixed
      for positions, and it's the single most-used CRUD action in the app.
      Full detail, per-module table, and the agreed unified fix strategy
      (two sources of truth: `"פעולות"`/`applyFIFO_` for facts, a
      stable-key annotation overlay for everything else) in
      TECHNICAL_DEBT.md — "Persistence architecture".
- [x] **Phase A — disable every fake-persistence write path (frontend-
      only).** Trades add/edit/delete, Journal, Trade Notes, new-position
      creation, Quick Trade's buy/sell tabs all disabled at their UI entry
      point with an explanatory toast — original logic kept in place
      (unreachable), nothing deleted. Position target/stop/notes editing
      on an *existing* derived position is unaffected (already correct);
      its qty/avg_price/symbol/date fields are now `disabled` inputs
      instead of silently discarding input. Found and eliminated a
      fake-success message in passing (`Positions.remove()` showed a
      green checkmark even on API failure). Verified live in the running
      app (not just read in source) that every disabled path leaves
      `APP.trades`/`APP.positions` unchanged and shows a clear warning
      toast, at both desktop and mobile. See TECHNICAL_DEBT.md.
- [x] **Phase B — real Trade/Journal/Notes persistence.** New
      `upsertTradeMeta` endpoint + `mergeTradeMeta_()` read-side merge,
      generalizing the position-meta pattern to trades via a stable
      composite key (`symbol+buy_date+sell_date+qty+buy_price+sell_price`).
      **Confirmed live 2026-07-05** via direct API check — `getOperations`
      returns populated journal-field slots (`entry_reason`/`exit_reason`/
      `respected_stop`/`followed_plan`/`lesson`/`emotion`) merged by
      composite key. Journal and Trade Notes now genuinely persist. See
      TECHNICAL_DEBT.md for the unusual deploy path (live backend already
      had this code before the commit existed; a sync commit reconciled
      git with production rather than deploying anything new).
- [x] **Phase C — superseded by the write-through create-only phase
      above.** Quick Trade's buy tab now appends a real BUY row to
      `"פעולות"` via `appendOperation` (the same endpoint New Position
      uses) rather than the originally-planned `upsertPositionMeta` —
      a more complete fix than what Phase C had scoped.
- [ ] **Identify the source of the recurring GitHub web-UI stale uploads**
      (see CURRENT_STATUS.md). Fought against git pushes at least 3 times
      this session.

## P1 — Reliability

- [ ] Switch service worker to network-first (or stale-while-revalidate)
      for `index.html`/`js/*.js` so future deploys don't require manually
      remembering to bump `sw.js`'s cache version (see TECHNICAL_DEBT.md).
- [ ] Decide the fate of `Script.html`/`Style.html`/`AppScript_PATCH.gs` —
      confirm they're truly dead, then remove or clearly mark deprecated.
- [ ] Some kind of smoke test (even a manual checklist) for: login flow
      (once restored), price loading, add/edit/delete trade, add/edit/
      delete position — to run after any backend redeploy.

## P2 — Product

- [ ] **Verify Polygon is actually unwired in the live backend.** Live
      console logs observed this session show `[prices] errors: QBTX:
      POLYGON_API_KEY חסר ב-Script Properties` on every price poll — this
      contradicts CURRENT_STATUS.md's claim that `handleGetPrices_` calls
      Finnhub only. Prices still load successfully (2/2), so this may be
      a harmless fallback-attempt log rather than a real failure, but it
      wasn't caused by this session's changes (confirmed via `git diff`
      showing zero uncommitted changes to `AppScript_FULL.gs` at the time
      it was observed) — worth a follow-up look at `handleGetPrices_`.
- [ ] Revisit whether Polygon.io should be permanently removed or kept as
      a documented, dormant fallback option (currently dormant code, see
      TECHNICAL_DEBT.md).
- [ ] Mission Control currently shows one static AI-coach heuristic
      sentence — could be extended with more of the proactive-alert logic
      that was removed (consecutive losses, no-stop patterns, near-stop
      warnings) if the single-sentence format proves too thin.
- [ ] Consider whether the biggest-risk widget on Mission Control should
      also account for proximity to stop-loss (currently purely P&L%-based
      via `Positions.riskStatus()`, which does already factor in stop
      distance — verify this still matches user expectations in practice).
- [x] **Settings Functionality Audit → implementation — done** (Functional
      Cleanup session). Every visible control audited via full-codebase
      grep of its `Settings.get()` key; every one now either does
      something real or is hidden (commented out, not deleted). ~15
      controls hidden (timezone, weeklyGoal/dailyGoal, maxConsecLosses,
      commission, the entire AI section, alertGoal/alertDrawdown/
      alertConsecLosses, sessionTimeout — all confirmed to have zero
      consumers anywhere). `maxPositionSize` wired into Decision Engine's
      exposure-risk coloring (was hardcoded to 30); `alertStop` wired
      into positions.js's stop/warn alert gating (previously collected,
      never consulted). Frontend-only, no Apps Script changes. Verified
      live via a real Settings render plus direct function-level checks
      of both wiring fixes. Committed `1f09aa7`, pushed, confirmed
      deployed. See TECHNICAL_DEBT.md — "Settings audit."

## P3 — Nice to have / explicitly deferred

- [ ] Automated tests (none exist — see TECHNICAL_DEBT.md).
- [ ] Real-time price streaming (currently 15s polling only —
      intentionally deferred because it would require exposing a price
      provider API key to the browser).
- [ ] PWA icon assets (`assets/icon-192.png`, `assets/icon-512.png`)
      referenced in `manifest.json` were not verified to exist this
      session — check if install prompts/icons look broken.

## Design & UX overhaul (in progress — see docs/DESIGN_SYSTEM.md)

FIFO PRO is being deliberately redesigned into a premium trading
platform, in small reviewable phases, per "Evolution, not Revolution."
Each phase's rationale and verification is logged in
`docs/DESIGN_SYSTEM.md`'s "Phase log."

- [x] **Phase 1 — icon system.** Replaced emoji with a hand-authored SVG
      sprite across main nav, hub headers, hub cards, mobile bottom nav,
      and header actions. See DESIGN_SYSTEM.md.
- [x] **Phase 2 — broader emoji cleanup.** Card-titles (`index.html`,
      7 instances), alert badge + alert-toast messages, risk-status
      pills (now color-matched everywhere via one `icon('dot')` +
      `riskInfo.color`), position-card target/stop labels, Mission
      Control's coach insight text, Daily Brief's remaining icons. Found
      and respected a real constraint: toast/tooltip strings render via
      `.textContent`/`data-tip` and can't carry HTML, so those specific
      emoji stay as-is (documented, not missed). Remaining deferred:
      every toast checkmark (`✓`/`❌` across CRUD actions — needs its own
      phase since it requires changing `setStatus()` to `innerHTML`),
      `dashboard.js` (separate module, not audited), Mistake Detector,
      AI Coach's insight-type icons, Daily Grade, pre/after-market price
      tags, and Quick Trade's `<option>` emoji (genuine platform
      constraint — `<option>` can't render HTML). See DESIGN_SYSTEM.md.
- [x] **Phase 3 — Mission Control visual hierarchy.** Done out of order
      at explicit request (before Phase 2). Restructured the home screen
      into hero (Open P&L, dominant) / context strip (today/week/month) /
      status row (positions + color-accented risk card) / AI Coach.
      Zero calculation changes. See DESIGN_SYSTEM.md.
- [x] **Live-status UX phase — ambient header status vs toast
      notifications.** Done between Phase 3 and Phase 2, at explicit
      request. The automatic 15s price poll no longer shows a
      "prices updated" banner (it was reflowing the whole page every
      cycle) — routine polling now only updates an ambient `#ws-dot`/
      `#last-updated` in the header; `#sync-bar` is now a fixed-position
      toast reserved for manual actions and errors. Recurring background
      errors surface once, then degrade to a quiet dot state instead of
      repeating. See DESIGN_SYSTEM.md.
- [x] **Follow-up — removed the manual-refresh success toast too.** Manual
      "🔄 רענן" clicks no longer toast on success either — replaced with a
      spinning refresh-button icon (`API.setButtonBusy`, reuses the
      existing `.spinner` keyframe) plus the ambient dot/timestamp.
      Errors still toast. See DESIGN_SYSTEM.md.
- [x] **Phase 4 — KPI/card differentiation.** Unified five parallel
      "small stat card" implementations (`.kpi`, `.prog-kpi`,
      `.week-card`, `.brief-kpi`, and a dormant unused `.kpi-v3`) into
      one visual language without renaming any classes; differentiated
      chart cards (`.card:has(.chart-wrap)`) and list cards
      (`.card--flush`) from generic content cards; found and fixed a
      real `!important` cascade conflict that was silently overriding
      `.kpi`'s styling; removed confirmed-dead CSS (`.kpi-v3`,
      `.card-glass`, `.kpi-trend`, `.prog-kpi-val`). Zero calculation
      changes. See DESIGN_SYSTEM.md.
- [x] **Phase 5a — table icon-buttons, empty-state icons, `.empty-state`
      de-dup.** First slice of Forms/Tables/Controls Polish. Migrated
      table row-action buttons (Trades/Positions/Journal/Watchlist) and
      three lazily-rendered empty states (Portfolio Heatmap/Performance
      Timeline/Trade Replay) from emoji to the SVG sprite (3 new symbols:
      `edit`, `x`, `note`; reused existing `book`/`target`/`clipboard`/
      `grid`/`calendar`/`film` where semantically exact). Consolidated
      `.empty-state`'s duplicate CSS definition (300 lines apart) into
      one — verified via `getComputedStyle` first that it was additive,
      not conflicting, so the merge preserves the exact prior appearance.
      Zero calculation/backend changes. See DESIGN_SYSTEM.md.
- [x] **Phase 5b — Trades modal date fields → native `type="date"`.**
      `f-buy-date`/`f-sell-date` (the highest-traffic form) now match
      Quick Trade/Position modal's native pickers instead of free-text
      `DD/MM/YYYY` typing. Uses existing `ddToISO`/`isoToDD` helpers at
      the read/write boundary only — stored format, API payload, and
      `hold_days`/`month` calc are byte-for-byte unchanged. Verified via
      round-trip conversion checks and live DOM inspection, without
      submitting a real edit (to avoid writing test data into production).
      See DESIGN_SYSTEM.md.
- [ ] **Phase 5c** — Unify Settings' `.s-input`/`.s-input-num` with the
      global `input, select, textarea` styling.
- [ ] **Phase 5d** — Replace native `confirm()` (6 call sites) with a
      styled confirmation modal.
- [ ] **Phase 5e** — Wire up the dormant `.skeleton*` classes as real
      loading states for Trades/Positions/Journal (currently built,
      zero references anywhere).
- [ ] **Phase 5f** — Journal's filter bar → reuse `.search-row` instead of
      its own inline-styled div + hardcoded per-select `max-width`.
- [ ] Phase 5g+ — chart restyle, motion pass, a full stylesheet-wide
      spacing audit (the scattered 10/12/14/18/28px margins outside the
      Dashboard tab, confirmed but not fixed through Phase 5a), mobile
      touch-target sizing for `.btn-icon` in tables, visible keyboard
      `:focus`/`:focus-visible` state for buttons, the `.card`/
      `.card-title` `!important` duplicate adjacent to the one resolved
      in Phase 4, and the `.perf-grid`/`.grade-card`/`.mistake-grid`/
      `.insight-grid` families on Analysis screens (explicitly out of
      scope through Phase 5a). DESIGN_SYSTEM.md is the living version of
      the original full proposal (colors, typography, spacing system,
      borrowed ideas from TradingView/Linear/Bloomberg/Stripe) going
      forward.

## Explicitly out of scope (per repeated instruction this session)

- No large refactors, no framework migration, no build-tooling
  introduction. See DEVELOPMENT_RULES.md — "Evolution, not Revolution" is
  a hard constraint, not a suggestion.
