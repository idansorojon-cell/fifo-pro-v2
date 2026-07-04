# FIFO PRO — AI Context (read this before making changes)

This file exists so a new AI session doesn't have to rediscover decisions,
gotchas, and conventions the hard way. If you're an AI assistant working on
this repo, read this fully before editing anything.

## The two most important things to internalize

1. **Deployment is two separate manual-ish steps.** `git push` updates the
   frontend (GitHub Pages, automatic rebuild). It does **nothing** to the
   backend. The backend (`AppScript_FULL.gs`) only goes live when a human
   manually pastes it into script.google.com and creates a new deployment
   version. Any time you fix something in `AppScript_FULL.gs`, say this
   out loud in your response — don't let the user think `git push` was
   enough.
2. **The service worker cache-busts nothing automatically.** `sw.js` is
   cache-first. If you change `index.html` or any `js/*.js` file, bump
   `CACHE_NAME`/`STATIC_CACHE` in `sw.js` in the same commit, or a
   returning browser may serve stale code indefinitely. This already
   caused real confusion once this session.
3. **There may be two Google Sheets involved, and position edits may not
   round-trip.** The primary data path (`getOperations`) derives trades
   *and positions* fresh from a `"פעולות"` transactions log — possibly in
   a different spreadsheet, identified by the `OPERATIONS_SPREADSHEET_ID`
   Script Property (falls back to a hardcoded ID if unset). Positions
   derived this way always have blank `target`/`stop_loss`/`notes`, while
   the position edit modal writes those fields to a *different*, legacy
   `Positions` sheet. If asked to debug "my stop-loss disappeared" or
   similar, check this first — see ARCHITECTURE.md's "Data model" and
   TECHNICAL_DEBT.md's "Data integrity" sections before assuming it's a
   simple frontend bug.

## Decisions already made — don't re-litigate without new information

- **Auth is intentionally, fully disabled** (`AUTH_DISABLED = true` in
  `js/auth.js`, `js/api.js`, `AppScript_FULL.gs`; login overlay removed
  from `index.html`). This was requested explicitly, multiple times, to
  unblock debugging. It is a known, accepted (for now) security gap — see
  TECHNICAL_DEBT.md. Don't "helpfully" re-add a login prompt without being
  asked; don't assume it's a bug.
- **Finnhub is the sole live-price provider.** Polygon.io was tried,
  fully implemented, then explicitly reverted. Polygon's code
  (`fetchPolygonPrices_`) and Yahoo's code (`fetchYahooBatch_` etc.) remain
  in `AppScript_FULL.gs` but are unwired — don't re-wire either without
  being asked, and don't delete them either (the pattern used throughout
  this project is "disable, don't delete" for reversible experiments).
- **Root-level duplicate JS/CSS files were removed on purpose.**
  `index.html` only ever loads from `js/`/`css/`. If you see root-level
  `.js`/`.css` files reappear, that's very likely another stale GitHub
  web-UI upload (see below) — don't assume they're needed.
- **The positions table under the card grid was removed on purpose** (it
  duplicated the same data already shown in the card grid) — don't add it
  back as a "completeness" fix.
- **`renderAll()` is intentionally minimal** (just
  `renderMissionControl()`). Don't restore eager rendering of
  dashboard/trades/journal/positions there — that was the actual bug this
  session's lazy-rendering fix addressed. New screens render themselves in
  their own `switchTab()` case.
- **Day-change % must come from the backend's `changePctValid` flag,
  never recomputed client-side from `prevClose`.** There's a real historical
  bug (ONDL showing a fake -42% from a ~1-year-old reference close) that
  this guards against — see the "BUG FIX" comments in `positions.js`.
  Don't "simplify" this by recomputing from `prevClose` directly.
- **Alert toasts are deduped by `symbol + type + threshold` in
  `localStorage`, once per calendar day.** If asked to make alerts "more
  responsive" or "clearer," do not revert to comparing the full message
  string (which includes the live price and therefore basically never
  matches twice) — that was the original bug.

## Known recurring gotcha: stale GitHub web-UI uploads

Multiple times this session, `git push origin main` was rejected because
`origin/main` had moved — traced every time to a GitHub web-UI "Add files
via upload" commit that re-uploaded an **older, stale** snapshot of files
that had just been fixed via git. Pattern to follow when this happens:

```
git fetch origin
git log --oneline main..origin/main       # see what changed remotely
git diff --stat main origin/main          # confirm it's really stale/older content
git merge origin/main --no-commit --no-ff # resolve
git checkout --ours <conflicting files>   # keep the git-side (correct, newer) fix
git add <files> && git commit
git push origin main
```

Always verify with `git diff`/`git show origin/main:<file>` that the
remote version is actually stale before blindly taking "ours" — don't
assume, confirm.

## Known recurring gotcha: wrong preview server launched by name collision

`.claude/launch.json` has three configs: `"fifo-pro"` (this project,
port 5176), `"trading-dashboard"`, and `"dana-care-app"` — the latter two
are unrelated sibling projects in sibling folders. Starting a preview with
an inexact name once launched the wrong project's dev server silently
(no error — just the wrong app rendered) and cost real time before the
mismatch was noticed via an unexpected screenshot. **Always pass the exact
name `"fifo-pro"`** to `preview_start`. See DEVELOPMENT_RULES.md — "Local
development" for the full local-dev setup, including why `python3 -m
http.server` doesn't work here and why the service worker must be cleared
before every local test.

## Verifying "done" means verifying the live site, not just local files

This project got burned enough times this session (stale service worker,
un-deployed Apps Script, GitHub upload collisions) that "the code is
correct locally" is treated as necessary but not sufficient. The
established pattern: after every push, `curl` the live GitHub Pages URL
and grep for the specific string/function that changed, to confirm the
deployed bundle actually contains the fix.

## Where to look for more detail

- Product/architecture: PROJECT_OVERVIEW.md, ARCHITECTURE.md
- What exists today: FEATURES.md
- What's deployed right now / recent history: CURRENT_STATUS.md
- What's deliberately not done yet: ROADMAP.md, TECHNICAL_DEBT.md
- How to work on this repo: DEVELOPMENT_RULES.md
- Project rules (pre-existing, authoritative): `/CLAUDE.md`
