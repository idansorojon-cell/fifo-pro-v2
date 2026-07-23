# FIFO PRO — Current Status

_Last updated: 2026-07-23. **Production runs 2.1.0**; branch
`premium-redesign` now also carries **2.2.0 — typography overhaul**
(self-hosted Heebo/JetBrains Mono + full screen audit), NOT yet
merged/pushed. See HANDOFF.md._

## Branch state

- **Production (`origin/main`):** 2.1.0, merge `c280b83`. Rollback tags:
  `rollback/pre-2.1-merge` → `3ae3a8d` (2.0.1), `rollback/pre-2.0-merge`
  → `cf1d454` (v1). Server-synced settings live (owner deployed
  AppScript_FULL.gs 2026-07-23; getSettings/setSettings verified via a
  13-step real-backend test series).
- **Branch `premium-redesign`:** 2.2.0 — typography overhaul: self-hosted
  Heebo (400-800, hebrew+latin) + JetBrains Mono (400/500/700, latin) in
  new css/fonts.css, replacing an unloaded "Inter"/system-font stack that
  had no real Hebrew bold weights on non-Apple platforms (browser-faked
  bold = the reported "pixelated" look). Full screen-by-screen overflow
  audit (automated + visual) across desktop/tablet/mobile found and
  fixed 3 CSS grid-blowout bugs (Positions depth block, Performance
  stats-2col/dist-grid, ttgrid) — all via the standard min-width:0 fix,
  no markup changes. sw.js precache also gained the font files + a
  previously-missing js/perfMetrics.js entry.
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
