# FIFO PRO — Current Status

_Last updated: end of the session that produced this handoff (2026-07-02)._

## What's deployed and stable

**Frontend** (GitHub Pages, `idansorojon-cell/fifo-pro-v2`, branch `main`,
latest commit `1bd0f82` at time of writing): live, verified working via
direct `curl` checks against the deployed URL after every push this
session.

- Login screen fully removed from `index.html`; `Auth.init()` boots
  straight into the app (`AUTH_DISABLED = true` in both `js/auth.js` and
  `js/api.js`).
- Mission Control home screen live, showing real Open P&L / today-week-month
  P&L / positions summary / biggest-risk / one AI insight / alert badge.
- Alert toast de-duplication live (once per day per symbol+type+threshold),
  persistent badge + dropdown.
- Positions cards enlarged with risk-status pill and full stat grid.
- Trades/Journal tables paginated to latest 20 + "load more".
- Performance Timeline collapses to latest 3 months by default.
- Lazy rendering: only Mission Control renders at boot; dashboard, trades,
  journal, positions panels render on first navigation to them (verified
  empty-at-boot via live browser testing).
- Service worker cache bumped to `fifopro-v4` (forces eviction of any
  stale bundle cached under `v3` or earlier).
- Root-level duplicate JS/CSS files (20 `.js` files + `style.css` that
  mirrored `js/`/`css/`) removed — confirmed via `curl` that
  `/app.js` now 404s while `/js/app.js` serves the current code.

**Backend** (`AppScript_FULL.gs`): **the version in git is NOT necessarily
the version currently deployed to Apps Script.** Apps Script deployment is
a manual step (paste into script.google.com → New deployment) that does
not happen automatically on `git push`. As of the last verified check this
session:

- `handleGetPrices_` calls `fetchFinnhubPrices_` as the **sole** price
  source. Polygon (`fetchPolygonPrices_`) and Yahoo (`fetchYahooBatch_`)
  code remains in the file but is **not called** — disabled, not deleted.
- `AUTH_DISABLED = true` at the top of the Web API section — `doGet`/
  `doPost` skip `validateToken_()` entirely.
- `FINNHUB_API_KEY` was confirmed **already correctly configured** in
  Script Properties — verified live (real prices returned for ONDL/QBTX).
- Diagnostics available by running directly in the Apps Script editor:
  `testAuth_()`, `testFinnhub_()` (formerly `testPolygon_()` — Polygon
  variant may still exist unused in the file).

⚠️ **Action needed:** confirm the currently-deployed Apps Script matches
`AppScript_FULL.gs` in git. If any backend-side fix from this session
hasn't been manually redeployed, `getPrices`/auth-bypass behavior on the
live backend may not match what's described above.

## Recent history this session (chronological, high-level)

1. Diagnosed and fixed live-price loading (Yahoo `Referer` header causing
   429s) — later superseded.
2. Added Polygon.io as primary provider with Finnhub fallback — per
   explicit request.
3. Diagnosed and fixed a login 401 loop (stale `auth-disabled-<timestamp>`
   token format mismatch with backend's exact-match check).
4. Temporarily disabled auth entirely via `AUTH_DISABLED` flags (backend +
   frontend) to isolate the price-provider debugging from auth debugging.
5. Fully removed the login screen and `Auth.init()` call per explicit
   request (auth code preserved, just unreachable).
6. **Reverted Polygon → Finnhub entirely** per explicit request — Polygon
   disabled (not deleted), Finnhub restored as sole primary provider.
7. UX overhaul: Mission Control home, alert de-dup + badge, larger
   position cards, table pagination, collapsed timeline.
8. Fixed genuine full-page-render-on-boot issue (lazy rendering) + bumped
   SW cache version.
9. Removed 21 stale root-level duplicate files.
10. This documentation handoff.

## Known repo hygiene issue (resolved, but stay alert)

**Multiple times this session**, `git push` was rejected because
`origin/main` had moved — traced to repeated **GitHub web-UI "Add files
via upload"** commits that re-uploaded *stale, pre-fix* snapshots of
`AppScript_FULL.gs`, `index.html`, and various `js/*.js` files, effectively
fighting against pushes made via git. Each time, a 3-way merge resolved
correctly in favor of the git-side fix (verified no conflict markers
remained), but **the underlying cause of those uploads was never
identified.** If pushes keep getting rejected with unfamiliar remote
commits, check for:
- A browser tab with the GitHub file editor open and unsaved
- A second machine/session pushing via the web UI
- Any automation (GitHub Actions, a bot, a scheduled script) writing to
  the repo

See TECHNICAL_DEBT.md for the standing recommendation on this.
