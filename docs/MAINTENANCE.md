# FIFO PRO — Maintenance

A minimal, recurring checklist. Not a process, not a system — just the
few things worth glancing at on a schedule so small issues don't sit
silent for months. Created 2026-08-14 after the first full maintenance
pass (see TECHNICAL_DEBT.md and ROADMAP.md for what that pass found).

**Guiding principle, same as everywhere else in this project: Stable >
New.** Nothing here is a prompt to upgrade, refactor, or modernize —
only to notice if something that was working has quietly stopped.

## Monthly

- `git status` + `git branch -vv` in both worktrees (`files/`,
  `fifo-premium-redesign/`) — confirm no branch has drifted local-only
  again (this happened once, see the 2026-08-14 backup of
  `premium-redesign`).
- `node tools/smoke-check.js` — syntax, critical-function, duplicate-
  function, and config-sanity checks. Deterministic, no dependencies,
  ~1 second. Run it after any hand-edit to `AppScript_FULL.gs` too, not
  just monthly.
- Load the live site (`idansorojon-cell.github.io/fifo-pro-v2`), confirm
  it loads and login works. One click, not a full test pass.
- Skim the Apps Script **Executions** log (script.google.com → the
  project → Executions) for repeated failures — this is not visible
  from git or GitHub and was flagged in the original audit as something
  only the owner can check.

## Quarterly

- Check `docs/ROADMAP.md`'s deprecations page reference is still current
  for the Anthropic model in use (`AppScript_FULL.gs`'s `aiChat` model —
  confirmed `claude-sonnet-4-6`, Active, "not sooner than Feb 2027" as of
  2026-08-14). One lookup: platform.claude.com/docs/en/about-claude/
  model-deprecations.
- Confirm the Finnhub API key still works (a live price load is the
  simplest check) and that Finnhub hasn't changed its `/quote` response
  shape.
- Confirm Chart.js 4.4.1 (CDN-pinned in `index.html`/`sw.js`) has no
  published security advisory. Don't bump the version just because a
  newer one exists — only on a real advisory.
- **Google Sheet backup — OPERATIONAL RECOMMENDATION, not a code issue.**
  This cannot be verified from the repository or from this environment —
  it requires checking the Google account directly. Confirm the trading
  data spreadsheet(s) (the bound sheet + whatever `OPERATIONS_SPREADSHEET_ID`
  points at) have either Google's own Version History enabled and
  reachable, or a periodic export/copy somewhere outside that one file.
  If the answer is "no idea" — that's the finding; treat it as an open
  action, not a passed check.
- Re-read `docs/ROADMAP.md` and `docs/TECHNICAL_DEBT.md` top to bottom
  and close/update anything that's stale, the same way the 2026-08-14
  pass did for the Polygon-warning and auth-bypass entries.

## After a Release (merge to `main` + push, and/or an Apps Script redeploy)

- Production smoke test: login → Home loads real data → Positions shows
  live prices → one Trades/Performance screen renders → console has no
  red errors. (The full 9-step / mobile checklists already in
  `HANDOFF.md` are the thorough version of this — use them for anything
  bigger than a small fix.)
- If `AppScript_FULL.gs` changed: confirm it was actually redeployed
  (Apps Script editor → Deploy → Manage deployments) — a `git push`
  alone never touches the live backend. If it wasn't meant to change
  behavior (a dead-code cleanup, a comment), a redeploy is **not**
  required — don't create one just because the source file changed.
- Confirm `version.json`'s `cache` value matches `sw.js`'s `BUILD_CACHE`
  constant (`tools/smoke-check.js` already checks this) — if they were
  bumped, confirm they were bumped together via `tools/bump-version.sh`,
  not by hand.
- Re-run `node tools/smoke-check.js`.
- If the change touched FIFO/tax/P&L math specifically: re-verify against
  a known real number (the project has done this before via the SEED
  array vs. live-output comparison — see TECHNICAL_DEBT.md's tax-fix
  history for the method) — this is the one category of bug that can be
  silent and expensive, and there is still no automated test for it.
