# FIFO PRO — Design System

This is the single source of truth for FIFO PRO's visual language as it's
being rebuilt into a premium, professional trading platform (see
HANDOFF.md for the product mandate). Every design-facing phase should
read this first and add to it — this file is expected to grow with each
phase, not get rewritten.

**Direction:** a quiet, dense, high-trust dark terminal — closer to
TradingView/Bloomberg's information density and Linear's typographic
restraint than to a typical "friendly SaaS dashboard." Color is
semantic, not decorative. Chrome should be as invisible as possible; the
trader's numbers are the product.

## Phase log

- **Phase 1 (this phase): icon system.** Replaced every emoji in the
  app's primary navigation chrome — 5 main nav categories, 5 hub
  headers, all 22 hub landing cards, the mobile bottom nav, and the
  always-visible header actions (theme toggle, add trade, logout,
  refresh, CSV export) — with a hand-authored monochrome SVG icon set.
  Deliberately **not yet touched**: card-title emoji (📈 Equity Curve,
  ⚠️ Mistake Detector, etc.) and in-content glyphs (🌙 after-hours tags,
  🔴 alert badges, risk-status pills) — those live inside ~15 different
  JS render functions and are a separate, later phase so this one stays
  reviewable.

- **Phase 3: Mission Control visual hierarchy.** Restructured the home
  screen (`renderMissionControl()` in `js/app.js`) from a flat 6-box grid
  where every number had similar visual weight into a deliberate 3-tier
  hierarchy — see "Mission Control hierarchy" below. All underlying
  calculations (`openPnl`, `todayNet`/`weekNet`/`monthNet`,
  `_biggestRiskPosition()`, `_shortCoachInsight()`) are byte-for-byte
  unchanged — this phase touched only the template and CSS. As part of
  this phase, Mission Control's own remaining emoji (📈/⚠️/🤖 card-title
  prefixes) were also migrated to the icon sprite, since the template was
  already being rewritten — Phase 2's remaining scope (alert badge, risk
  pills, all other screens' card titles) is unaffected by this.
  (Phase 2 itself — the broader card-title/in-content icon pass — has not
  been started; Phase 3 was done first at explicit request.)

- **Live-status UX phase (done between Phase 3 and Phase 2, at explicit
  request): split ambient status from toast notifications.** The
  automatic 15s price poll was showing a "✓ N/N מחירים עודכנו" banner
  every cycle via `#sync-bar`, which was a normal-flow element (not
  `position:fixed`) — every appearance/disappearance reflowed the entire
  page. Fixed by splitting one overloaded mechanism into two: see "Live
  status: ambient vs toast" below. Frontend/UI only, zero calculation
  changes.

- **Phase 2: broader emoji cleanup.** Card-titles, the alert badge and
  alert-toast messages, risk-status pills, position-card target/stop
  labels, Mission Control's coach insight, and Daily Brief's remaining
  icons — see "Phase 2: broader emoji cleanup" below for the full list
  and what's deliberately still deferred (toast checkmarks, `dashboard.js`,
  Mistake Detector, AI Coach's insight-type icons, Daily Grade, and a
  couple of genuine platform constraints). Zero calculation/backend
  changes.

## Mission Control hierarchy (Phase 3)

Three deliberate tiers, top to bottom, each visually quieter than the one
above it:

1. **Hero (`.mc-hero`)** — Open P&L alone. `52px`/weight 800 (vs. `20px`/
   weight 700 for every other number in the old layout) — not just "a bit
   bigger," genuinely dominant. A small pulsing dot (`.mc-live-dot`,
   `@keyframes mc-pulse`) ties it to the 15s price-poll cadence, and the
   card's own border tints toward green/red at low opacity via
   `:has(.mc-hero-value.green/red)` — a secondary, peripheral-vision
   signal beyond just the number's own color. `:has()` is a progressive
   enhancement — unsupported browsers just keep the default border, no
   breakage.
2. **Context strip (`.mc-strip`)** — today/week/month collapsed into one
   bordered unit with internal dividers, not three separate competing
   cards. Deliberately quiet: no individual borders, smaller type
   (`17px`).
