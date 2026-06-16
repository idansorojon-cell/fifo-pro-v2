# FIFO PRO — System Architecture (README_AI.md)

> This file is for AI assistants (Claude, Gemini, ChatGPT, Copilot).
> Read this before touching any code.

---

## What is FIFO PRO?

A personal stock trading journal and analytics dashboard.
Built for an Israeli trader who trades US stocks.
Tax rate: 25% capital gains (Israeli law).
Currency: USD primary, ILS secondary (with monthly exchange rates).
Backend: Google Sheets + Google Apps Script (no server, no DB).
Frontend: HTML + CSS + Vanilla JS (no React/Vue/Angular).

---

## Data Flow

```
User Browser
    │
    ├── index.html  (shell + tab routing)
    │
    ├── js/app.js   (init, state, tab switching)
    ├── js/api.js   (all network calls)
    ├── js/utils.js (formatting, calcStats, helpers)
    │
    └── Tabs render via dedicated modules:
        dashboard.js, positions.js, watchlist.js,
        journal.js, analytics.js, decisionEngine.js,
        aiCoach.js, aiChat.js

        ↕ (fetch / POST)

Google Apps Script (doGet / doPost)
    │
    └── Google Sheets
        ├── Sheet: Trades      (all closed trades)
        ├── Sheet: Positions   (open positions)
        ├── Sheet: Watchlist   (symbols to watch)
        ├── Sheet: Journal     (trade notes — merged into Trades rows)
        └── Sheet: Settings    (monthly goal, etc.)
```

---

## Trade Object Schema

```js
{
  id:            Number,   // unique row ID
  symbol:        String,   // "AAPL"
  buy_date:      String,   // "DD/MM/YYYY"
  sell_date:     String,   // "DD/MM/YYYY"
  qty:           Number,   // shares
  buy_price:     Number,   // USD
  sell_price:    Number,   // USD
  cost:          Number,   // qty × buy_price
  gross:         Number,   // qty × (sell - buy)
  tax:           Number,   // gross × 0.25
  net:           Number,   // gross - tax
  pct:           Number,   // % gain/loss
  hold_days:     Number,   // calendar days
  month:         String,   // "YYYY-MM"
  notes:         String,   // free text

  // Journal fields (filled via Journal tab)
  entry_reason:  String,
  exit_reason:   String,
  respected_stop:String,   // "כן" | "לא" | "לא היה סטופ"
  followed_plan: String,   // "כן" | "לא" | "חלקית"
  lesson:        String,
  emotion:       String,
}
```

---

## Position Object Schema

```js
{
  id:          Number,
  symbol:      String,
  qty:         Number,
  avg_price:   Number,   // average entry price USD
  target:      Number,   // take profit price
  stop_loss:   Number,   // stop loss price
  notes:       String,
  added_date:  String,   // "DD/MM/YYYY"
}
```

---

## Watchlist Object Schema

```js
{
  symbol: String,   // "AAPL"
  note:   String,   // optional note
  added:  String,   // date added
}
```

---

## Global State (window.APP)

```js
window.APP = {
  trades:     [],        // all closed trades (from Sheets)
  positions:  [],        // open positions
  watchlist:  [],        // watchlist symbols
  liveData:   {},        // { "AAPL": { price, prevClose, changePct, ... } }
  monthGoal:  5000,      // monthly profit target ($)
  darkMode:   false,
  sortCol:    'sell_date',
  sortDir:    -1,
  charts:     {},        // Chart.js instances keyed by id
  statsCache: null,      // cached calcStats() result
}
```

---

## Apps Script Endpoints

All via `fetch(API_URL + '?action=X')` (GET) or `fetch(API_URL, {method:'POST', body:JSON})` (POST).

| Action           | Method | Description |
|------------------|--------|-------------|
| getTrades        | GET    | Returns all trades array |
| add              | POST   | Add new trade |
| update           | POST   | Update existing trade (by id) |
| delete           | POST   | Delete trade (by id) |
| seedAll          | POST   | Bulk insert historical trades |
| getGoal          | GET    | Returns { goal: Number } |
| setGoal          | POST   | Save monthly goal |
| getPositions     | GET    | Returns positions array |
| addPosition      | POST   | Add open position |
| updatePosition   | POST   | Update position |
| deletePosition   | POST   | Delete position |
| getWatchlist     | GET    | Returns watchlist array |
| addWatchlist     | GET    | Add symbol to watchlist |
| removeWatchlist  | GET    | Remove symbol |
| getPrices        | GET    | Live prices via Yahoo Finance proxy |
| getIndicators    | GET    | Technical indicators for Decision Engine |

