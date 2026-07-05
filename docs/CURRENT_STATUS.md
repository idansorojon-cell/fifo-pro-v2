# FIFO PRO — Current Status

_Last updated: 2026-07-05, Functional Cleanup session (Settings audit +
Delete Position). Re-verified live state directly (git, GitHub Pages
deployment API, and the live Apps Script backend) rather than trusting
prior notes. See `HANDOFF.md` for the full, current session narrative —
this file is kept in sync with it and should be treated as a snapshot,
not a standing guarantee._

## What's deployed and stable (re-verified 2026-07-05, Functional Cleanup)

**Frontend** (GitHub Pages, `idansorojon-cell/fifo-pro-v2`, branch `main`,
latest commit `3c488c1`): confirmed live two ways — (1) the GitHub
Deployments API shows a `"state": "success"` deployment whose `sha`
exactly matches `3c488c1`, and (2) a cache-busted direct fetch of the
live `sw.js` returns `fifopro-v21`. (A first check without a
cache-busting query param earlier this session showed a stale version —
that's GitHub Pages' own CDN edge cache, not stale code; always
cache-bust when checking this.)

- Service worker cache at `fifopro-v21`.
- Login screen fully removed from `index.html`; `AUTH_DISABLED = true` in
  both `js/auth.js` and `js/api.js` — deliberate, accepted-for-now, not a
  bug (see TECHNICAL_DEBT.md — "Security").
- Mission Control home screen live; lazy rendering confirmed — only it
  renders at boot, every other screen renders itself on first navigation.
- **Write-through create-only paths confirmed live** — New Position,
  Quick Trade Buy, Quick Trade Sell, and Add Trade all append real
  BUY/SELL rows directly to `"פעולות"` (see TECHNICAL_DEBT.md —
  "Persistence architecture" for full detail). Verified via the real UI
  with clearly-marked test data, confirmed via fresh cache-busted
  `getOperations` reloads, cleaned up and reconfirmed absent.
- **Delete Position confirmed live** — a mistaken open position is
  deleted via a pure-addition SELL-at-cost-basis correction (appends a
  SELL of the full remaining quantity at the position's own `avg_price`,
  so gross/tax/net all land at exactly $0). Reuses the existing
  `appendOperation` endpoint — no Apps Script changes. Verified
  end-to-end with test data (`ZZDEL`): resulting trade showed
  `gross:0/tax:0/net:0` exactly, position disappeared on a fresh reload,
  real data unaffected.
- **Settings audit confirmed live** — every visible control now either
  does something real or is explicitly hidden; none left decorative.
  `maxPositionSize` and `alertStop` were wired to real existing
  calculations (Decision Engine's exposure coloring, positions.js's
  alert gating) that previously ignored them entirely.
- **Trades' own edit/delete of an already-recorded trade remains the
  one intentionally disabled write path** — see TECHNICAL_DEBT.md for
  why the same pure-addition trick used for Delete Position doesn't
  apply to closed trades.
- **Phase B (`upsertTradeMeta` / composite-key trade annotations)
  confirmed live** — the live `js/api.js` exposes `upsertTradeMeta`, and
  a live `getOperations` call returns `entry_reason`/`exit_reason`/
  `respected_stop`/`followed_plan`/`lesson`/`emotion` fields on every
  trade (empty for historical trades pending new Journal entries, not
  missing or broken).

**Backend** (`AppScript_FULL.gs`): **confirmed synced with git as of
2026-07-05** via direct, read-only calls against the live Apps Script
`exec` URL — not assumed from git alone, since Apps Script deployment is
a manual step that does not happen on `git push`:

- `getOperations` returns 110 trades (real data, confirmed unaffected by
  this session's test writes/cleanup). A sampled losing trade (MU,
  `gross: -136.95`) shows `tax: -34.24` — the symmetric 25% tax fix
  (`tax = gross × 0.25`, no clamp on losses) is live, not just committed.
