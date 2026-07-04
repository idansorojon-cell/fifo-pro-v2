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

## Explicitly out of scope (per repeated instruction this session)

- No large refactors, no framework migration, no build-tooling
  introduction. See DEVELOPMENT_RULES.md — "Evolution, not Revolution" is
  a hard constraint, not a suggestion.