3. **Status row (`.mc-grid.mc-grid-2`)** — positions summary + biggest
   risk. The risk card gets a colored right-edge accent
   (`.mc-risk-card`, 4px) matching the exact color `Positions.riskStatus()`
   already uses for `.pos-card--high/warn/ok` elsewhere in the app — same
   severity, same color, everywhere. **Implementation note:** this is set
   via an inline `style="border-right-color:..."` in `js/app.js`, not by
   applying the `.pos-card--*` class to the Mission Control card — reusing
   the class silently failed (the `.mc-card` shorthand `border: 1px solid
   var(--border)` was defined later in `style.css` than `.pos-card--*`,
   so cascade order overrode the color back to default). Inline style has
   the highest specificity and sidesteps the ordering dependency entirely
   — if you add more color-accented cards elsewhere, prefer inline
   style-from-JS over cross-file class reuse for exactly this reason.
4. **AI Coach card** — unchanged position (bottom), icon swapped from 🤖
   to the sprite's `cpu` icon.

Mobile: hero drops to `36px`, strip padding tightens, and the status row
(`.mc-grid-2`) stacks to a single column (existing mobile.css rule,
unchanged) — verified via browser preview at 375×812.

## Live status: ambient vs toast

**Problem:** `#sync-bar` was a single, normal-flow element used for nine
different situations — routine 15s price-poll success/start, poll
failure, full-boot-load status, CRUD confirmations, and genuine errors.
Because it toggled `display:none`/`flex` in normal document flow (no
`position:fixed`), *every* appearance reflowed the whole page — most
visibly the routine poll, which fired every 15 seconds.

**Fix — split into two channels by purpose, not by look:**

1. **Ambient status (header, fixed position, permanent, never a
   banner).** Two elements already existed but were half-wired —
   `#last-updated` (only updated on full boot load) and `#ws-dot`/
   `#ws-label` (a static "Polling" label left over from an abandoned
   real-WebSocket plan). Both are now updated on every price-poll result
   via two new `js/api.js` functions:
   - `API.reportPriceSuccess(loadedCount, total, manual)` — updates
     `#last-updated`'s timestamp and sets `#ws-dot` to `.ws-dot--ok`
     (green, gentle pulse via the same `mc-pulse` keyframe Mission
     Control's hero uses — one consistent "this is live" visual
     language). No banner unless `manual` is true.
   - `API.reportPriceError(msg, manual)` — sets `#ws-dot` to
     `.ws-dot--error` (red, static — a pulsing red would read as
     alarming rather than reassuring) with the error in a `data-tip`
     tooltip (reusing the existing `[data-tip]::after` tooltip
     convention, not a new mechanism).
2. **Toast (`#sync-bar`, now `position:fixed`, floats above content,
   zero layout impact) — reserved for user-triggered actions and
   errors only:** manual refresh button clicks, save/delete
   confirmations, login/session/config errors. `setStatus()` itself is
   unchanged; what changed is *who's allowed to call it for routine
   events* — routine automatic polling no longer does.

**Manual vs automatic is a real parameter, not a guess.** Both
`Positions.refreshPrices(manual = false)` and `Watchlist.refresh(manual
= false)` take an explicit flag. The "🔄 רענן" buttons in `index.html`
call them with `true`; every automatic call site (the 15s
`setInterval` in `startPolling()`, tab-open, initial boot) calls them
with no argument, defaulting to `false`. This is the actual mechanism
that stops the routine case from ever toasting — not a heuristic.

