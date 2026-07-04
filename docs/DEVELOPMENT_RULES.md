# FIFO PRO — Development Rules

## Guiding principle: Evolution, not Revolution

> Never perform unnecessary rewrites or large refactors.

This is the single most important rule for this project. FIFO PRO is a
production tool a real person uses daily. Every change should be the
smallest change that correctly fixes the stated problem. If a bigger
architectural change seems tempting, propose it and explain why — don't
just do it.

This rule is not new to this handoff — it is the same spirit as the
existing `CLAUDE.md`'s Golden Rules ("Never break existing functionality,"
"If a feature already works, keep it working, extend it instead of
replacing it," "Never remove functionality unless explicitly instructed,"
"If unsure, ask before deleting code"). Treat `CLAUDE.md` and this file as
one combined rulebook.

## Working methodology demonstrated this session

- **Diagnose before fixing.** Multiple times this session, a reported bug
  ("prices still not loading," "sections render on load") was verified by
  actually reproducing it (browser preview + console + network inspection)
  before touching any code — twice this revealed the real cause was
  different from the first hypothesis (a service-worker cache, a stale
  GitHub upload) rather than the code being wrong.
- **Small, targeted diffs.** Fixes were scoped to the specific function/
  file needed — e.g. the Polygon→Finnhub revert touched exactly
  `handleGetPrices_`/`fetchFinnhubPrices_` plus the two frontend labels
  that mentioned the provider name, nothing else.
- **Disable, don't delete, when reverting an experiment.** Polygon and
  Yahoo price-provider code were left in place but unwired when Finnhub
  was restored, in case they're revisited. Same pattern was used for the
  `AUTH_DISABLED` flag — a single boolean flip re-enables the full,
  unmodified auth system rather than requiring it to be rebuilt.
- **Verify in a real browser before claiming done.** Every UI-facing
  change was checked with the preview tools (screenshot, console errors,
  network requests, DOM state inspection) — not just "the code looks
  right." Several real bugs (stale service worker, wrong file being
  edited) were only caught this way.
- **Verify the live deployment separately from the local fix.** Local
  files being correct is not the same as GitHub Pages having rebuilt, and
  is *especially* not the same as Apps Script having been redeployed
  (that's a manual, human step — see PROJECT_OVERVIEW.md Deployment).
  Always `curl` the live URL after a push to confirm.
- **Ask before large destructive actions.** Deleting the 21 stale
  root-level duplicate files was preceded by proving (via `curl`,
  `index.html` inspection, and content diffing) that they were (a) truly
  unreferenced and (b) genuinely stale, before removing them.

## Backwards compatibility

- Never change the Apps Script endpoint contract (`getTrades`,
  `addTrade`/`update`/`delete`, `getPositions`/`add`/`update`/`delete`,
  `getWatchlist`/`add`/`remove`, `getGoal`/`setGoal`, `getPrices`,
  `getIndicators`, `seedAll`) without updating every frontend caller and
  confirming Google Sheets column names/order still line up.
- Never change `API_URL` in `js/api.js` without explicit permission
  (existing `CLAUDE.md` rule) — it points at a specific Apps Script
  deployment.
- Trading calculations in `utils.js` (`calcStats`, the `gross`/`tax`/`net`/
  `pct`/`hold_days` formulas) are production logic. Do not modify without
  understanding the full implication, and always explain *why* if you do.

## Keep UI consistent

- RTL Hebrew throughout — new UI text should be Hebrew, matching the
  existing tone (concise, informal-professional).
- Reuse existing CSS variables/classes (`var(--green)`, `var(--red)`,
  `var(--surface)`, `.card`, `.btn-ghost`, etc.) rather than introducing
  new colors or one-off inline styles.
- New screens should follow the existing hub→tab pattern (see
  ARCHITECTURE.md), not a new/different navigation paradigm.
- New heavy content (tables, charts, long lists) should render lazily on
  tab-open, not eagerly at boot — this is now an explicit house rule after
  the lazy-rendering fix this session, not just an implementation detail.

## Verification checklist before considering a fix "done"

1. Syntax-check any edited `.js` file (`node --check`).
2. If UI-facing: start the local static preview, hard-reload with service
   worker + caches cleared, screenshot/inspect the actual change.
3. Commit with a clear message explaining *why*, not just *what*.
4. Push, then `curl` the live GitHub Pages URL to confirm the specific
   change (specific string/function) is present in the deployed file —
   don't assume push = deployed.
5. If the fix touches `AppScript_FULL.gs`: explicitly remind that Apps
   Script requires a manual redeploy — a git push alone does nothing there.
6. If the fix touches `index.html` or any `js/*.js`: bump `sw.js`'s cache
   version, or explicitly note why it wasn't needed.
