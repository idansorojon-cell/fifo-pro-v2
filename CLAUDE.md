# FIFO PRO – Claude Project Instructions

## Project Goal

FIFO PRO is an institutional-grade trading dashboard.

The goal is to become one of the best personal trading management systems.

This is NOT a demo project.

Every change must improve the production system.

---

# Golden Rules

Never break existing functionality.

If a feature already works:
- Keep it working.
- Extend it instead of replacing it.

Never remove functionality unless explicitly instructed.

If unsure:
Ask before deleting code.

---

# Architecture

Always keep the project modular.

Structure:

```
/
index.html

/css
style.css
mobile.css

/js
app.js
api.js
dashboard.js
charts.js
positions.js
watchlist.js
journal.js
analytics.js
decisionEngine.js
aiCoach.js
aiChat.js
utils.js

/assets

manifest.json
sw.js
AppScript.gs
CLAUDE.md
README_AI.md
```

---

# Code Quality

Always write clean code.

Split large functions.

Avoid duplicated logic.

Reuse helper functions from utils.js.

Use meaningful names.

No inline CSS — use CSS classes from style.css.

No inline JavaScript in HTML.

Keep files small and focused.

---

# Mobile First

Everything must work perfectly on:

- iPhone Safari
- Android Chrome
- Desktop Chrome
- Desktop Safari
- Desktop Edge

Nothing should overflow.

Cards must remain responsive.

Tables should scroll horizontally if needed.

---

# Dashboard Rules

Dashboard is the heart of the application.

Never slow it down.

Always lazy load heavy calculations.

Charts must update automatically.

Animations should remain smooth.

---

# Trading Logic

Never change calculations without understanding the logic.

Current calculations in utils.js are considered production.

If improvements are made:
- Explain why.
- Never silently modify trading calculations.

Key formulas:
- gross = qty × (sell_price - buy_price)
- tax = gross × 0.25  (Israeli capital gains)
- net = gross - tax
- pct = (sell_price - buy_price) / buy_price × 100
- hold_days = sell_date - buy_date in calendar days

---

# AI Features

AI should behave like a professional trading coach.

Never invent market data.

Explain decisions.

Explain mistakes.

Detect trading patterns.

Detect emotional trading.

Detect FOMO.

Detect revenge trading.

Provide actionable improvements.

Always explain WHY.

AI Chat context must include: trades, positions, stats, watchlist.

---

# Watchlist

Watchlist must always sync correctly with Google Sheets.

Never break database compatibility.

Preserve all existing data.

Primary source of truth = Google Sheets.

localStorage = backup only.

---

# Google Apps Script

Compatibility is mandatory.

API_URL must never be changed without permission.

Never break these endpoints:
- getTrades
- addTrade / update / delete
- getPositions / addPosition / updatePosition / deletePosition
- getWatchlist / addWatchlist / removeWatchlist
- getGoal / setGoal
- getPrices
- getIndicators
- seedAll

---

# Performance

Always optimize.

Reduce DOM operations — batch updates.

Use requestAnimationFrame for animations.

Avoid memory leaks — destroy Chart.js instances before re-creating.

Avoid unnecessary API calls — cache prices for 30s.

Cache calcStats() result and invalidate only when trades change.

---

# Error Handling

Never ignore errors.

Always log useful information to console.

Display user-friendly Hebrew messages.

Prevent crashes — wrap async calls in try/catch.

---

# Before Finishing Any Task

Verify:
- [ ] JavaScript has no syntax errors
- [ ] All module imports/exports are correct
- [ ] HTML references all JS/CSS files
- [ ] CSS classes exist in style.css
- [ ] Apps Script compatibility preserved
- [ ] Responsive layout works on mobile
- [ ] Dark mode works correctly
- [ ] No existing functionality broken

Provide a summary:
- Files changed
- New features
- Bug fixes
- Performance improvements
- Known limitations

---

# Development Style

Think like a Senior Software Engineer.

Think before coding.

Understand the entire architecture before making changes.

If a better solution exists, suggest it before implementing.

Never rush. Quality is more important than speed.

---

# Long-Term Vision

FIFO PRO should evolve into a professional trading platform including:

- Institutional Dashboard
- Trading Score
- AI Coach
- Performance Center
- Mistake Detector
- Decision Engine
- Market Scanner
- Smart Watchlist
- Portfolio Analytics
- Risk Management
- Behavior Analysis
- Trade Journal
- Statistics Center
- PWA + Offline Support
- Multi-device Sync
- AI Chat Assistant

Everything should be designed with future scalability in mind.
