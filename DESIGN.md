---
name: LMU Lap Time Analyzer
description: Post-session telemetry debrief for Le Mans Ultimate, read like a pit wall timing screen.
colors:
  lmu-bg: "#0B0E14"
  lmu-deep: "#060910"
  lmu-dark: "#080A0F"
  lmu-surface: "#080C14"
  lmu-strip: "#0A0E17"
  lmu-badge: "#070C18"
  lmu-card: "#151A23"
  lmu-card-hover: "#1A202C"
  lmu-raised: "oklch(27.9% 0.041 260.031)"
  lmu-border: "#232A36"
  lmu-rule: "oklch(37.2% 0.044 257.287)"
  lmu-rule-strong: "oklch(44.6% 0.043 257.281)"
  lmu-text: "#F8F9FA"
  lmu-text-soft: "oklch(86.9% 0.022 252.894)"
  lmu-muted: "#8D99AE"
  lmu-faint: "#7F8BA1"
  lmu-accent: "#DC3441"
  lmu-accent-text: "#F26B74"
  lmu-gold: "#FFB703"
  lmu-blue: "#219EBC"
  lmu-cyan: "#8ECAE6"
  lmu-green: "#2A9D8F"
  lmu-gain: "oklch(76.5% 0.177 163.223)"
  lmu-loss: "oklch(71.2% 0.194 13.428)"
  lmu-warn: "oklch(82.8% 0.189 84.429)"
  lmu-info: "oklch(74.6% 0.16 232.661)"
  lmu-aqua: "oklch(78.9% 0.154 211.53)"
  lmu-azure: "oklch(70.7% 0.165 254.624)"
  lmu-indigo: "oklch(67.3% 0.182 276.935)"
  lmu-violet: "oklch(70.2% 0.183 293.541)"
  lmu-purple: "oklch(71.4% 0.203 305.504)"
  lmu-orange: "oklch(75% 0.183 55.934)"
  lmu-teal: "oklch(77.7% 0.152 181.912)"
typography:
  brand:
    fontFamily: "Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    letterSpacing: "0.025em"
  headline:
    fontFamily: "Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 700
  body:
    fontFamily: "Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.05em"
  readout-small:
    fontFamily: "Consolas, monospace"
    fontSize: "11px"
    fontWeight: 700
  readout:
    fontFamily: "Consolas, monospace"
    fontSize: "12px"
    fontWeight: 700
  readout-large:
    fontFamily: "Consolas, monospace"
    fontSize: "18px"
    fontWeight: 800
rounded:
  sm: "4px"
  segment: "5px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
components:
  nav-tab:
    textColor: "{colors.lmu-muted}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "6px 14px"
  nav-tab-active:
    backgroundColor: "{colors.lmu-accent}"
    textColor: "{colors.lmu-text}"
    rounded: "{rounded.lg}"
    padding: "6px 14px"
  button-primary:
    backgroundColor: "{colors.lmu-accent}"
    textColor: "{colors.lmu-text}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "10px 20px"
  button-icon:
    backgroundColor: "{colors.lmu-bg}"
    textColor: "{colors.lmu-muted}"
    rounded: "{rounded.lg}"
    padding: "6px"
  segment-group:
    backgroundColor: "{colors.lmu-bg}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "0 6px"
  segment-selected:
    backgroundColor: "{colors.lmu-accent}"
    textColor: "{colors.lmu-text}"
    rounded: "{rounded.segment}"
    height: "24px"
    padding: "0 14px"
  panel:
    backgroundColor: "{colors.lmu-card}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  panel-compact:
    backgroundColor: "{colors.lmu-card}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.lmu-bg}"
    textColor: "{colors.lmu-text}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  status-pill:
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    padding: "2px 8px"
---

# Design System: LMU Lap Time Analyzer

## Overview

**Creative North Star: "The Engineer's Pit Wall"**

The interface is the timing screen a race engineer reads after the run. It is dense, precise and quiet. Numbers carry the page, and color only speaks when something changed: a gain, a loss, a warning, the selected thing. The driver sits down after a session to find out where the time went, so every panel answers a question with a figure, and the traces stay one step away for anyone who wants to check the working.

The surface is near-black blue (`lmu-bg`), and content panels are raised by tone rather than by light. A single racing red marks the brand, the active tab and the current selection. Gold, emerald, amber, rose and sky are signal colors with fixed meanings (sectors, gain, warning, loss, data). Type is small and heavily weighted, with uppercase tracked labels over bold monospaced readouts, the way a timing monitor stacks a caption over a value.

