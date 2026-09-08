# FIFO PRO — Workspace upgrade review

2026-09-08. Review iteration, not a production release.

## Scope and baseline

Based on main at `7d30107fccf83fe56f4da6dd00956e46c4ba87c7`.
Preserves the existing vanilla JS app, all destinations, endpoint contracts,
owner/viewer authentication, and calculations. Does not merge or overwrite
`premium-redesign`; reuses only its existing self-hosted font assets.

## Added

- Home: canonical monthly realized-profit curve, selectable current month/all
  history, separated from unrealized position P&L. Explicitly not portfolio
  value, a return percentage, or a broker balance.
- Command search: destinations, known symbols, new trade (owner only),
  Ctrl/Cmd+K, keyboard navigation, Escape, native modal focus containment.
- Home work queue: missing journal records and missing recorded stops; routes
  directly into existing journal/position editors, no automatic write.
- Recent closed trades with symbol-filtered drill-down.
- Readable Hebrew typography from existing Heebo/JetBrains Mono assets;
  wider labeled desktop navigation; light/dark styles.
- Quote-gap disclosure: missing prices no longer display as a known zero P&L.
- Fixed hidden breakdown CSS; expansion remains stable on Home re-render.
- Fixed dark-mode position-preview contrast and narrow-screen performance
  overflow. Dense data remains available; chart/table scrolling is local.
- Added all new assets and previously missing perfMetrics.js to SW precache;
  coherent optional review version stamp, not deployed to GitHub Pages.

## Verification performed

`npm test` passes: existing smoke checks, monthly/all/empty/zero/negative
chart cases, finite coordinates, local assets, precache completeness, icons,
quote-gap guard, and isolated build exclusions.

Browser on synthetic data:
- Home, month switch ($878), all-history ($5,535).
- Search NVDA -> 6 filtered trades.
- Journal task -> edit -> save -> count 9 to 8 -> reload retains 8.
- Missing stop -> existing position editor -> save -> task becomes review.
- All five Performance segments opened; no app-origin console errors.
- Dark and light views inspected.
- 360px iframe viewport (350px content after scrollbar): Home and Performance
  document scrollWidth equals clientWidth after fixes. This is responsive
  browser testing, NOT a physical iPhone/Safari certification.

## Isolated review

Run `npm run review`, then `npm run dev` for internal development.
`review-dist` uses the same frontend modules and markup, with a separate
synthetic data adapter. Build excludes production API/auth/version network
modules, historical SEED data, service worker registration. CSP blocks all
connect, worker and form-action requests. No broker connection or real AI.

Journal, stop/target/notes, watchlist and preferences are local demo writes.
BUY/SELL, historical trade creation, security administration and AI chat
return explicit unavailable errors; no success is faked. Charts and market
prices use labeled fictional fixtures. Reset affects demo storage only.

## Release gates / remaining work

Not merged to main. No Google Sheets, Apps Script, broker or live production
write was performed. `js/utils.js`, `js/api.js`, `js/auth.js`,
`AppScript_FULL.gs` remain byte-for-byte identical to baseline.

Before production: owner design approval, real authenticated read smoke,
owner/viewer regression, actual device/Safari check, and controlled write
round-trip with an explicit production-data test plan. Existing unsupported
recorded-trade corrections, backend limitations and pending work described
in the repo docs remain unchanged. This is a focused workspace upgrade,
not a claim that every existing capability was rebuilt or end-to-end verified.
