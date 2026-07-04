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

- **Follow-up: removed the manual-refresh success toast too.** After
  shipping the live-status UX phase (automatic polling silenced), the
  manual "🔄 רענן" button still toasted on success. Removed on reflection
  — a refresh the user just triggered doesn't need an announcement after
  the fact. Replaced with a spinning refresh-button icon
  (`API.setButtonBusy`) plus the existing ambient dot/timestamp. Errors
  still toast. See "Follow-up: removed the manual-refresh success toast
  too" below.

- **Phase 4: KPI/card differentiation.** Unified five parallel, slightly
  inconsistent "small stat card" implementations (`.kpi`, `.prog-kpi`,
  `.week-card`, `.brief-kpi`, and a dormant unused `.kpi-v3`) into one
  visual language; differentiated chart cards and list cards from generic
  content cards; removed confirmed-dead CSS. See "Phase 4: KPI/card
  differentiation" below for the full audit, scope, and a real
  cascade-conflict this phase found and fixed (not just avoided).

- **Phase 5a: table icon-button + empty-state icon migration, `.empty-state`
  duplicate consolidation.** First slice of the Forms/Tables/Controls Polish
  phase — see "Phase 5a" below for the full audit and what's deliberately
  deferred to 5b/5c/5d/5e/5f (native-date fields, confirm() replacement,
  skeleton loading states, `.s-input`/global-input unification, Journal's
  filter-bar inline styles). Zero calculation/backend changes.

- **Phase 5b: Trades modal date fields → native `type="date"`.** The
  Trades add/edit modal (`#modal-form`) was the one form still requiring
  free-text `DD/MM/YYYY` typing, inconsistent with Quick Trade and the
  Position modal's native date pickers. See "Phase 5b" below. Frontend/UI
  only — the stored/transmitted date format (`DD/MM/YYYY`) and all
  downstream calc (`hold_days`, `month`) are unchanged; only the input
  widget and a read-boundary conversion changed.

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
The error-dedup behavior was confirmed via three simulated consecutive
failures. Mobile (375×812): the toast's fixed `top` offset needed a
mobile-specific bump (`68px` → `76px` in `mobile.css`) because mobile
hides `.main-nav`, leaving less natural clearance before the hub title —
caught visually via screenshot, not assumed to just work from the
desktop value.

### Follow-up: removed the manual-refresh success toast too

Initially, manual refresh (the "🔄 רענן" button) still showed a
"✓ N/N מחירים עודכנו" toast on success — only the *automatic* 15s poll
was silenced. On reflection this was inconsistent: a refresh the user
just triggered themselves doesn't need an announcement after the fact:
they already know they clicked it. Removed entirely, replaced with:

- **`API.setButtonBusy(id, busy)`** (`js/api.js`) — disables the button
  and toggles an `.icon-spin` class on its `<svg class="icon">` (reusing
  the existing `spin` keyframe already used by `.spinner`, not a new
  animation). `Positions.refreshPrices()`/`Watchlist.refresh()` call this
  around the fetch in a `try/finally`, so the spin always clears even on
  an error path.
- The ambient `#ws-dot` pulse + `#last-updated` timestamp (already built
  for the automatic case) now serve as the *only* success confirmation
  for manual refresh too — one consistent mental model instead of two.
- **Errors still toast** for manual refresh — that remains genuinely
  actionable and worth interrupting for. Only the success path lost its
  toast.

`API.reportPriceSuccess()` no longer takes a `manual` parameter (it
never had a reason to branch on it once the toast was removed).

