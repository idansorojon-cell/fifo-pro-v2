# FIFO PRO 2.0 — Current Features

_Rewritten for FIFO PRO 2.0 ("Quiet Terminal"). The v1 hub→tab model
(5 categories, ~26 tabs) was replaced by 7 flat destinations + one
unified Trade Ticket. Every v1 capability was preserved — reorganized,
not removed. See the "v1 → v2 map" at the bottom._

## Navigation model

A right-docked icon rail (desktop) / bottom nav (mobile) with 7 flat
destinations: **Home · Positions · Trades · Performance · Research ·
Coach · Chat**. Settings moved to the avatar menu (rail bottom /
topbar on mobile). `navigate(dest)` in `js/app.js` is the router;
`switchTab()` remains as a redirect shim for legacy names.

## Home (`#screen-home`, `js/home.js`)

Replaces v1's four home screens (Cockpit, Mission Control, main
Dashboard, Daily Brief) with ONE surface, action-first:

- **Attention queue** — ranked action items from live position risk
  (reuses `Cockpit.buildActionItems()`: no-stop-while-losing first,
  then high/warn risk).
- **One hero number** — Open P&L (unrealized, live-dot, refreshed by
  the 15s poll), with an expandable breakdown of realized
  today/week/month — computed in ONE place (`Home._realizedWindows`),
  ending v1's four parallel re-derivations.
- **4 context chips** — open positions count, Win Rate, monthly-goal %,
  exposure % (uses Settings portfolioSize).
- **Positions preview** (first 3, click-through) and **one Coach line**
  (`Cockpit.riskAwareInsight`, falls back to `_shortCoachInsight`).

## Positions (`#tab-positions`, `js/positions.js`)

- v2 card (`.pcard`): status pill, mono live price + backend-gated
  daily % (`changePctValid` — never recomputed client-side), pre/AH
  chips (neutral color), **R:R gauge** (stop → entry tick → target with
  live-price marker; missing stop/target stated plainly in amber),
  **entry thesis** (position notes) visible while the position is open,
  qty/value/P&L row ($ + ₪ + %), full-width edit/remove actions.
- Edit modal: target/stop/notes only (FIFO facts read-only) via
  `upsertPositionMeta`. Remove = SELL-at-cost correction (zero P&L),
  unchanged. Alerts (target/stop/-5%, once-per-day dedup, badge +
  dropdown) unchanged.

## Trades (`#tab-trades`, `js/trades.js` + `js/ledger.js`)

One screen, two modes (segmented control):

- **לפי עסקה** — the closed-trades table (search/symbol/month filters,
  sort, CSV, 20-row paging). **Rows expand inline** to the trade's
  journal entry (entry/exit reason, stop/plan adherence, lesson,
  emotion, note) with an edit button into the journal modal; a blue dot
  marks journaled trades. The v1 disabled edit/delete icons are gone —
  the expanded row states that recorded-trade corrections happen in the
  operations sheet.
- **לפי סימבול** — the Ledger (one row per symbol: watching/open/
  history, expandable detail), rendered by the unchanged Ledger module
  into `#tab-ledger`, now nested inside Trades.

The standalone Journal screen was absorbed; `Journal` module's modals
still do the editing (via `upsertTradeMeta`, composite-key matched).

## Trade Ticket (`#trade-ticket` slide-over, `js/tradeTicket.js`)

ONE entry point replacing Add-Trade modal + New-Position modal + Quick
Trade screen. Three intents (symbol preserved when switching):

- **פתיחת פוזיציה** — live price lookup, sizing + real R:R (from the
  actual target) in the same flow, optional target/stop, and the entry
  thesis captured at entry (→ position notes). Writes BUY via
  `appendOperation` + optional `upsertPositionMeta`.
- **סגירת פוזיציה** — pick an open position (qty prefilled), tax-true
  net preview, journal fields IN THE SAME FLOW — attached post-reload
  via `upsertTradeMeta` to every trade derived from the exit. Writes
  SELL via `appendOperation` (server still rejects oversells).
- **רישום עסקה** — historical BUY+SELL pair via `addTradeOperation`.

Plus a Research handoff: "בדוק קודם במנוע ההחלטות" pre-fills the
Decision Engine with the typed symbol/entry/stop/target/qty.

## Performance (`#screen-performance`, `js/performance.js`)