**Recurring errors degrade instead of repeating.** A module-level flag
in `js/api.js` (`_priceErrorStreakShown`) mirrors the existing
once-per-day alert-dedup pattern already used for price alerts in
`positions.js`: the *first* failure in a streak toasts (if automatic) or
always toasts (if manual); every subsequent automatic failure in the
same streak only updates the ambient `#ws-dot` tooltip, silently, until
a poll succeeds again and the flag resets. Verified directly: three
simulated consecutive automatic failures produced exactly one toast
(frozen on the first error's text) while the dot's tooltip kept updating
to the latest error.

**A regression caught during verification, not shipped:** removing the
old `loadAll()` success banner (it duplicated `#last-updated`) initially
left the "טוען נתונים..." (loading) message stuck on screen forever,
because `info`-type toasts don't auto-hide (only `ok` does after 3s) and
nothing was left to replace it. Fixed by explicitly clearing the status
(`setStatus('')`) at both success-return points in `API.loadAll()`.
Caught by checking `#sync-bar`'s actual DOM state after a full reload,
not by assuming the removal was safe.

**Verified, not assumed:** an automatic `refreshPrices()` call was
measured before/after via `getBoundingClientRect()` on the Mission
Control hero card — identical position, confirming zero layout shift.
Manual refresh was confirmed to toast and auto-hide after 3s. The
error-dedup behavior was confirmed via three simulated consecutive
failures. Mobile (375×812): the toast's fixed `top` offset needed a
mobile-specific bump (`68px` → `76px` in `mobile.css`) because mobile
hides `.main-nav`, leaving less natural clearance before the hub title —
caught visually via screenshot, not assumed to just work from the
desktop value.

## Icon system

**Mechanism:** a single hidden `<svg><defs>` sprite of `<symbol>`
elements, injected once near the top of `index.html`'s `<body>`. Every
icon usage is a two-line reference:

```html
<svg class="icon"><use href="#icon-target"/></svg>
```

No build step, no icon font, no per-instance path data — one place
(`index.html`'s sprite block) defines every icon; everywhere else just
points at it by id.

**Why a sprite over inline SVG per usage:** the same icon (e.g.
`trending-up`) appears in 4+ places (main nav, hub header, hub card,
mobile nav). A sprite means the path data exists exactly once — editing
one `<symbol>` updates every usage. Inline-per-usage would have meant
hand-copying path data 50+ times with real risk of drift.

**Visual spec (every icon):**
- `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
  `stroke-width="1.8"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Small solid dots (e.g. the center of `icon-target`, the bullets in
  `icon-list`) use `fill="currentColor" stroke="none"` as an intentional
  exception — a stroked circle at that size doesn't read as a dot.
- The `.icon` CSS class (`css/style.css`, "Icon system" section) sizes
  every icon to `width:1em; height:1em`. This means **icon size is
  inherited from whatever `font-size` the containing element already
  had** (`.nav-cat-icon`, `.hub-icon`, `.hub-card-icon`, `.bn-icon`) —
  the existing sizing rules for those slots didn't need to change.
- Color is always `currentColor` — icons inherit hover/active state from
  their container for free (e.g. `.nav-cat.active` already changes
  `color`; the icon inside follows automatically, no extra rule needed).

**Icon inventory (24 symbols, `index.html` sprite block):**
`dashboard`, `trending-up`, `search`, `cpu`, `settings`, `target`,
`clipboard`, `calendar`, `award`, `list`, `zap`, `eye`, `book`, `trophy`,
`bulb`, `film`, `grid`, `bookmark`, `message`, `refresh`, `plus`,
`logout`, `sun`, `moon`, `download`.

**Using an icon in static HTML** (nav, hub cards, anything already in
`index.html`): reference the sprite directly —
`<svg class="icon"><use href="#icon-NAME"/></svg>`.

**Using an icon from JS** (dynamically rendered content — card titles,
table cells, anything built via template strings in `js/*.js`): use the
`icon(name)` helper added to `js/utils.js` (exported on `window.Utils`
and also available as a bare global, matching the existing `f$`/`fpct`
convention):
```js
icon('refresh')  // → '<svg class="icon"><use href="#icon-refresh"/></svg>'
```
This was introduced this phase specifically for the theme-toggle button
(`toggleDark()` in `app.js`, `Settings.setTheme()`/the theme segmented
control in `settings.js`), which sets `innerHTML` dynamically and can't
just reference the sprite as inline markup the way static HTML can.

**House rule going forward: no new emoji in the UI.** Any new icon need
should get a new `<symbol>` added to the sprite (matching the visual
spec above), not an emoji character. See DEVELOPMENT_RULES.md.

**Color assignment for icon containers** (not the icons list above,
which are semantic-neutral by default):
- `.hub-icon` (the one big icon per hub landing page) — `var(--green)`,
  the single identity/accent color. One per screen, so it can afford to
  be the accent without becoming visual noise.
- `.hub-card-icon` (many per grid — up to 8 on one screen) — neutral
  `var(--text-2)` by default, shifting to `var(--green)` on hover
  (`var(--purple)` for `.hub-card-ai` cards, matching the existing
  purple-for-AI convention). Restraint here is deliberate: 22 green icons
  on screen at once would compete with the numbers, which are the actual
  point of the product.
- `.nav-cat-icon` / `.bn-icon` — no dedicated color rule; they inherit
  `currentColor` from the nav item's existing state styling
  (`.nav-cat`'s default/hover/active colors, `.bn-item.active .bn-icon`
  now explicitly set to `var(--green)` to match the existing active-label
  color, since emoji never needed a color rule but a monochrome SVG does).

## Phase 2: broader emoji cleanup (card-titles, alerts, risk, in-content)

Migrated the highest-traffic remaining emoji to the sprite: all 7 static
`.card-title` prefixes in `index.html` (Equity Curve, Monthly Net,
Drawdown, Mistake Detector, Decision Engine, AI Coach, Daily Grade's
"actions" card) plus a handful of section labels/buttons in the same
file (Quick Trade, Position Sizer, Decision Engine's "נתח מניה" button,
AI Chat, Risk/Reward Calculator); `positions.js`'s `riskStatus()` labels
(now an `icon('dot')` colored via the same `color` value already used
for `.pos-card--*`/the Mission Control risk-card border — one color,
everywhere), the alert badge, and the three alert-toast messages
(target/stop/warn — now `icon('target')`/`icon('octagon')`/
`icon('alert-triangle')`); position cards' target/stop-loss inline
labels; Mission Control's `_shortCoachInsight()` text and its
color-matched risk label; and Daily Brief's AI Coach icon, new-trades
line, and risk-header icon. Four new sprite symbols added:
`dot`, `octagon`, `check-circle`, `trending-down`, `ruler`.

**A real constraint found and respected, not worked around:** `setStatus()`
(`js/api.js`) sets `#sync-bar`'s content via `.textContent`, and
`API.reportPriceError()`/`updateWsDot()` write the error into a
`data-tip` attribute — neither can render HTML/SVG. The `❌`/`⚠️` prefixes
inside `positions.js`'s price-error messages were **deliberately left as
emoji**, not missed — converting them would print a literal `<svg>...`
string on screen. This is the concrete reason the broader "toast
checkmark" pass (see below) needs its own phase: it would require
changing `setStatus()` to use `innerHTML` everywhere it's called, a
bigger, shared-function change deserving its own review, not a drive-by
in this phase.

**Still emoji, intentionally deferred:**
- Every toast/status message across `api.js`, `positions.js`,
  `watchlist.js`, `trades.js`, `journal.js`, `quicktrade.js`,
  `settings.js` (`✓`/`✅`/`❌` prefixes) — all go through `setStatus()`'s
  `.textContent`, per the constraint above. Needs its own phase that
  either accepts plain-text-only prefixes or migrates `setStatus()` to
  `innerHTML` deliberately.
- `dashboard.js`'s own hero/KPI/goal-card rendering (👋, 💊, 🎯, etc.) —
  a separate module not audited this phase.
- Mistake Detector's category icons (`analytics.js`), AI Coach's rich
  insight-type icons (`aiCoach.js`), Daily Grade's grade badges
  (`dailyGrade.js`), Trade Replay/Performance Timeline/Decision
  Engine/Journal in-content emoji, Watchlist's own section header.
- Position cards' pre/after-market price tags (`🌅 Pre:`/`🌙 AH:`) —
  low-frequency (only shown when that data exists) and would need two
  new single-use icons; not worth the addition yet.
- Quick Trade's buy/sell `<option>` emoji (`🟢 קנייה`/`🔴 מכירה`) — a
  genuine platform constraint, not an oversight: browsers render
  `<option>` text as plain text only, HTML/SVG inside an `<option>` is
  not supported. Leave as emoji, or restyle as a custom dropdown
  component if this ever becomes worth the effort.
