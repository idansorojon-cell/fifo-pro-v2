# FIFO PRO — Technical Debt & Known Limitations

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
