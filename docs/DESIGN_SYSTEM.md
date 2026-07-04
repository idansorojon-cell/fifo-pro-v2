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

## What's still emoji (intentionally deferred, not forgotten)

Card-title prefixes (`📈 Equity Curve`, `⚠️ Mistake Detector`, `🎯
Decision Engine`, etc. — scattered across `index.html` and most
`js/*.js` render functions), the alert badge (`🔴 N התראות`), risk-status
pills (`🔴`/`🟠`/`🟢`), Mission Control's inline glyphs, and data-context
tags like the after-hours `🌙 AH:` price label. These are next in line
for a design pass but were left alone this phase to keep the diff
reviewable — see ROADMAP.md.
