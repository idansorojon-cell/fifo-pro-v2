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
- [ ] Phase 2 (candidate) — card-title and in-content icon pass (the
      emoji intentionally left alone in Phase 1/3: alert badge, risk
      pills, all other `js/*.js` card titles — Mission Control's own
      card-title emoji were migrated as part of Phase 3 below).
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
- [ ] Phase 4+ — KPI/card component differentiation, form/native-control
      restyle, chart restyle, motion pass, loading/empty states. Full
      original proposal (colors, typography, spacing system, borrowed
      ideas from TradingView/Linear/Bloomberg/Stripe) discussed in
      session history; DESIGN_SYSTEM.md is the living version of that
      plan going forward.

## Explicitly out of scope (per repeated instruction this session)

- No large refactors, no framework migration, no build-tooling
  introduction. See DEVELOPMENT_RULES.md — "Evolution, not Revolution" is
  a hard constraint, not a suggestion.