- Both real open positions (QBTX, ONDL) return `target`/`stop_loss`/
  `notes` fields via `mergePositionMeta_` (empty because the trader
  hasn't set values for them yet — the merge path itself works).
- New endpoints `appendOperation`/`addTradeOperation` (write-through
  create-only) are live and confirmed working, including the SELL
  quantity guard (rejects a SELL that exceeds the real open FIFO
  quantity for that symbol) and correct date handling (see below).
- `handleGetPrices_` calls `fetchFinnhubPrices_` as the sole price
  source; Polygon/Yahoo code remains present in the file but uncalled.
- `AUTH_DISABLED = true` at the top of the Web API section — every
  request accepted, `validateToken_()` short-circuited.

**Date-handling bug found and fixed this session:** the write-through
paths originally constructed a JS `Date` object for the date picked in
a native `<input type="date">`. Two attempts to fix a resulting
day/time-of-day shift by changing which timezone the `Date` was anchored
to (UTC, then the Apps Script project's own timezone, then the
destination spreadsheet's own timezone) all failed — the real defect was
constructing a `Date`/timestamp at all for something that's conceptually
a calendar date, not a point in time. Fixed by writing the plain
`"YYYY-MM-DD"` string directly into the cell, exactly like every one of
the 110 pre-existing hand-typed rows already works (Google Sheets' own
native date recognition, zero `Date` objects, zero timezone math
anywhere). Verified live via three iterations of real UI tests; the
final version showed a clean `2026-07-05` with no time component in the
raw `"פעולות"` cell. See TECHNICAL_DEBT.md for the full trace.

⚠️ **This is a snapshot, not a guarantee.** The trader has previously
redeployed Apps Script directly from local disk, ahead of any git
commit. Always re-verify live behavior (a read-only GET call) after any
future manual redeploy rather than assuming this sync still holds.

## Recent history (most recent session first — see HANDOFF.md for full detail)

1. **Functional Cleanup — Settings audit + Delete Position.** Every
   visible Settings control now either does something real or is
   explicitly hidden — ~15 decorative ones hidden (never read anywhere,
   confirmed via full-codebase grep), `maxPositionSize` and `alertStop`
   wired into existing calculations that previously ignored them
   (commit `1f09aa7`). Delete Position restored via a pure-addition
   SELL-at-cost-basis correction — zero P&L impact, zero Apps Script
   changes, reuses the existing `appendOperation` endpoint (commit
   `3c488c1`). Trades' own edit/delete of an already-recorded trade
   remains the one intentionally disabled write path — the same
   pure-addition trick doesn't work for a closed trade's already-
   consumed lot; fixing it would need backend row-provenance tracking,
   a real Apps Script change not yet attempted (see ROADMAP.md P0).
2. **Stability Sprint — write-through create-only paths.** New Position,
   Quick Trade Buy/Sell, and Add Trade restored by appending real
   BUY/SELL rows to `"פעולות"` (commit `be930b9`) instead of the old
   id-keyed legacy-sheet writes the read path never consulted. A
   date-handling bug (JS `Date` object construction for what should have
   been a plain calendar-date string) was found during live verification,
   fixed after two incorrect timezone-based attempts, and confirmed live
   (commit `dc2dd81`).
3. Phase 5 UX audit → Phase 5a (icon/empty-state migration) and 5b
   (native `type="date"` fields) shipped.
4. User-reported $2,875 May-2026 discrepancy vs. a manual spreadsheet
   traced to a systemic tax bug (`applyFIFO_` clamped tax to 0 on
   losses) — fixed, redeployed, confirmed live (28 of 108 historical
   trades affected, $9,585.78 total understatement).
5. User-reported "New Position" and Trading Journal changes vanishing
   after refresh led to a full persistence audit: one incomplete
   data-model migration (legacy `Trades`/`Positions` sheets never read
   by the new `"פעולות"`-derived path), not four isolated bugs.
6. **Phase A** shipped: every fake-persistence write path (Trades
   add/edit/delete, Quick Trade submit, new-position creation) disabled
   at its UI entry point with an explanatory toast — original logic kept
   in place, not deleted.
7. **Phase B** shipped: `upsertTradeMeta`/`mergeTradeMeta_` + a stable
   composite key, generalizing the position-meta pattern to trades —
   Journal and Trade Notes now genuinely persist.
8. While verifying Phase B, the live Apps Script was found to already
   have this exact code — the trader had redeployed from local disk
   ahead of the commit. A sync commit (`89e6948`) brought git in line
   with production; it deployed nothing new.
9. GitHub Pages failed to deploy once for an unconfirmed reason (leading
   hypothesis: a soft build-rate-limit from a burst of ~8 commits in
   ~2.5 hours) — succeeded on the very next push with no code change.

### Prior session (superseded, kept for continuity only)

Before the persistence-audit session above, an earlier session did the
following — all superseded by later fixes, listed here only so the
history isn't lost:

1. Diagnosed and fixed live-price loading (a Yahoo `Referer` header was
   causing 429s).
2. Added Polygon.io as primary price provider with Finnhub fallback, per
   explicit request, then **fully reverted it** per a later explicit
   request — Finnhub restored as sole primary provider, Polygon/Yahoo
   code left in place but unwired.
3. Diagnosed and fixed a login 401 loop, then disabled auth entirely via
   `AUTH_DISABLED` flags (backend + frontend) to unblock further
   debugging, then removed the login screen from `index.html` entirely
   per explicit request.
4. UX overhaul: Mission Control home, alert de-dup + badge, larger
   position cards, table pagination, collapsed timeline, genuine lazy
   rendering, removed 21 stale root-level duplicate JS/CSS files.

## Known repo hygiene issue (dormant — stay alert)

Earlier sessions saw `git push` repeatedly rejected because
`origin/main` had moved — traced every time to a GitHub web-UI "Add
files via upload" commit re-uploading an older, stale snapshot of files
that had just been fixed via git, fighting against git pushes. The root
cause was never identified.

**Not observed in the most recent session** — `git fetch` showed zero
divergence from `origin/main` as of 2026-07-05 — but if pushes start
getting rejected with unfamiliar remote commits again, check for:
- A browser tab with the GitHub file editor open and unsaved
- A second machine/session pushing via the web UI
- Any automation (GitHub Actions, a bot, a scheduled script) writing to
  the repo

See TECHNICAL_DEBT.md for the standing recommendation on this.
