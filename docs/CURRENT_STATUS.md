# FIFO PRO — Current Status

_Last updated: 2026-07-23. **Production runs 2.1.0** — "Depth with
hierarchy" (Waves O-U) released with owner approval; server-synced
settings live (backend deployed by owner the same day). See HANDOFF.md._

## Branch state

- **Production (`origin/main`):** 2.0.1, merge `4fabd2a` + bump
  `3ae3a8d`. Rollback tag `rollback/pre-2.0-merge` → `cf1d454` (v1).
- **Branch `premium-redesign`:** 2.1.0 — Waves O (Performance depth:
  3-group 18-KPI board, clickable monthly table with ₪+cumulative+
  Best/Worst, top winners/losers, P&L distribution), P (Positions
  depth: weight/days/distances/live-R:R/$risk + per-symbol record),
  Q (Research decision center: two-column workspace + watchlist rail,
  open-position context, watchlist→ticket), R (Trades filtered-set
  summary strip, Home 8-chip strip). New js/perfMetrics.js; utils.js
  and backend untouched (0 diff).
- **Deployment gate:** owner approval, then merge+push (+15-min-max
  mandatory update for open sessions).

## What FIFO PRO 2.0 is (on this branch)

A full Design Transformation — "Quiet Terminal": 7 flat destinations
(Home / Positions / Trades / Performance / Research / Coach / Chat) +
one unified Trade Ticket slide-over + Settings in an avatar menu,
replacing v1's 5-category hub→tab model (~26 tabs, 4 overlapping home
screens, 3 separate trade-entry points). Full detail: FEATURES.md,
DESIGN_SYSTEM.md ("Quiet Terminal" section), ARCHITECTURE.md.

## Regression guarantee (verified via git diff, not assumed)

Business logic is **byte-for-byte identical to v1**:

| File | diff vs main |
|---|---|
| `js/utils.js` (calcStats, FIFO helpers, tax) | 0 lines |
| `js/api.js` (every endpoint call, auth flags) | 0 lines |
| `js/auth.js` (login/session/viewer) | 0 lines |
| `AppScript_FULL.gs` (the entire backend) | 0 lines |
| charts/analytics/decisionEngine/aiCoach/aiChat/dailyGrade/learningEngine/tradeReplay/performanceTimeline/journal/dashboard/settings/quicktrade/cockpit | 0 lines each |

Changed files are presentation/routing only: `index.html`, `js/app.js`
(routing + dead-code removal), `js/home.js` / `js/tradeTicket.js` /
`js/performance.js` (new), `js/positions.js` (card markup),
`js/trades.js` (row markup + modes), `js/coach.js` / `js/ledger.js`
(header trims), `js/watchlist.js` (chip colors), CSS, `sw.js`.

**No Apps Script redeploy is needed** — the backend was not touched.

## Auth state (correcting older notes)

`AUTH_DISABLED = false` everywhere; the login screen exists and gates
boot; owner/viewer roles enforced server-side. (Docs prior to
2026-07-22 claimed auth was disabled — that described a pre-July-6
state and was already stale before this branch.)

## QA state (synthetic — real-login pass pending)

Verified on a local HTTP preview against the real templates with
synthetic in-memory data (no network writes, nothing touched the live
Sheet): all 8 destinations route and render; all Performance segments;
Trades modes + inline journal; all 3 Ticket intents with correct
tax-math previews; empty/negative/huge-number states; dark + light;
desktop + 375px mobile; keyboard focus; zero console errors throughout.

**Not yet verified (requires the owner's real login):** real data load,
live prices, a real write through the Ticket, viewer-role rendering.
The pre-merge checklist is in HANDOFF.md.

## Service worker

Cache at `fifopro-v35` on this branch. New precached files:
`css/system.css`, `js/home.js`, `js/tradeTicket.js`,
`js/performance.js` (+ the v28 fix that added cockpit/ledger/coach.js).
