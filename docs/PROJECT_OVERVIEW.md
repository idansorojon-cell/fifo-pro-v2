# FIFO PRO — Project Overview

## What it is

FIFO PRO is a personal trading journal and analytics dashboard for an Israeli
trader who trades US stocks. It is **not** a demo — it is a daily-use
production tool tracking real trades, real open positions, and real P&L.

- Tax model: Israeli capital gains, 25% flat, applied client-side to every
  closed trade (`gross → tax → net`).
- Currency: USD is primary; ILS is a secondary display computed via a
  monthly exchange-rate table (`Utils.usdToIls`).
- Single user, single password (or no password — see Authentication).

## Product goals

- Be the trader's single source of truth for closed trades, open positions,
  and a watchlist.
- Surface *decision-relevant* information fast (Mission Control home screen)
  rather than a wall of tables and charts.
- Behavioral coaching (AI Coach, Decision Engine, Mistake Detector) — help
  the trader see patterns in their own behavior, not just P&L numbers.
- Live prices for open positions, refreshed automatically.

## Architecture at a glance

```
Browser (GitHub Pages static site)
  index.html + css/*.css + js/*.js
        │  fetch (GET/POST, no build step, no framework)
        ▼
Google Apps Script Web App (doGet/doPost) — the "backend"
        │
        ├── Google Sheets  (Trades, Positions, Watchlist, Settings — data store)
        ├── Finnhub API    (live prices — proxied server-side)
        ├── Finnhub API    (news, insider transactions, earnings)
        └── Anthropic API  (AI Chat — proxied server-side)
```

There is no database, no server framework, no build pipeline. The Apps
Script project *is* the backend; Google Sheets *is* the database.

## Tech stack

- **Frontend:** vanilla HTML/CSS/JS (ES6+, no framework, no bundler). Chart.js
  via CDN for the only charting need.
- **Backend:** Google Apps Script (`AppScript_FULL.gs`), deployed as a Web App.
- **Data store:** Google Sheets — **potentially two separate spreadsheets**,
  not one (see "Two spreadsheets" below — this is easy to miss).
- **Hosting:** GitHub Pages, repo `idansorojon-cell/fifo-pro-v2`, branch `main`.
- **PWA:** `manifest.json` + `sw.js` service worker for offline/installable
  behavior.