---

## Live Price Data Shape

```js
liveData["AAPL"] = {
  price:      Number,   // current price
  prevClose:  Number,   // previous close
  change:     Number,   // $ change
  changePct:  Number,   // % change
  preMarket:  Number,   // pre-market price (if available)
  postMarket: Number,   // after-hours price (if available)
  volume:     Number,
  updated:    String,   // "HH:MM:SS" local time
  source:     "apps-script",
  ok:         true
}
```

---

## calcStats() Output

The main analytics function in `utils.js`. Returns:

```js
{
  totalNet, totalNetIls,
  wins, losses, total,
  winRate, pf, avgWin, avgLoss, avgHold,
  expectancy, kelly, sharpe,
  maxDD, recoveryFactor,
  largestWin, largestLoss,
  maxWS, maxLS,           // max winning/losing streaks
  monthArr,               // [{ month, label, net, trades, wins }]
  equity,                 // [{ label, cum }] cumulative equity
  curMonth, curMonthNet,
  symArr,                 // per-symbol stats
  byDate,                 // { "YYYY-MM-DD": net } for heatmap
  byDow,                  // { 0..6: { net, c } } by day of week
  holdBuckets,            // { "0 ימים": net, ... }
  sizeBuckets,            // { "<$5k": net, ... }
  gp, gl                  // gross profit, gross loss
}
```

---

## Key Design Decisions

1. **No framework** — Vanilla JS only. Easier to maintain for a solo developer.
2. **Google Sheets as DB** — No hosting cost, accessible from anywhere.
3. **FIFO tax method** — Positions closed first-in-first-out per Israeli tax law.
4. **25% flat tax** — Applied to gross profit per trade.
5. **Monthly ILS rates** — Hard-coded exchange rates for accurate ILS reporting.
6. **localStorage backup** — Positions and watchlist cached locally for offline fallback.
7. **Polygon.io WebSocket** — Used for real-time prices on Positions tab (falls back to polling).
8. **Apps Script proxy** — Yahoo Finance prices go through Apps Script to avoid CORS.

---

## File Responsibilities

| File | Responsibility |
|------|---------------|
| `index.html` | Shell, all tab HTML, modal HTML |
| `css/style.css` | Full design system, dark mode variables |
| `css/mobile.css` | Responsive overrides, PWA, print |
| `js/app.js` | Init, global state, tab routing, seed banner |
| `js/api.js` | All fetch calls, WebSocket, status bar |
| `js/utils.js` | Formatters, parsers, calcStats, helpers |
| `js/dashboard.js` | KPI render, weekly summary, goal card |
| `js/charts.js` | All Chart.js instances (equity, monthly, DD, etc.) |
| `js/positions.js` | Open positions, live prices, alerts |
| `js/watchlist.js` | Watchlist CRUD, live prices |
| `js/journal.js` | Trade journal modal + render |
| `js/analytics.js` | Insights, heatmap, symbol notes, performance |
| `js/decisionEngine.js` | Pre-trade scoring, trade memory |
| `js/aiCoach.js` | Behavioral analysis, pattern detection |
| `js/aiChat.js` | AI chat with full trading context |

---

## Do Not Touch Without Understanding

- `calcStats()` in utils.js — all analytics depend on this
- `normalizeTrade()` — date parsing is fragile
- `API_URL` — production endpoint
- `MONTHLY_ILS` — exchange rate table
- `SEED` data in app.js — historical trade data

---

## Testing Checklist

Before any deploy:
- [ ] Add a trade → appears in table → syncs to Sheets
- [ ] Edit a trade → updates correctly
- [ ] Delete a trade → removed everywhere
- [ ] Open position → live price loads
- [ ] Watchlist → add/remove syncs to Sheets
- [ ] Decision Engine → returns score for a symbol
- [ ] AI Coach → shows insights
- [ ] Dark mode → all elements styled
- [ ] Mobile → no overflow, FAB visible, tabs scroll
