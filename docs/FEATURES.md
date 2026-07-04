# FIFO PRO — Current Features

Organized by navigation category, matching the app's own hub structure.

## דשבורד (Dashboard) category

### Mission Control (home screen — `#tab-hub-dashboard`, `#mission-control`)
The landing screen. Shows, using live data only (no full tables/charts):
- Open P&L across all live positions (+ live-position count, % of cost)
- Today / Week / Month realized P&L (from closed trades)
- Open positions summary (count + symbols)
- Biggest-risk open position (largest loss %, tagged with risk-status label)
- One short AI Coach insight sentence (consecutive-loss streak, no-stop
  pattern, win-rate based encouragement/warning — cheap heuristics, not the
  full AI Coach analysis)
- Alert badge (see Alerts, under Positions below)
- Nav cards below linking into: דשבורד ראשי, סיכום יומי, יעדים, התקדמות,
  ציר זמן, ציון מסחר

Re-renders after every price poll (every 15s) so Open P&L / biggest-risk
stay live without re-rendering anything else.

### דשבורד ראשי (Main dashboard — `#tab-dashboard`)
KPI grid, portfolio health card, Equity Curve chart, Monthly Net P&L chart,
Drawdown chart, goal card. Rendered lazily on first visit (see
ARCHITECTURE.md — Lazy rendering).

### סיכום יומי (Daily Brief — `#tab-brief`)
Hero card: greeting, date, KPIs (Open P&L, month net, goal %, open
positions, month trades, win rate), one-line AI coach message, "what
changed since last visit" (based on `Auth.getLastVisit()`), today's risks
(positions down >8% or near stop), watchlist mini-strip with live prices.

### יעדים (Goals — `#tab-goals`)
Monthly goal ring (SVG progress ring), simulation (trading days left,
required $/day, current avg/trade, projected month-end), editable monthly
goal input, month-history table.

### התקדמות (Progress — `#tab-progress`)
Win Rate over time, 3-month rolling average net, Profit Factor over time,
"strongest week of month" chart.

### ציר זמן (Performance Timeline — `#tab-ptimeline`)
Month-by-month cards: net, win/loss counts, win rate, trade-grade badge,
main mistake / main strength / suggested improvement per month. **Collapses
to the latest 3 months by default**, with a "הצג עוד" toggle to expand —
re-collapses every time the screen is re-entered.

### ציון מסחר (Daily Grade — `#tab-grade`)
Per-day trading grade/score (execution, risk, discipline, psychology).

## מסחר (Trading) category

### פוזיציות פתוחות (Open Positions — `#tab-positions`)
Card grid (one card per open position), each showing: symbol, live-dot
indicator, risk-status pill (🔴 סיכון גבוה / 🟠 אזהרה / 🟢 תקין — colored
left border matches), live price, daily % change (gated on the backend's
`changePctValid` flag — never recomputed client-side), pre/after-market
price if available, quantity, entry price, current value, P&L % and P&L $
(both USD and ILS), target/stop-loss with distance %, notes, edit/delete
actions. Summary bar above the grid: total cost, current value, Open P&L
$/%, live-count. R:R calculator in the add/edit modal.

**Alerts:** target-hit / stop-hit / down-5% conditions are recomputed every
15s poll but only **toast once per day per (symbol, type, threshold)** —
deduped via `localStorage`. A persistent "🔴 N התראות" badge in the header
always reflects the current active-alert count; clicking it opens a
dropdown listing every active alert.

### היסטוריית עסקאות (Trades — `#tab-trades`)
Sortable/filterable table of closed trades (search, symbol filter, month
filter). CSV export. **Shows latest 20 rows by default** with a "טען עוד"
(load more) button — not the full history at once.

### כניסה מהירה (Quick Trade — `#tab-quicktrade`)
Fast single-form trade entry: live price lookup by symbol, buy/sell
calculator, position sizer (portfolio size / risk % / stop price →
recommended share count).

### רשימת מעקב (Watchlist — `#tab-watchlist`)
Symbols to watch with live prices, notes, add/remove.

### יומן מסחר (Journal — `#tab-journal`)
Per-trade journal: entry/exit reason, respected-stop, followed-plan,
lesson, emotion. **Shows latest 20 rows by default** with a "טען עוד"
button, same pattern as Trades.

## ניתוח (Analysis) category

- **ניתוח גרפי** (`#tab-analysis`) — net P&L and win rate charts by symbol.
- **ביצועים** (Performance Center, `#tab-performance`) — professional
  metrics, symbol intelligence, sector exposure.
- **תובנות** (Insights, `#tab-insights`) — auto-generated insights, advanced
  stats, day-of-week / hold-duration / position-size profit breakdowns,
  Mistake Detector grid.
- **Trade Replay** (`#tab-replay`) — visual month-by-month trade timeline.
- **Heatmap תיק** (Portfolio Heatmap, `#tab-portheatmap`) — contribution to
  total P&L by symbol, sized/colored by magnitude.
- **לוח שנה** (Calendar Heatmap, `#tab-heatmap`) — daily P&L calendar,
  year selector.
- **לפי סימבול** (Symbol Notes, `#tab-symnotes`) — per-symbol aggregated
  insights/lessons, searchable.

## בינה מלאכותית (AI) category

- **מנוע החלטות** (Decision Engine, `#tab-decision`) — pre-trade analysis:
  Market Technical Score (real market data; shows "Insufficient market
  data" if unavailable, never invented) + Trade Discipline Score (from the
  user's own trade history) + news summary. Explicitly does not replace
  judgment.
- **מאמן AI** (AI Coach, `#tab-coach`) — full behavioral analysis: trading
  style detection (day/swing/position trader), holding-losers /
  early-exits / chasing / no-stop pattern detection, revenge-trading
  detection, best/worst symbols, weekly action items. Rendered lazily only
  when this tab is opened (not on boot — see ARCHITECTURE.md).
- **שיחה עם AI** (AI Chat, `#tab-aichat`) — free-form chat, context includes
  trades/positions/stats/watchlist, proxied through Apps Script to the
  Anthropic API (key never in the browser).

## הגדרות (Settings) category

- **הגדרות מערכת** (`#tab-settings`) — password change (backend auth flow
  still exists, currently unused while `AUTH_DISABLED = true`), theme,
  monthly goal, module toggles.

## Cross-cutting

- **Dark/Light mode** toggle, persisted to `localStorage`.
- **CSV export** of all closed trades.
- **RTL Hebrew UI** throughout.
- **PWA**: installable, offline-capable static shell (data itself requires
  network — Apps Script is never cached).
- **Mobile-first responsive layout** — bottom nav bar replaces the top nav
  category bar on small screens; grids collapse to 1–2 columns.
