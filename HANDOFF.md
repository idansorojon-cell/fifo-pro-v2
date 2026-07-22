# FIFO PRO — Session Handoff

_Paste this into a new session to resume with full context. Detailed
docs live in `/docs` — this is the condensed summary. Updated
2026-07-22 for the FIFO PRO 2.0 Design Transformation._

---

## 1. Where things stand RIGHT NOW

- **Branch `premium-redesign`** (worktree `fifo/fifo-premium-redesign`)
  holds **FIFO PRO 2.0** — a complete Design Transformation, finished
  and synthetically QA'd, **NOT merged, NOT pushed, NOT deployed**.
- **Production (`origin/main`) still runs v1** exactly as before.
- **Rollback point:** `main`@`cf1d454`.
- **Release gate (explicitly agreed with the owner):** the owner runs
  the real-login checklist below on the local preview → approves → then
  merge to `main` + push (which auto-deploys GitHub Pages). No Apps
  Script redeploy is needed — the backend was not touched.

## 2. What FIFO PRO 2.0 is

"Quiet Terminal": 7 flat destinations — **Home** (merges Cockpit +
Mission Control + Dashboard + Daily Brief; attention queue → one Open
P&L hero → realized breakdown → chips → positions preview → coach
line), **Positions** (R:R gauge cards + entry thesis shown while open),
**Trades** (history + Ledger by-symbol + inline journal), **Performance**
(5 segments replacing 8 screens; every KPI once), **Research**
(Watchlist + Decision Engine, handoff to Ticket), **Coach**
(evidence-first + historical patterns; honestly labeled deterministic),
**Chat** (the one real LLM; explicit data-availability disclosure) +
**Trade Ticket** slide-over (open/close/record replacing 3 entry
points; sizing+R:R inline; journal captured at close) + Settings in the
avatar menu. Full detail: docs/FEATURES.md.

## 3. The regression guarantee

`git diff main..premium-redesign` — **0 lines** in: utils.js, api.js,
auth.js, AppScript_FULL.gs, charts.js, analytics.js, decisionEngine.js,
aiCoach.js, aiChat.js, dailyGrade.js, learningEngine.js, tradeReplay.js,
performanceTimeline.js, journal.js, dashboard.js, settings.js,
quicktrade.js, cockpit.js. All FIFO/tax/P&L/stats math and every
endpoint call are byte-for-byte v1. Changed: index.html, app.js
(routing), positions.js/trades.js (markup), coach.js/ledger.js (header
trims), watchlist.js (chip colors), CSS, sw.js (v34), + new home.js/
tradeTicket.js/performance.js/system.css.

## 4. Release checklist (owner, on local preview, BEFORE merge)

Start preview `fifo-premium-preview` (port 5179) → clear SW+caches
(DEVELOPMENT_RULES ritual) → then:

1. **Login** with the real owner credentials → boot skeleton → lands on
   Home with real data.
2. **Home**: Open P&L matches Positions' summary; expand the realized
   breakdown; today/week/month look right vs. your sense of the month.
3. **Positions**: both real positions show live prices, R:R gauge,
   thesis (if notes set); edit target/stop on one → save → refresh →
   persisted.
4. **Trades**: table shows all trades; expand a row → journal fields;
   by-symbol mode shows the Ledger; CSV downloads.
5. **Ticket — רישום עסקה**: record a clearly-marked test trade (e.g.
   ZZTEST) → appears after reload → then delete its rows from "פעולות"
   in the Sheet (same cleanup ritual as previous sessions).
6. **Ticket — פתיחה/סגירה**: optional same-pattern test if you want
   full coverage; the underlying endpoints are unchanged v1 paths.
7. **Performance**: all 5 segments render; Overview totals match the
   old dashboard numbers (same calcStats).
8. **Research**: Decision Engine run on a real symbol; watchlist
   add/remove.
9. **Coach + Chat**: both panes render; send one chat message.
10. **Viewer** (if used): log in as viewer → no write controls, no
    chat input; positions visible only if permission on.
11. **Mobile width + light theme**: quick visual pass.
12. Console: no red errors.

Then: `git -C <worktree> switch main && git merge premium-redesign &&
git push origin main` → cache-busted live check (`?bust=<ts>` on
`sw.js`, expect `fifopro-v34`) → live smoke (login + Home + Positions).
Rollback if needed: `git revert -m 1 <merge>` or reset to `cf1d454` and
force-push (owner's call).


## 4b. Real-device mobile checklist (only you can run these)

On a physical phone, install the PWA and check:
1. On-screen keyboard opens INSIDE the Trade Ticket without hiding the
   submit button; the drawer scrolls to the focused field.
2. Long trades table scrolls horizontally inside its own container (page
   body never scrolls sideways).
3. Open + close a (test) position from the phone; the flow completes.
4. Filters + navigation with a thumb; bottom-nav reachable one-handed.
5. Landscape: nothing overflows; the rail stays hidden, bottom nav stays.
6. Installed-PWA safe areas (notch/home-bar) — nothing clipped.
7. Offline: turn on airplane mode → the offline pill shows, writes are
   blocked; turn it back on → pill clears, app recovers (no reload loop).
8. Update while installed: after you deploy a new version, the installed
   PWA shows the mandatory update overlay on next foreground and updates.

## 5. Known post-merge follow-ups (deliberate, not forgotten)

- Slimming pass: remove dormant modules (dashboard.js, quicktrade.js,
  journal table path) + the shadowed legacy blocks in style.css; drop
  the two `!important`s in system.css afterwards.
- Trades' edit/delete of a recorded trade — still the standing product
  decision (ROADMAP P0), untouched by 2.0.
- SW network-first for HTML (P1), automated tests (P3) — unchanged.
- The mandatory version-update mechanism is part of 2.0 (version.json /
  js/version.js / sw.js via tools/bump-version.sh) — a release is one
  `./tools/bump-version.sh <semver>` then commit+push.
- Launch.json legacy configs (`fifo-pro`, `fifo-matan`,
  `trading-dashboard`) point at a moved path + deleted node binary.

## 6. Standing project truths (unchanged, do not rediscover)

Two-spreadsheet data model ("פעולות" = source of truth via applyFIFO_;
legacy sheets = annotation overlays by stable keys, never synthetic
ids). Symmetric 25% tax, no clamp. `changePctValid` gating. Alert dedup
`symbol+type+threshold` once/day. Finnhub sole price provider. Manual
Apps Script deploys (git push does nothing to the backend). SW
cache-version bump on every index/js change. Verify live with
cache-busting, never assume. Auth ENABLED since 2026-07-06 (older docs
claiming otherwise are stale). Never write test data to the real Sheet
without immediate cleanup.