Depth is flat and tonal: solid panels on a solid page, with no glass, glow or gradient anywhere in the content.

**Key Characteristics:**
- Dark only, near-black blue base; no light theme.
- Numbers first: lap times, deltas and units in bold monospace.
- Uppercase, tracked, 10px labels above values.
- One brand red for identity and selection; every other hue is a fixed-meaning signal.
- Flat tonal layering with hairline borders; no glow, no glass.
- Dense desktop layout inside a 1500px column.

## Colors

The palette is a cold, near-black instrument panel with one hot brand red and a small set of signal hues that each mean exactly one thing.

There is one color vocabulary: the `lmu-*` tokens in `tailwind.config.js` (`theme.extend.colors.lmu`), mirrored for charts and SVG in `src/utils/themeColors.ts`. Colors are named for what they mean, never for their hue. Raw Tailwind palette classes (`text-emerald-400`, `bg-slate-800`) are not used; a new need gets a role here first, then the component uses the role.

### Primary
- **Pit Lane Red** (`lmu-accent`, #DC3441): brand wordmark, active nav tab, selected segment, primary buttons, pit stop badges, scrollbar hover, text selection. The fill is tuned so white text on it passes 4.5:1. Red *text* on a dark surface uses **Pit Lane Red Text** (`lmu-accent-text`, #F26B74), which passes on every surface and on its own 20% tint. Treat red as the one "this is selected / this is us" color.

### Secondary
- **Sector Gold** (`lmu-gold`): sector 1, first place, highlighted player rows, compare lap 1. Paired with `lmu-blue` (sector 2) and `lmu-green` (sector 3) through `SECTOR_COLORS`.
- **Timing Blue** (`lmu-blue`) and **Pale Timing Cyan** (`lmu-cyan`): sector 2, informational chips. On a `lmu-blue` tint, the label is `lmu-cyan`.
- **Sector Teal** (`lmu-green`): sector 3, secondary positive state.

### Signal and data families
Each family has four steps:

| Step | Class form | Role |
|---|---|---|
| soft | `text-lmu-gain-soft` | Secondary text on dark, text on the family's own tint |
| base | `text-lmu-gain` | Primary text, icons, lines, dots |
| strong | `bg-lmu-gain-strong/20`, `border-lmu-gain-strong/40` | Fills and borders, almost always with an opacity modifier |
| deep | `bg-lmu-gain-deep/40` | Tinted wells behind a panel's content |

The values are Tailwind v4's own 300/400/500/950 of the hue named below, so a role renders exactly as the hue it replaced. Retune a role in `tailwind.config.js`, never in a component.

- **Signals**, one fixed meaning each:
  - **Gain** (`lmu-gain`, emerald): time gained, personal bests, clean laps, positive trends.
  - **Loss** (`lmu-loss`, rose): time lost, penalties, incidents, negative trends.
  - **Warn** (`lmu-warn`, amber): warnings, moderate deltas, inferred or uncertain values, the baseline trace.
  - **Info** (`lmu-info`, sky): the primary telemetry trace, driver name, informational highlights.
- **Data categories**, for telemetry channels, pace categories, car classes and conditions: **Aqua** (cyan), **Azure** (blue), **Indigo**, **Violet**, **Purple**, **Orange**, **Teal**. They separate categories and carry no judgement.

Telemetry, map, wheel-corner, pace-category and opponent colors used by charts and SVG are fixed lookup tables in `src/utils/themeColors.ts` (`TELEMETRY_COLORS`, `MAP_COLORS`, `WHEEL_CORNER_COLORS`, `PACE_CHART_COLORS`, `OPPONENT_COLORS`). Use them by name; never pick a new hue inline for a channel that already has one.

### Neutral
- **Pit Wall Black** (`lmu-bg`): page background and inset wells (inputs, segment groups, icon buttons).
- **Deep Tarmac** (`lmu-deep`, `lmu-dark`, `lmu-surface`, `lmu-strip`, `lmu-badge`): the recessed steps below the page: map canvases, strips, badge wells, table stripes.
- **Garage Panel** (`lmu-card`): raised content panels. **Garage Panel Hover** (`lmu-card-hover`) is its hover step.
- **Raised Chip** (`lmu-raised`): chips, keycaps, progress tracks and neutral pills that sit on a panel.
- **Hairline** (`lmu-border`): panel borders, dividers and table rules, often at 40–70% opacity. **Rule** (`lmu-rule`) and **Rule Strong** (`lmu-rule-strong`) are the visible borders of controls and their hover step.
- **Text tiers**, brightest first:
  - **Grid White** (`lmu-text`): primary text and values.
  - **Soft White** (`lmu-text-soft`): secondary values and body copy that should recede slightly.
  - **Telemetry Grey** (`lmu-muted`): labels and secondary text. It is the most used text color in the app.
  - **Faint Grey** (`lmu-faint`): tertiary captions, separators and off states.

  Every tier passes 4.5:1 on `lmu-bg` and `lmu-card`. `lmu-faint` drops to 4.26:1 on solid `lmu-raised`, so on a raised chip use `lmu-muted` or brighter.

### Contrast
| Pair | Ratio |
|---|---|
| `lmu-text` on `lmu-card` | 16.6 |
| `lmu-muted` on `lmu-card` | 6.1 |
| `lmu-faint` on `lmu-card` | 5.1 |
| `lmu-accent-text` on `lmu-card` | 5.9 |
| White on `lmu-accent` | 4.55 |
| Signal base and soft steps on `lmu-card` | 5.6 or more |

Two cases fail and must not be used:
- **Strong step as text.** Loss, azure, indigo, violet and purple fall to 3.8–4.6:1 when the `-strong` step is used for text. Use the base or soft step.
- **White on a solid strong fill.** Sky and rose fills fail with white text. A solid signal fill carries `lmu-deep` text, like a flag on a timing board.

### Named Rules
**The Signal Rule.** Every signal family means one fixed thing:
- gain: time gained
- loss: time lost
- warn: a warning or an uncertain value
- info: data
- gold, blue and teal: sectors 1, 2 and 3

Data families only separate categories. Never use a signal color decoratively, and never let two signals trade meanings between views. A scale label or legend is neutral text. The channel's color lives on its trace or swatch.

**The One Red Rule.** Pit Lane Red marks identity and the current selection. A screen shows it on the active tab, the selected control and at most a handful of alerts. It never fills a panel.

**The No Dimmed Text Rule.** Never dim text with `opacity-*` to show an off, unselected or secondary state; that is how the app ended up with 2:1 labels. Step down a text tier instead (`lmu-faint` for off), or desaturate a colored control (`grayscale` when off, full color when selected).

## Typography

**Display / Body Font:** Segoe UI (`system-ui`, then `sans-serif` off Windows)
**Readout Font:** Consolas (then `monospace`)

**Character:** A plain Windows UI face in heavy weights over a stark monospace: the faces LMU's own platform renders, with zero web fonts. It is utilitarian by design; the character comes from weight, case and tracking, not from a display face. The mono stack names Consolas first so a bare `monospace` never triggers the browsers' 13px generic-monospace sizing quirk; SVG text sets `fontFamily="Consolas, monospace"` for the same reason.

### Hierarchy
- **Brand** (800, 18px, uppercase, 0.025em tracking): the navbar wordmark only.
- **Headline** (800, 18px, tight tracking): panel and page headers such as "Welcome back".
- **Title** (600–700, 14px): card titles, track names, nav tabs.
- **Body** (400–500, 12px, 1.5 line height): descriptions, helper text and debrief prose. It is the default text size across the app.
- **Label** (700, 10px, uppercase, 0.05em tracking): captions above values, column headers, pills and badges.
- **Readout** (monospace 700, 12px; **Readout Small** 11px in dense tables and chips): lap times, deltas, positions, counts and units. **Readout Large** (monospace 800, 18px and up) is for headline values like best lap.

### Named Rules
**The Readout Rule.** Every number a driver compares (lap time, delta, position, speed, temperature, percentage) is set in `font-mono` with its unit. Prose numbers in a sentence may stay proportional.

**The 10px Floor.** No text renders below 10px, and sizes stay on the ramp: 10, 11, 12 (`text-xs`), 14 (`text-sm`) and up. Off-ramp sizes (`text-[9px]`, `text-[10.5px]`, `text-[13.5px]`) are drift. SVG labels follow the same floor at their rendered scale (the friction circle's 128-unit viewBox draws at 116px, so its labels are 11 units). Where 10px does not fit, restructure the element instead of shrinking the text.

**The Label Rule.** Uppercase text always carries `tracking-wider`; caps without tracking read cramped at 10–12px.

## Layout

Desktop-first and dense. Content sits in a centered column capped at 1500px (`max-w-[1500px]`), with 16px side gutters that grow to 32px from the `lg` breakpoint. The sticky navbar spans the full width, with its contents in the same column.

Spacing is tight and follows Tailwind's 4px scale, with half steps. Gaps between inline items are 4–8px (`gap-1`, `gap-1.5`, `gap-2`, the three most used values). Groups are 12–16px apart and panel padding is 16–24px. Chips and badges use 2px vertical padding. Grids of summary cards collapse from multi-column to a single column at `md`/`lg`; mobile is not a design target (see PRODUCT.md), but layouts must not overflow horizontally.

**The Timing Sheet Rule.** Density is a feature. Prefer rows, tables and label-over-value stacks to spacious cards. Reach for whitespace only to separate questions, not to decorate an answer.

## Elevation & Depth

Flat and tonal. Depth comes from stepping between the neutral surfaces: the deep tones sit below the page, `lmu-bg` is the page, and `lmu-card` panels sit above it, each edged with a `lmu-border` hairline. Hover lifts a surface one tonal step (`lmu-card-hover`, or `white/5–10` over a panel) rather than adding a shadow.

Selection is shown by fill and border (solid red, or a signal tint with its rim), never by a glow. The playhead is a plain white line.

### Shadow Vocabulary
These are the only shadows the app uses; everything else (`shadow-sm` on pills, colored halos, `shadow-inner`) was removed in the quieter pass.
- **Marker lift** (`shadow-[0_2px_10px_rgba(0,0,0,0.85)]`, `drop-shadow-*` on SVG): only where a marker or cursor readout floats over busy geometry, the track map or a telemetry trace.
- **Overlay** (`shadow-lg` to `shadow-2xl`): popovers, dropdowns, tooltips, modals, toasts and the controls floating over the map, which genuinely sit above the page.

### Named Rules
**The Flat Wall Rule.** Content panels are solid, opaque and shadowless. Blur is allowed on the sticky navbar and on overlays (modal scrims, tooltips, popovers, map overlays) only, never over data. No glow halos, no gradient panels, no decorative light.

## Shapes

Soft, consistent rectangles. The radius grows with the size of the thing: 4px (`rounded`) for status pills and small badges, 5px for segment buttons, 6–8px (`rounded-md`, `rounded-lg`) for buttons, nav tabs and inputs, 12px (`rounded-xl`) for compact panels and control groups, and 16px (`rounded-2xl`) for top-level panels. `rounded-full` is for status dots, progress tracks and avatars only.

Borders are 1px hairlines in `lmu-border` (often at 40–70% opacity) or in a signal color at 20–40% opacity for tinted chips. Track maps are drawn line work (`MAP_COLORS`), never filled illustration.

## Components

### Buttons
Compact and assertive, labelled in uppercase.
- **Shape:** gently rounded (12px on primary actions, 8px on icon buttons).
- **Primary:** Pit Lane Red background, white 10–12px bold uppercase label with 0.05em tracking, 10px × 20px padding. Hover softens to 90% opacity. Disabled drops to 50% opacity with a not-allowed cursor.
- **Icon button:** a 6px-padded square on `lmu-bg` with a hairline border and muted icon. On hover it fills with red (the destructive or primary variant) or lifts one tonal step (neutral).
- **Tinted:** a signal color at 10% background, 20% border and its text step (`bg-lmu-accent/10 border-lmu-accent/20 text-lmu-accent-text`, or `bg-lmu-gain-strong/10 text-lmu-gain`), filling solid on hover.
- **Focus:** today most controls use `focus:outline-none` with a border shift to red, and only one uses `focus-visible:ring`. That is a gap: every interactive control needs a visible `focus-visible` ring (2px `lmu-accent`).

### Segmented Pills
A signature filter control (session type, car class, sort). It is a 36px `lmu-bg` well with a hairline border and 12px radius, holding 24px-tall monospace uppercase segments with a 5px radius. The selected segment is solid red with white text. Unselected segments have a hairline and `lmu-faint` text at full opacity, brightening to white on hover (The No Dimmed Text Rule). Car-class pills keep their class color when selected and go `grayscale` when off.

### Status Pills & Badges
- **Style:** 4px radius, 2px × 8px padding, 10–12px bold label, the family's `strong` step at about 15–20% background with a 30% border and its `soft` or base step as text.
- **Lap status** (`LapStatusBadge`): pit stop is red, out lap is cyan, and valid or incomplete show as an icon plus label, with inferred and invalid told apart by icon and color. This is the canonical lap status presentation; reuse it rather than re-deriving it.
- **Rank** (`RankBadge`): monospace `#n`. First is gold, second is `lmu-text-soft`, third is `lmu-warn-strong`, and the rest are muted.
- **Car class** (`CarClassBadge`) and **pace category** (`PaceBadge`, `PACE_CATEGORY_STYLES`) carry fixed per-class and per-category colors.

### Cards / Panels
- **Corner Style:** 16px for top-level panels, 12px for compact ones.
- **Background:** solid `lmu-card` (`bg-lmu-card border border-lmu-border`).
- **Border:** 1px `lmu-border` hairline; a signal rim at 30% marks a card with one meaning (the rival card is `lmu-warn-strong/30`).
- **Clickable card:** hover steps to `lmu-cardHover` with an `lmu-rule` border; no lift, no translate.
- **Internal Padding:** 24px (top-level) or 16px (compact), with 12–16px between groups.
- **Empty state:** centered muted text at 48px vertical padding inside the same panel shell.

### Inputs / Fields
- **Style:** `lmu-bg` well, hairline border, 8px radius (12px for the large search field, which gets a leading icon and monospace text), 14px white text.
- **Focus:** the border shifts to Pit Lane Red. A `focus-visible` ring is still owed (see Buttons).
- **Selects:** transparent inline selects with semibold white text, sitting inside a pill or toolbar well.

### Navigation
A sticky top bar: `lmu-card` at 75% opacity with a blur (the one sanctioned blur) and a hairline bottom border. On the left is the brand mark (a red-tinted gauge tile plus the uppercase wordmark with "Lap Time" in red). In the center is a tab group in an `lmu-card` well with a 12px radius. Tabs are 14px medium with a 16px icon. The active tab is solid red with white text; inactive tabs are muted and lift to `lmu-border/50` on hover. On the right are status and refresh controls. Legacy details to drop in polish: the pulsing gauge icon and the colored shadow under the active tab.

### Telemetry Traces & Track Map (signature)
Recharts traces on the dark base use `CHART_COLORS.grid` (`lmu-border`) gridlines and `lmu-muted` axes; legend labels are `lmu-text-soft` (the swatch carries the series color). Telemetry strip grid lines take the channel color dimmed, while their scale labels stay `lmu-muted` at full strength (`TelemetryStaticTrace`). Channels always use their `TELEMETRY_COLORS` hue (speed is sky, the baseline is amber, throttle is emerald, brake is red, steering is indigo). The 2D map draws the road surface and boundaries in `MAP_COLORS` line work, with racing lines colored by speed, pedal or lateral G. Monospace labels on the map obey the 10px floor.

## Do's and Don'ts

### Do:
- **Do** set every comparable number in `font-mono` with its unit (The Readout Rule).
- **Do** use the semantic roles: `lmu-gain`, `lmu-loss`, `lmu-warn` (warning or uncertain), `lmu-info` (data), and gold/blue/teal for S1/S2/S3.
- **Do** take channel, map, wheel and opponent colors from `src/utils/themeColors.ts` by name.
- **Do** separate surfaces by tone and a `lmu-border` hairline.
- **Do** put a 10px uppercase tracked label above a bold readout for key figures.
- **Do** give every interactive control a visible `focus-visible` ring.
- **Do** mark inferred, estimated or partial values visibly (amber, an icon or wording). Never present them like measured values.

### Don't:
- **Don't** render any text below 10px.
- **Don't** add glass (`backdrop-blur`) to content panels, glow halos, blurred color blobs or gradient panels; blur is for the navbar and overlays only.
- **Don't** use Pit Lane Red as a panel fill or a decorative accent; it marks brand and selection.
- **Don't** use raw Tailwind palette classes (`text-emerald-400`, `bg-slate-800`) or introduce a new hue for something that already has a role; add a role to `tailwind.config.js` first.
- **Don't** dim text with `opacity-*`; step down a text tier or desaturate.
- **Don't** add a light theme.
- **Don't** add web fonts; Segoe UI and Consolas are the rendered fonts, and the app loads nothing from a font CDN.
- **Don't** use decorative pulse or ping animation on static chrome; reserve `animate-spin` and `animate-pulse` for real loading or live-sync states.