- **Local project path:** `/Users/idansorojon/Desktop/claude/fifo/files`
  (note the nested `files/` — that's the actual git repo root, not `fifo/`).
  Sibling folders in the same parent directory (`dana-care/`,
  `trading-dashboard/`) are **unrelated projects** — see
  DEVELOPMENT_RULES.md's "Local development" section for a preview-tool
  naming collision this caused once this session.

## Two spreadsheets (important, easy to miss)

The backend can read from **two different Google Sheets**, not one:

1. The Apps Script project's own **bound spreadsheet** (`SpreadsheetApp
   .getActiveSpreadsheet()`), containing the legacy `Trades`, `Positions`,
   `Watchlist`, `Settings` sheets used by `getTrades`/`addTrade`/
   `getPositions`/`addPosition`/etc.
2. A **separate spreadsheet identified by the `OPERATIONS_SPREADSHEET_ID`
   Script Property**, containing a `"פעולות"` (Operations/transactions)
   sheet, read by `getOperations` — this is the path the frontend tries
   **first** (see `js/api.js`'s `loadAll()`), falling back to
   `getTrades`+`getPositions` only if it fails. If `OPERATIONS_SPREADSHEET_ID`
   isn't set, a **hardcoded fallback spreadsheet ID is baked into the source**
   (`getOperationsSheet_()` in `AppScript_FULL.gs`).

**Why this matters:** `getOperations` derives both closed trades *and* open
positions from the raw BUY/SELL rows in `"פעולות"` via FIFO matching
(`applyFIFO_`). The derived positions **always have `target`, `stop_loss`,
and `notes` hardcoded to `''`** — those fields are never populated from
this path. See TECHNICAL_DEBT.md — "Position target/stop/notes may be
silently dropped" for the consequence of this.

## Script Properties reference

All configuration lives in Apps Script's Script Properties (Project
Settings → Script Properties in the Apps Script editor), never in git:

| Property | Purpose | Status |
|---|---|---|
| `LOGIN_PASSWORD` | Session auth password (hash or plaintext) | present but unused while `AUTH_DISABLED = true` |
| `SESSION_TTL_HOURS` | Session token lifetime (default 720 = 30 days) | present but unused while `AUTH_DISABLED = true` |
| `FINNHUB_API_KEY` | Live prices (`getPrices`) + news/insider/earnings | **active, required** |
| `ANTHROPIC_API_KEY` | AI Chat (`aiChat` action) | **active, required** |
| `OPERATIONS_SPREADSHEET_ID` | Spreadsheet ID containing the `"פעולות"` sheet | active if set; otherwise a hardcoded fallback ID is used — see "Two spreadsheets" above |
| `POLYGON_API_KEY` | Live prices, alternate provider | **dormant** — code present, not called |
| `YAHOO_FALLBACK_ENABLED` | Yahoo Finance as price fallback | **dormant** — code present, not called |

If any live-behavior debugging doesn't make sense, check these are set
correctly before assuming the code is wrong — this is external
configuration invisible to git.

## Deployment

Two independent deployment targets that do **not** deploy together:

1. **Frontend** — `git push origin main` → GitHub Pages rebuilds
   automatically (~30–90s).
2. **Backend** — `AppScript_FULL.gs` must be **manually pasted** into the
   Apps Script editor (script.google.com) and redeployed via
   *Deploy → Manage deployments → Edit → New version → Deploy*. Pushing to
   git does **nothing** to the live Apps Script backend.

This split is the single most common source of "I pushed a fix but it's
not working" — always check which side of the fix needs which deployment.

## APIs

| API | Used for | Called from |
|---|---|---|
| Google Apps Script Web App | all data CRUD, prices, indicators, news, AI Chat | frontend (`js/api.js`) |
| Finnhub `/quote` | live prices for positions/watchlist | backend only (`AppScript_FULL.gs`) |
| Finnhub `/company-news`, `/insider-transactions`, `/calendar/earnings` | Decision Engine news panel | backend only |
| Anthropic API | AI Chat responses | backend only (key never touches the browser) |

Polygon.io was tried as a price provider and **fully reverted** — see
[CURRENT_STATUS.md](CURRENT_STATUS.md) and [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md).

## Authentication

Session auth exists in the backend (`LOGIN_PASSWORD` + `FIFO_SESSIONS` Script
Properties, SHA-256 password hash, UUID session tokens with TTL) but is
**currently bypassed on both sides**:

- Backend: `AUTH_DISABLED = true` in `AppScript_FULL.gs` — every request is
  accepted, `validateToken_()` is short-circuited.
- Frontend: `AUTH_DISABLED = true` in `js/auth.js` and `js/api.js` — the
  login screen is never shown, `Auth.init()` returns `true` immediately.

The login UI itself was **removed from `index.html`** (not just hidden) as
part of the same round of fixes. To restore full auth, see
[TECHNICAL_DEBT.md](TECHNICAL_DEBT.md#restoring-authentication).

## Data flow (summary — full detail in ARCHITECTURE.md)

1. Boot: `js/app.js` IIFE → `_initApp()` → `load()` → `API.loadAll()` → GET
   `getOperations`/`getGoal`/`getWatchlist` from Apps Script → populates
   `window.APP` (global state) → `renderMissionControl()` only.
2. Navigation: `switchTab(name)` lazily renders whichever screen was just
   opened (dashboard/trades/journal/positions/etc.) — nothing else is
   rendered until selected.
3. Prices: `Positions.refreshPrices()` polls every 15s, calls
   `getPrices` (Finnhub, server-side), updates `APP.liveData`, re-renders
   the positions grid and Mission Control.
