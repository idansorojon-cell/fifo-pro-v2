# FIFO PRO — Current Status

_Last updated: 2026-07-05, during a documentation-accuracy pass that
re-verified live state directly (git, GitHub Pages, and the live Apps
Script backend) rather than trusting prior notes. See `HANDOFF.md` for
the full, current session narrative — this file is kept in sync with it
and should be treated as a snapshot, not a standing guarantee._

## What's deployed and stable (re-verified 2026-07-05)

**Frontend** (GitHub Pages, `idansorojon-cell/fifo-pro-v2`, branch `main`,
latest commit `445847c`): confirmed live via direct `curl` against
`idansorojon-cell.github.io/fifo-pro-v2` — matches git exactly, no drift
(`git fetch` showed zero commits of divergence in either direction).

- Service worker cache at `fifopro-v13` (confirmed via `curl` of the live
  `sw.js` — matches the local file's cache version).
- Login screen fully removed from `index.html`; `AUTH_DISABLED = true` in
  both `js/auth.js` and `js/api.js` — deliberate, accepted-for-now, not a
  bug (see TECHNICAL_DEBT.md — "Security").
- Mission Control home screen live; lazy rendering confirmed — only it
  renders at boot, every other screen renders itself on first navigation.
- **Phase A (disable every fake-persistence write path) confirmed live**
  — the live Trades table's edit/delete buttons carry the
  `action-disabled` CSS class and a "מבוטל זמנית" tooltip.
- **Phase B (`upsertTradeMeta` / composite-key trade annotations)
  confirmed live** — the live `js/api.js` exposes `upsertTradeMeta`, and
  a live `getOperations` call returns `entry_reason`/`exit_reason`/
  `respected_stop`/`followed_plan`/`lesson`/`emotion` fields on every
  trade (empty for historical trades pending new Journal entries, not
  missing or broken).

**Backend** (`AppScript_FULL.gs`): **confirmed synced with git as of
2026-07-05** via direct, read-only `curl` calls against the live Apps
Script `exec` URL — not assumed from git alone, since Apps Script
deployment is a manual step that does not happen on `git push`:

- `getOperations` returns 110 trades. A sampled losing trade (MU,
  `gross: -136.95`) shows `tax: -34.24` — the symmetric 25% tax fix
  (`tax = gross × 0.25`, no clamp on losses) is live, not just committed.
- Both real open positions (QBTX, ONDL) return `target`/`stop_loss`/
  `notes` fields via `mergePositionMeta_` (empty because the trader
  hasn't set values for them yet — the merge path itself works).
- `handleGetPrices_` calls `fetchFinnhubPrices_` as the sole price
  source; Polygon/Yahoo code remains present in the file but uncalled.
- `AUTH_DISABLED = true` at the top of the Web API section — every
  request accepted, `validateToken_()` short-circuited.

⚠️ **This is a snapshot, not a guarantee.** The trader has previously
redeployed Apps Script directly from local disk, ahead of any git
commit. Always re-verify live behavior (a read-only GET call) after any
future manual redeploy rather than assuming this sync still holds.

## Recent history (most recent session first — see HANDOFF.md for full detail)

1. Phase 5 UX audit → Phase 5a (icon/empty-state migration) and 5b
   (native `type="date"` fields) shipped.
2. User-reported $2,875 May-2026 discrepancy vs. a manual spreadsheet
   traced to a systemic tax bug (`applyFIFO_` clamped tax to 0 on
   losses) — fixed, redeployed, confirmed live (28 of 108 historical
   trades affected, $9,585.78 total understatement).
3. User-reported "New Position" and Trading Journal changes vanishing
   after refresh led to a full persistence audit: one incomplete
   data-model migration (legacy `Trades`/`Positions` sheets never read
   by the new `"פעולות"`-derived path), not four isolated bugs.
4. **Phase A** shipped: every fake-persistence write path (Trades
   add/edit/delete, Quick Trade submit, new-position creation) disabled
   at its UI entry point with an explanatory toast — original logic kept
   in place, not deleted.
5. **Phase B** shipped: `upsertTradeMeta`/`mergeTradeMeta_` + a stable
   composite key, generalizing the position-meta pattern to trades —
   Journal and Trade Notes now genuinely persist.
6. While verifying Phase B, the live Apps Script was found to already
   have this exact code — the trader had redeployed from local disk
   ahead of the commit. A sync commit (`89e6948`) brought git in line
   with production; it deployed nothing new.
7. GitHub Pages failed to deploy once for an unconfirmed reason (leading
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