**Verified, not assumed:** confirmed via DOM inspection that the button
is `disabled` with `.icon-spin` present mid-flight (checked at the 10ms
mark of an in-flight call) and both clear once the call resolves, for
both `Positions.refreshPrices(true)` and `Watchlist.refresh(true)`.
Confirmed a simulated manual error still shows the toast. Confirmed a
stable reference point (`.header`'s `getBoundingClientRect()`) doesn't
move across a manual refresh — the position card's own bounding box
*does* shift slightly, but that's the card's content legitimately
changing height with fresh price data, not a toast-reflow regression.

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

## Phase 4: KPI/card differentiation

### Audit — the real problem wasn't sameness, it was duplication

Five parallel implementations of the same "small metric card" concept
existed before this phase, each slightly different for no functional
reason:

| Class | Used by | Padding (before) | Value (before) |
|---|---|---|---|
| `.kpi` / `.kpi-grid` | Main Dashboard (`dashboard.js`) | 14px 16px | 22px/700 |
| `.prog-kpi` | Progress tab (`analytics.js`) | 14px 16px | *(see below — never actually used)* |
| `.week-card` | Weekly summary (`dashboard.js`) | 14px | 20px/700 |
| `.brief-kpi` | Daily Brief (`app.js`) | 14px | 20px/700 |
| `.kpi-v3` | **Nobody — zero references anywhere** | 20px | 28px/800 |

Plus: `.card-glass` (zero references), `.kpi-trend` (zero references —
`dashboard.js` uses `.kpi-sub` with an inline opacity instead), and
`.prog-kpi-val` (defined, styled, but **also zero references** — Progress
renders a before/after comparison layout with inline styles instead of
a single hero value, discovered while doing the alignment pass below,
not before).

### What this phase did

**Consolidated, didn't rename.** `.kpi` (Dashboard's grid — the highest-
traffic KPI surface, holding up to ~11 peer stats at once) got the
better-designed-but-dormant `.kpi-v3` treatment merged into it: `--r-xl`
radius, bolder 24px/800 value, a 2px accent bar revealed on hover,
colored per-metric via a `--accent` custom property `dashboard.js` now
sets inline (`style="--accent:var(--${k.color})"` — one line, purely
presentational, the color values themselves are unchanged). `.kpi-v3`
itself was deleted once merged. `.prog-kpi`/`.week-card`/`.brief-kpi`
were **not renamed** — their classes still exist independently in
`analytics.js`/`dashboard.js`/`app.js` exactly as before — but their
padding/radius/value typography now matches `.kpi`'s, so all four read
as one system instead of four slightly-different ones.

**Deliberately kept dense, not blown up.** `.kpi-v3`'s original padding
was 20px (a size that suits 3-4 cards, not the Dashboard's ~11). The
merged `.kpi` uses 16px 18px — a modest bump from the original 14px 16px,
matching generic `.card`'s own padding, not `.kpi-v3`'s more spacious
value. The value size moved 22px→24px, not to `.kpi-v3`'s 28px. Hierarchy
on the Dashboard tab comes from `.dash-hero` already being visually
dominant above this grid (unchanged) — the goal was a *more polished*
stat card, not a *bigger* one competing with the hero.

**Chart cards** now get more generous padding than a generic content
card, via `.card:has(.chart-wrap) { padding: 20px 22px 18px; }` — no
markup change needed on any of the chart cards in `index.html`, and it
degrades harmlessly to the default `.card` padding on any browser without
`:has()` support (same technique as Mission Control's `.mc-hero:has()`
border tint in Phase 3).

**List cards** got a real class, `.card--flush` (`padding:0;overflow:
hidden`), replacing the inline `style="padding:0;overflow:hidden"`
repeated on Trades' and Journal's table-in-a-card markup in `index.html`.

### A real cascade conflict found and fixed, not just avoided

While rewriting `.kpi`, a duplicate "GLOBAL CARD PREMIUM UPGRADE" section
was discovered ~2200 lines later in `style.css`, forcing `.kpi`'s
border-radius, hover state, and `.kpi-val`/`.kpi-label` typography via
`!important` — the exact same silent-cascade-conflict shape as the risk-
card border bug from Phase 3 (a later rule in file order winning over an
earlier one with equal specificity). Verified via `getComputedStyle`
*before* touching it — `.kpi-label` was actually rendering at
`font-weight:700; letter-spacing:0.7px` from the `!important` block, not
the `600`/`0.8px` the "base" definition claimed. Rather than layering a
sixth definition on top, the two were merged into one (preserving the
already-live 700/0.7px value, not silently changing it) and the
`!important` duplicate was deleted. The adjacent `.card`/`.card-title`
`!important` overrides in that same "premium upgrade" section were left
alone — they don't conflict with anything this phase touched, and
resolving them isn't necessary for this phase's correctness (flagged
below as a known follow-up instead of fixed opportunistically).

### Spacing

Audited Dashboard's own top-level rhythm (`.dash-hero` → `.kpi-grid` →
chart/content cards) specifically, since that's the screen in scope.
Found it was already a reasonably consistent two-tier rhythm (20px
between major blocks, 16px default `.card` spacing) — **not** the
scattered 10/12/14/18/28px mix that exists elsewhere in the stylesheet.
Deliberately did not force a change where none was needed; a broader
spacing audit across every other screen remains a real, separate
follow-up (see below), not something to manufacture busywork for here.