One segmented screen replacing eight v1 analysis screens:

- **סקירה** — 8 canonical KPI tiles (each metric ONCE, straight from
  `calcStats()`): total net, WR, PF, expectancy, Sharpe, MaxDD, avg
  hold, max streaks — plus equity curve / monthly net / drawdown charts.
- **לפי סימבול** — per-symbol net/WR charts + summary table, portfolio
  heatmap, symbol notes (searchable).
- **לפי זמן** — calendar heatmap (year selector), WR/rolling-avg/PF/
  week-of-month charts, monthly Performance Timeline.
- **משמעת** — Mistake Detector (9 canonical rules from
  `Utils.detectMistakes`), day-of-week/hold/size behaviour charts,
  Daily Grade.
- **Replay** — Trade Replay, unchanged.

Deliberately dropped as duplicative/dead (audit-confirmed): the v1
insight-cards + adv-stats (duplicated the same metrics on one screen),
sym-intel (duplicated the per-symbol table), sector-exposure (was a
placeholder — no sector data exists), dash-hero/KPI-grid (Home +
Overview cover them).

## Research (`#screen-research`)

Watchlist + Decision Engine merged into one pre-trade flow: the DE form
(symbol/entry/stop/target/qty/portfolio → Technical + Discipline + News
scores; "Insufficient market data" when real data is missing, never
invented) + a "פתח טיקט מסחר עם הנתונים" handoff button + the live
Watchlist grid with add/remove/refresh.

## Coach (`#screen-coach`)

The two v1 coach screens became one destination with two panes:

- **היום — מבוסס עדויות** (primary; `js/coach.js`) — live-position
  findings, every claim numerically backed or explicitly "not enough
  data"; the honest "can't answer" section retained.
- **דפוסים היסטוריים** (`js/aiCoach.js`) — full-history style/pattern
  analysis, strengths/weaknesses, weekly actions.

The screen states plainly that both are **deterministic calculations,
not a language model**.

## Chat (`#tab-aichat`, `js/aiChat.js`)

The one genuinely LLM-backed feature (Claude via Apps Script proxy;
key never in the browser). Now opens with an explicit data-availability
disclosure: what the model receives (summary stats, open positions with
live P&L, watchlist, last 10 journal lessons) and what it does not
(live market data beyond your positions, news) + a cross-check note.

## Settings (`#tab-settings`, `js/settings.js`)

Unchanged module, reached via the avatar menu. Theme, monthly goal,
portfolio/risk defaults, live-data controls, alerts toggle, backup/CSV/
import, security (password, sessions, Viewer management + per-viewer
positions permission), about.

## Cross-cutting

- **Quiet Terminal design system** (`css/system.css`) — see
  DESIGN_SYSTEM.md. Dark default + full light theme (`body.light`).
- Mono tabular numerals on every aligned figure; RTL Hebrew throughout
  with `<bdi>` isolation on mixed-direction values.
- Boot loading skeleton; `:focus-visible` on all interactive elements;
  40px mobile touch targets on row actions.
- PWA (`sw.js` cache v34+), CSV export, once-a-day alert dedup — all
  unchanged.

## v1 → v2 map

| v1 screen | v2 home |
|---|---|
| Cockpit / Mission Control / דשבורד ראשי / סיכום יומי | Home |
| יעדים (goals ring/sim) | Home chip (goal %) + Settings (editing); ring/simulation retired |
| פוזיציות פתוחות | Positions |
| היסטוריית עסקאות | Trades → לפי עסקה |
| Ledger | Trades → לפי סימבול |
| יומן מסחר | Trades → inline per row + modal |
| כניסה מהירה / + עסקה / + פוזיציה | Trade Ticket |
| ניתוח גרפי / Heatmap תיק / לפי סימבול | Performance → לפי סימבול |
| תובנות (charts+mistakes) / ציון מסחר | Performance → משמעת |
| התקדמות / ציר זמן / לוח שנה | Performance → לפי זמן |
| ביצועים (perf-grid) | Performance → סקירה |
| Trade Replay | Performance → Replay |
| רשימת מעקב / מנוע החלטות | Research |
| מאמן AI / Coach—מבוסס עדויות | Coach (two panes) |
| שיחה עם AI | Chat |
| הגדרות (nav category) | Avatar menu → Settings |
