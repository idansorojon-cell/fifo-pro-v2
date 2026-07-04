# FIFO PRO — Roadmap / Outstanding Work

Grouped by priority. Nothing here has been started unless explicitly noted.

## P0 — Security / correctness (do before wider use)

- [ ] **Restore authentication** (see TECHNICAL_DEBT.md — "Restoring
      authentication"). Currently fully open.
- [ ] **Confirm live Apps Script deployment matches `AppScript_FULL.gs` in
      git.** Backend deploys are manual; verify with `testAuth_()` and
      `testFinnhub_()` run directly in the Apps Script editor.
- [x] **Position target/stop-loss/notes silent data-loss — fixed in code,
      needs redeploy.** Confirmed live (via direct API calls) that the
      primary data path was hardcoding these fields blank and the edit
      modal wrote them to a different sheet, with real id-collision risk
      and a frontend bug that reported success even on failure. Fixed via
      `mergePositionMeta_`/`handleUpsertPositionMeta_` (symbol-keyed, see
      TECHNICAL_DEBT.md and ARCHITECTURE.md — "Data model"). **Action
      needed: manually redeploy `AppScript_FULL.gs`** — the fix does
      nothing in production until then.
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
- [ ] **Phase 5b** — Trades modal date fields (`f-buy-date`/`f-sell-date`)
      → native `type="date"`, matching Quick Trade/Position modal.
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