### Verified, not assumed

Desktop and mobile (375×812) screenshots of Dashboard's KPI grid, weekly
summary, and chart cards; Trades/Journal tables confirmed still flush
edge-to-edge after switching from inline styles to `.card--flush`; the
`--accent` custom property confirmed resolving to the correct color
(`rgb(78,204,168)` for a green metric) via `getComputedStyle`; the
`!important` conflict confirmed present before the fix (`border-radius:
18px` — i.e. `var(--r-xl)` — was NOT applying) and confirmed resolved
after (it was); zero references confirmed via `grep` before deleting
`.kpi-v3`, `.card-glass`, `.kpi-trend`, and `.prog-kpi-val`.

### Deliberately deferred (documented, not forgotten)

- Renaming `.prog-kpi`/`.week-card`/`.brief-kpi` to literally share the
  `.kpi` class in markup (would touch `analytics.js`/`dashboard.js`/
  `app.js` structurally, not just visually — a bigger, separate change).
- The `.perf-grid`/`.grade-card`/`.mistake-grid`/`.insight-grid` families
  on Analysis-category screens (out of scope per explicit instruction).
- The adjacent `.card`/`.card-title` `!important` duplicate in the same
  "premium upgrade" section (doesn't conflict with anything this phase
  needed, so left alone rather than opportunistically rewritten).
- A full stylesheet-wide spacing audit (10/12/14/18/28px scattered
  values outside the Dashboard tab) — confirmed out of scope, not fixed.
- Chart.js's internal color/gridline config — already tracked separately
  in `ROADMAP.md`'s Phase 4+ item.

## Phase 5a: table icon-buttons, empty-state icons, `.empty-state` de-dup

### Audit (full findings in the Phase 5 UX-audit conversation)

Forms/tables/controls review found the icon migration from Phases 1–3 had
not reached table row-actions or the three empty-states that render lazily
on tab-open (missed by earlier phases since they don't exist in the DOM at
boot): `positions.js`/`trades.js`/`journal.js`'s edit/delete buttons and
`watchlist.js`'s Analyze/Trade Plan buttons were still emoji (`✏️ ✕ 📝 📓
🎯 📋`) inside the already-`.btn-icon`-sprite-aware class; `app.js`'s
Portfolio Heatmap, `performanceTimeline.js`, and `tradeReplay.js` empty
states were still emoji (`🌡️ 📅 🎬`). Separately, `.empty-state` (and its
`.empty-icon`/`.empty-title`/`.empty-sub` children) was defined **twice**
— once at the original "Empty States" section, once ~300 lines later in
a "premium upgrade" section — the same duplicate-block shape as the
`.kpi` conflict Phase 4 found and fixed.

**Verified via `getComputedStyle` before touching anything, not assumed:**
unlike the Phase 4 `.kpi` case, this duplicate was **additive, not
conflicting** — CSS cascade resolves per-property, not per-rule, so where
the two blocks set *different* properties (first block: `color`,
`animation: float`; second block: `display:flex` layout, `opacity:0.5`,
`max-width:320px` on `.empty-sub`) both applied simultaneously the whole
time. Only genuinely-overlapping properties had a real winner:
`.empty-title`'s `margin-bottom` (8px, from the higher-specificity second
block, not the first block's 6px) and `.empty-sub`'s `line-height` (1.5,
not 1.6). Confirmed all of this live via a scratch element + `getComputedStyle`
before writing the merge, then merged into one block preserving the exact
existing computed appearance (icon still floats *and* sits at 0.5 opacity,
title margin stays 8px, sub line-height stays 1.5/max-width 320px) — a
correction to first-pass reading of the cascade, not a visual change.

### What this phase did

- **Three new sprite symbols** (`edit`, `x`, `note`) added to
  `index.html`'s `<defs>` block, matching the existing 24x24/stroke-1.8
  visual spec exactly. `book`/`target`/`clipboard`/`grid`/`calendar`/`film`
  already existed and were reused where the semantic match was exact (e.g.
  the Portfolio Heatmap's empty state now uses the same `grid` icon as its
  own hub card; Trade Replay's empty state uses the same `film` icon as
  its hub card) — no new symbol added where an existing one already meant
  the same thing.
- **Table row-action buttons migrated**: `trades.js` (note/journal/edit/
  delete, 4 buttons), `positions.js` (edit/delete), `journal.js` (edit),
  `watchlist.js` (Analyze/Trade Plan) — all via the existing `icon(name)`
  helper (`js/utils.js`), zero new markup pattern introduced.
- **Three empty-state emoji migrated** to the same helper (Portfolio
  Heatmap → `grid`, Performance Timeline → `calendar`, Trade Replay →
  `film`).
- **`.empty-state` consolidated to one definition** at its original
  location; the "premium upgrade" duplicate removed, with a comment
  pointing to this section (same pattern as the Phase 4 `.kpi` comment).
- **A harmless one-line cleanup in passing**: `trades.js`'s row-action
  markup had a literal no-op ternary (`${t.notes?'':''}`, always empty
  string) on the exact line being rewritten for icons — removed since it
  was already being touched; zero behavior change (both branches were
  empty).

### Verified, not assumed

Confirmed all three new symbol IDs exist in the DOM after load; confirmed
row-action button `outerHTML` in Trades/Positions/Journal/Watchlist
resolves to the correct `<use href="#icon-*">` per button, not leftover
emoji; confirmed zero new console errors after a full service-worker/cache
clear + reload; visually confirmed icons render correctly in both dark and
light mode (color is `currentColor`, inherited, not hardcoded) via
screenshot; confirmed the three empty states via a temporary
`APP.trades = []` + direct render-function call (production data has real
trades, so these don't naturally trigger) — screenshotted the Portfolio
Heatmap empty state to confirm centered layout, floating+dimmed icon, and
title render as expected; confirmed at both desktop (1400px) and mobile
(375×812) viewports.

### Deliberately deferred to later Phase 5 sub-phases (not forgotten)

- **5b** — Trades modal's `f-buy-date`/`f-sell-date` free-text `DD/MM/YYYY`
  inputs → native `type="date"` (matching Quick Trade/Position modal),
  using the existing `toDD`/`ddToISO` helpers. Touches `Trades.submit()`/
  `openEdit()` logic, not just markup, so kept out of this pure-icon slice.
- **5c** — Unifying Settings' `.s-input`/`.s-input-num` with the global
  `input, select, textarea` styling (same "parallel implementation of one
  concept" shape as the Phase 4 KPI cards, scoped to Settings only).
- **5d** — Replacing native `confirm()` (6 call sites: delete trade/
  position/watchlist item, logout, import backup, load historical seed)
  with a styled confirmation modal — a genuinely new shared component,
  not a drive-by extension of something that already exists.
- **5e** — Wiring up the dormant `.skeleton`/`.skeleton-text/-kpi/-card/
  -row` classes (built, zero references anywhere) as real loading states
  for Trades/Positions/Journal.
- **5f** — Journal's filter bar reusing `.search-row` instead of its own
  inline-styled div + hardcoded per-select `max-width`.
- Mobile touch-target sizing for `.btn-icon` in tables
  (`mobile.css`'s `padding:3px 5px`) — flagged, not addressed this phase.
- Visible `:focus`/`:focus-visible` state for buttons (currently only
  inputs/selects get a focus affordance) — flagged, not addressed.

## Phase 5b: Trades modal date fields → native `type="date"`

### What this phase did

`#modal-form` (Trades add/edit — the single highest-traffic data-entry
form, since every closed trade goes through it) had `f-buy-date`/
`f-sell-date` as plain text inputs with a `placeholder="DD/MM/YYYY"` —
the trader had to type dates by hand, with zero native picker, while
Quick Trade (`qt-buy-date`/`qt-sell-date`) and the Position modal
(`pf-date`) both already used real `type="date"` pickers. Changed both
inputs to `type="date"` (removed the now-inert placeholder — native date
inputs don't render placeholder text).

Native date inputs require their `.value` in ISO `YYYY-MM-DD`, while every
other part of the app (storage, the API payload, `hold_days`/`month`
calc) uses `DD/MM/YYYY` — the same format mismatch Quick Trade/Position
already solved. Rather than duplicating Position modal's inline split/
join conversion, this phase used the existing `js/utils.js` helpers
directly (`ddToISO`/`isoToDD`, added this phase to `trades.js`'s
destructure line):

- **`Trades.openEdit()`**: `document.getElementById('f-buy-date').value =
  ddToISO(t.buy_date)` (was a direct string assignment — silently wrong
  for a date input, since native date inputs reject non-ISO strings).
- **`Trades.submit()`**: `bd`/`sd` are now computed as
  `isoToDD(document.getElementById('f-buy-date').value.trim())` at the
  very top of the function — everywhere else in `submit()` (the trade
  object sent to the API, `hold_days` via `parseDD`, `month` via
  `sd.split('/')`) is **byte-for-byte unchanged**, since `bd`/`sd` are
  already back in the `DD/MM/YYYY` format those lines expect.

Zero calculation changes — this is a widget + read-boundary-conversion
change only. `Trades.calcPreview()` doesn't read the date fields at all,
so it needed no changes.

### Verified, not assumed

Confirmed via `getComputedStyle`/bounding-box inspection (not just
screenshot) that `#modal-form` and its inputs render at full expected
size. Confirmed `Trades.openEdit()` converts existing trades' dates
correctly (e.g. `"10/03/2025"` → input value `"2025-03-10"`) for a real
trade. Confirmed the `ddToISO`/`isoToDD` round-trip is lossless for
several sample dates (including a 1-digit day and a year boundary)
without calling the live API — a real edit/add was deliberately **not**
submitted during verification, to avoid writing test data into the
trader's production Google Sheet; the round-trip and the conversion
call-sites were verified in isolation instead. Screenshotted both the
edit and add flows at desktop and mobile (375×812) — native calendar
icon renders correctly, dates display and edit correctly, no layout
overflow, zero new console errors after a full service-worker/cache
clear + reload.

### Deliberately out of scope (unchanged from the Phase 5a list)

5c (`.s-input` unification), 5d (`confirm()` → styled modal), 5e
(skeleton loading states), 5f (Journal filter bar), mobile touch-target
sizing, and button focus states all remain deferred, per the list above.
