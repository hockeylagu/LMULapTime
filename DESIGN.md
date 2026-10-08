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
  lmu-accent-text: "#FF4D55"
  lmu-accent-soft: "oklch(80.8% 0.114 19.571)"
  lmu-accent-deep: "oklch(25.8% 0.092 26.042)"
  lmu-gold: "#FFB703"
  lmu-blue: "#219EBC"
  lmu-cyan: "#8ECAE6"
  lmu-green: "#2A9D8F"
  lmu-personal-best: "#FFB703"
  lmu-session-best: "#75B9F5"
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
  table-header:
    fontFamily: "Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.05em"
  field-label:
    fontFamily: "Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 600
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
  button-primary-disabled:
    backgroundColor: "{colors.lmu-raised}"
    textColor: "{colors.lmu-faint}"
    rounded: "{rounded.xl}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "{colors.lmu-card}"
    textColor: "{colors.lmu-text-soft}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 12px"
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
  segment-resting:
    backgroundColor: "{colors.lmu-raised}"
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
    rounded: "{rounded.xl}"
    padding: "10px 16px"
  status-pill:
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    padding: "2px 8px"
  toc-item:
    textColor: "{colors.lmu-muted}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  toc-item-active:
    backgroundColor: "{colors.lmu-card}"
    textColor: "{colors.lmu-text}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  progress-track:
    backgroundColor: "{colors.lmu-border}"
    rounded: "{rounded.full}"
    height: "8px"
---

# Design System: LMU Lap Time Analyzer

## Overview

**Creative North Star: "The Engineer's Pit Wall"**

The interface is the timing screen a race engineer reads after the run. It is dense, precise and quiet. Numbers carry the page, and color only speaks when something changed: a gain, a loss, a warning, the selected thing. The driver sits down after a session to find out where the time went, so every panel answers a question with a figure, and the traces stay one step away for anyone who wants to check the working.

The surface is near-black blue (`lmu-bg`), and content panels are raised by tone rather than by light. A single racing red marks the brand, the active tab and the current selection. Gold, emerald, amber, rose and sky are signal colors with fixed meanings (sectors, gain, warning, loss, data). Type is small and heavily weighted, with uppercase tracked labels over bold monospaced readouts, the way a timing monitor stacks a caption over a value.

Depth is flat and tonal: solid panels on a solid page, with no glass, glow or gradient anywhere in the content. Nothing moves unless the user acts, work is running, or the data itself moves.

**Key Characteristics:**
- Dark only, near-black blue base; no light theme.
- Numbers first: lap times, deltas and units in bold monospace.
- Uppercase, tracked, 10px labels above values.
- One brand red for identity and selection; every other hue is a fixed-meaning signal.
- Flat tonal layering with hairline borders; no glow, no glass.
- Dense desktop layout inside a 1500px column.
- Still at rest: motion reports state, never decorates.

### Motion

Motion reports state and keeps continuity. A driver scrubbing a lap is reading traces, and anything that moves on its own competes with the playhead.

- **Feedback (100–150 ms):** color, border and opacity transitions on hover, press and selection (`transition-colors`, `transition-opacity`). Hover never scales, rotates or lifts a surface. Two exceptions: a chevron may nudge 2–4px toward where it leads, and a tiny target (a map marker, a sparkline dot) may grow to confirm it is under the pointer.
- **Enter (150 ms, ease-out):** overlays arrive with `animate-fade-in` (modals, scrims, full-screen views, inline banners). Anchored menus and popovers use `animate-pop-in`, a fade plus a 4px drop from their anchor. Keyframes live in `src/index.css` (`@theme`). Nothing animates out; a closing overlay unmounts.
- **Loops:** only while work is running: `animate-spin` on a busy control, `animate-pulse` on skeletons, loading text and the scan in progress. A live state (ABS, TC, pit limiter, the selected corner, the car on the map) is shown by fill, rim and position. It does not flash.
- **Content motion:** the playhead, the car on the map and chart updates move because the data moves. They are driven by playback (`requestAnimationFrame`), not by CSS. A progress bar's fill eases to each new value over 300ms.

**The Still Wall Rule.** When the user is not acting and nothing is loading, nothing on screen moves except the data itself.

**The Reduced Motion Rule.** Under `prefers-reduced-motion: reduce`, a global rule in `src/index.css` makes transitions and enter animations instant and stops loops. A spinner keeps turning, slower (2s), so running work still reads as running. JavaScript smooth scrolling checks the same media query.

## Colors

The palette is a cold, near-black instrument panel with one hot brand red and a small set of signal hues that each mean exactly one thing.

There is one color vocabulary: the `lmu-*` tokens in `tailwind.config.js` (`theme.extend.colors.lmu`), mirrored for charts and SVG in `src/utils/themeColors.ts`. Colors are named for what they mean, never for their hue. Raw Tailwind palette classes (`text-emerald-400`, `bg-slate-800`) are not used; a new need gets a role here first, then the component uses the role.

### Primary
- **Pit Lane Red** (`lmu-accent`): brand wordmark, active nav tab, selected segment, primary buttons, pit stop badges, focus outlines, scrollbar hover, text selection. The fill is tuned so white text on it passes 4.5:1. Red *text* on a dark surface uses **Pit Lane Red Text** (`lmu-accent-text`), which passes on every surface and on its own 20% tint. **Pit Lane Red Soft** and **Deep** (`lmu-accent-soft`, `lmu-accent-deep`, Tailwind red 300 and 950) exist only to build the race chip. Red is the one "this is selected / this is us" color; its one category use is the race session chip.

### Secondary
- **Sector Gold** (`lmu-gold`): sector 1, first place and compare lap 1. Paired with `lmu-blue` (sector 2) and `lmu-green` (sector 3) through `SECTOR_COLORS`.
- **Timing Blue** (`lmu-blue`) and **Pale Timing Cyan** (`lmu-cyan`): sector 2 and informational chips. On a `lmu-blue` tint, the label is `lmu-cyan`.
- **Sector Teal** (`lmu-green`): sector 3 and a secondary positive state.

### Tertiary: lap records
- **Personal Best Gold** (`lmu-personal-best`): a personal record on the same layout and in the same class. It takes precedence when the lap is also the session best.
- **Session Best Sky** (`lmu-session-best`): the selected driver's fastest lap in this session, with its own soft, strong, deep and faded steps for readable timing text and subtle row tints. The distinction is always labeled in text as well as color.

### Signal and data families
Each family has four steps plus a faded one:

| Step | Class form | Role |
|---|---|---|
| soft | `text-lmu-gain-soft` | Secondary text on dark, text on the family's own tint |
| base | `text-lmu-gain` | Primary text, icons, lines, dots |
| strong | `bg-lmu-gain-strong/20`, `border-lmu-gain-strong/40` | Fills and borders, almost always with an opacity modifier |
| deep | `bg-lmu-gain-deep/40` | Tinted wells behind a panel's content |
| faded | `text-lmu-gain-faded` | The base hue at `oklch(62% 0.06 h)`: unselected colored filters, still 4.5:1 on `lmu-bg` |

Most families use Tailwind v4's 300/400/500/950 steps. Retune a role in `tailwind.config.js`, never in a component.

- **Signals**, one fixed meaning each:
  - **Gain** (`lmu-gain`, emerald): time gained, clean laps, positive trends, places won.
  - **Loss** (`lmu-loss`, rose): time lost, penalties, incidents, places lost.
  - **Warn** (`lmu-warn`, amber): warnings, moderate deltas, inferred or uncertain values, the baseline trace, the rival.
  - **Info** (`lmu-info`, sky): the primary telemetry trace and informational highlights inside data views. Not for identity or decoration.
- **Data categories**, for telemetry channels, pace categories, car classes, session types and conditions: **Aqua** (cyan), **Azure** (blue), **Indigo**, **Violet**, **Purple**, **Orange**, **Teal**. They separate categories and carry no judgement. Purple means best lap and alien pace; it is never a session color.

Telemetry, map, wheel-corner and pace-category colors used by charts and SVG are fixed lookup tables in `src/utils/themeColors.ts` (`TELEMETRY_COLORS`, `MAP_COLORS`, `WHEEL_CORNER_COLORS`, `PACE_CHART_COLORS`, `SECTOR_COLORS`, `CHART_COLORS`). Use them by name; never pick a new hue inline for a channel that already has one.

### Neutral
- **Pit Wall Black** (`lmu-bg`): page background and inset wells (inputs, segment groups, icon buttons, the benchmark ladder).
- **Deep Tarmac** (`lmu-deep`, `lmu-dark`, `lmu-surface`, `lmu-strip`, `lmu-badge`): the recessed steps below the page: map canvases, strips, badge wells, table stripes, and the text on a solid signal fill.
- **Garage Panel** (`lmu-card`): raised content panels and secondary buttons. **Garage Panel Hover** (`lmu-card-hover`, class `lmu-cardHover`) is its hover step.
- **Raised Chip** (`lmu-raised`): chips, keycaps, progress tracks, neutral pills and the resting selected state of neutral toggles.
- **Hairline** (`lmu-border`): panel borders, dividers and table rules, often at 40–70% opacity. **Rule** (`lmu-rule`) and **Rule Strong** (`lmu-rule-strong`) are the visible borders of controls and their hover step.
- **Text tiers**, brightest first:
  - **Grid White** (`lmu-text`): primary text and values, driver and track names.
  - **Soft White** (`lmu-text-soft`): secondary values, card headers and body copy that should recede slightly.
  - **Telemetry Grey** (`lmu-muted`): labels and secondary text. It is the most used text color in the app.
  - **Faint Grey** (`lmu-faint`): tertiary captions, separators and off states.

  Every tier passes 4.5:1 on `lmu-bg` and `lmu-card`. `lmu-faint` drops to 4.26:1 on solid `lmu-raised`, so on a raised chip use `lmu-muted` or brighter.

The root declares `color-scheme: dark` (`src/index.css`), so native scrollbars, select popups and form controls render dark without per-component styling.

### Contrast
| Pair | Ratio |
|---|---|
| `lmu-text` on `lmu-card` | 16.6 |
| `lmu-muted` on `lmu-card` | 6.1 |
| `lmu-faint` on `lmu-card` | 5.1 |
| `lmu-accent-text` on `lmu-card` | 5.9 |
| White on `lmu-accent` | 4.55 |
| Signal base and soft steps on `lmu-card` | 5.6 or more |
| `lmu-accent-soft` on the race chip | 9 |

Two cases fail and must not be used:
- **Strong step as text.** Loss, azure, indigo, violet and purple fall to 3.8–4.6:1 when the `-strong` step is used for text. Use the base or soft step.
- **White on a solid strong fill.** Sky and rose fills fail with white text. A solid signal fill carries `lmu-deep` text, like a flag on a timing board.

### Named Rules
**The Signal Rule.** Every signal family means one fixed thing: gain is time gained, loss is time lost, warn is a warning or an uncertain value, info is data, and gold, blue and teal are sectors 1, 2 and 3. Data families only separate categories. Never use a signal color decoratively, and never let two signals trade meanings between views. A scale label or legend is neutral text; the channel's color lives on its trace or swatch.

**The One Red Rule.** Pit Lane Red marks identity and the current selection. A screen shows it on the active tab, the selected control, your own row and at most a handful of alerts. It never fills a panel. Identity is red, never gold or amber: gold belongs to P1 and personal bests, amber to the rival.

**The Meaning Before Calm Rule.** When removing color, keep every distinction a color draws: two states that had two colors keep two looks (a replay with the car's own telemetry keeps a green glyph with the trace cut out, a replay only keeps the white one). Only a color that separates nothing may go neutral. Headers, icons and names that separate nothing are neutral.

**The No Dimmed Text Rule.** Never dim text with `opacity-*` to show an off, unselected or secondary state. Step down a text tier instead (`lmu-faint` for off), or fade a colored control through its family's `faded` step, full color when selected or hovered.

## Typography

**Display / Body Font:** Segoe UI (`system-ui`, then `sans-serif` off Windows)
**Readout Font:** Consolas (then `monospace`)

**Character:** A plain Windows UI face in heavy weights over a stark monospace: the faces LMU's own platform renders, with zero web fonts. It is utilitarian by design; the character comes from weight, case and tracking, not from a display face. The mono stack names Consolas first so a bare `monospace` never triggers the browsers' 13px generic-monospace sizing quirk; SVG text sets `fontFamily="Consolas, monospace"` for the same reason.

### Hierarchy
- **Brand** (800, 18px, uppercase, 0.025em tracking): the navbar wordmark only.
- **Page Title** (600–800, 30px): the circuit title on session and track detail.
- **Headline** (800, 18px, tight tracking): page and modal headers such as "Welcome back".
- **Panel Heading** (700, 14px, uppercase, tracked, with a 16px icon): the heading over a panel's hairline.
- **Title** (600–700, 14–16px): card titles, track names, nav tabs.
- **Body** (400–500, 12px, 1.5 line height): descriptions, helper text and debrief prose. It is the default text size across the app. Expanded event prose runs at 13px on a 20px line.
- **Label** (700, 10px, uppercase, 0.05em tracking): captions above values, pills and badges (`READOUT_LABEL` in `settings/labelStyles.ts`).
- **Field Label** (600, 11px, uppercase, 0.05em tracking, muted): the caption over a form field, one step above the Label (`FIELD_LABEL`). Help text under a field is 11px muted sentence case.
- **Table Header** (600–700, 11px, uppercase, 0.05em tracking, muted): every data table's column labels, including sort buttons.
- **Readout** (monospace 700, 12px; **Readout Small** 11px in dense tables and chips): lap times, deltas, positions, counts and units. **Readout Large** (monospace 800, 18px and up) is for headline values: 20px on track summary cards, 24px for a finishing position, 28px for a ranked-list leader, 30px for a session's best lap.

### Named Rules
**The Readout Rule.** Every number a driver compares (lap time, delta, position, speed, temperature, percentage) is set in `font-mono` with its unit. Prose numbers in a sentence may stay proportional.

**The 10px Floor.** No text renders below 10px, and sizes stay on the ramp: 10, 11, 12 (`text-xs`), 13 for expanded event prose, 14 (`text-sm`) and up. Off-ramp sizes (`text-[9px]`, `text-[10.5px]`, `text-[13.5px]`) are drift. SVG labels follow the same floor at their rendered scale (the friction circle's 128-unit viewBox draws at 116px, so its labels are 11 units). Where 10px does not fit, restructure the element instead of shrinking the text. Modal labels and explanatory text use at least 11px.

**The Label Rule.** Uppercase text always carries `tracking-wider`; caps without tracking read cramped at 10–12px.

## Layout

Desktop only and dense. The design width is 1500px: content sits in a centered 1500px column (`max-w-[1500px]`) with 32px side gutters (`px-8`), and the sticky navbar spans the full width with its contents in the same column. The column stays 1500px on wider monitors so one screen holds one question, and a little vertical scrolling beats spreading data left and right. Below the floor (`min-w-[1480px]` on the app root, a 1500px window less its scrollbar) the page scrolls sideways instead of reflowing. The one exception is the telemetry studio (`/telemetry`), a wide workspace designed for a minimum 1920px viewport.

Spacing is tight and follows Tailwind's 4px scale, with half steps. Gaps between inline items are 4–8px (`gap-1`, `gap-1.5`, `gap-2`, the three most used values). Groups are 12–16px apart and panel padding is 16–24px. Chips and badges use 2px vertical padding. Laptops, tablets and phones are not the audience: new work needs no `sm`/`md`/`lg` variants, and the existing ones are inert above the floor.

Toolbars sit directly on the page surface, not in a panel. Wide tables scroll horizontally inside their panel rather than widening the column.

A long page of independent sections (Settings) uses a two-column layout: a 240px sticky table of contents on the left (`sticky top-[84px]`, clearing the navbar, with a hairline right border) and a single stack of 16px-radius panels 24px apart on the right. Each section has an id, `scroll-mt-[84px]` and a heading that takes focus when jumped to, and the open section is kept in the URL (`?section=`). Sections are not tabs: everything stays on one scrolling page, and search filters the stack and the table of contents together.

**The Timing Sheet Rule.** Density is a feature. Prefer rows, tables and label-over-value stacks to spacious cards. Reach for whitespace only to separate questions, not to decorate an answer.

**The One Anchor Rule.** A circuit's page anchors on its outline and benchmark ladder in the header; summaries below are unboxed figures on shared columns, not another grid of tiles.

## Elevation & Depth

Flat and tonal. Depth comes from stepping between the neutral surfaces: the deep tones sit below the page, `lmu-bg` is the page and the inset well, and `lmu-card` panels sit above it, each edged with a `lmu-border` hairline. Hover lifts a surface one tonal step (`lmu-card-hover`, or `white/5–10` over a panel) rather than adding a shadow. Selection is shown by fill and border (solid red, or a signal tint with its rim), never by a glow. The playhead is a plain white line.

### Shadow Vocabulary
These are the only shadows the app uses:
- **Marker lift** (`shadow-[0_2px_10px_rgba(0,0,0,0.85)]`, `drop-shadow-*` on SVG): only where a marker or cursor readout floats over busy geometry, the track map or a telemetry trace.
- **Overlay** (`shadow-lg` to `shadow-2xl`): popovers, dropdowns, tooltips, modals, toasts and the controls floating over the map, which genuinely sit above the page.

### Named Rules
**The Flat Wall Rule.** Content panels are solid, opaque and shadowless. Blur is allowed on the sticky navbar and on overlays (modal scrims, tooltips, popovers, map overlays) only, never over data. No glow halos, no gradient panels, no decorative light, no inset tiles behind outlines.

## Shapes

Soft, consistent rectangles. The radius grows with the size of the thing: 4px (`rounded`) for status pills and small badges, 5px for segment buttons, 6–8px (`rounded-md`, `rounded-lg`) for icon and secondary buttons and nav tabs, 12px (`rounded-xl`) for text inputs, primary buttons, compact panels and control wells, and 16px (`rounded-2xl`) for top-level panels. `rounded-full` is for status dots, progress tracks and avatars only.

Borders are 1px hairlines in `lmu-border` (often at 40–70% opacity) or in a signal color at 20–40% opacity for tinted chips. Track outlines and maps are drawn line work (`MAP_COLORS`), never filled illustration, and sit on the panel without a tile.

## Components

### Focus
Every interactive control shows a 2px outline on keyboard focus: `focus-visible:outline-2 focus-visible:outline-offset-2` in `lmu-accent-text` (or `lmu-accent`). Table rows draw it inside the row (`-outline-offset-2`). A transparent select inside a well stays bare (`outline-none`) and the well draws the outline instead (`has-[select:focus-visible]:outline-2`). Mouse focus on buttons and selects shows nothing extra; text fields show the outline on any focus, as browsers treat them. Never use `focus:outline-none` without a replacement.

### Buttons
Compact and assertive.
The shared class strings live in `common/buttonStyles.ts` (`PRIMARY_BUTTON`, `SECONDARY_BUTTON`, `FOCUS_RING`); use them rather than restating the utilities.
- **Primary:** Pit Lane Red fill, 12px radius, white 12px bold uppercase label with 0.05em tracking, 10px × 20px padding. Hover softens the fill to 90%. Disabled turns neutral (`lmu-raised` fill, `lmu-faint` text, not-allowed cursor) rather than showing a faded red. One per panel at most: it is the action that commits (Save Key).
- **Secondary:** a neutral 32px `lmu-card` button, 12px horizontal padding, 8px radius, an `lmu-rule` border, semibold 12px sentence-case `lmu-text-soft` label, lifting to `lmu-card-hover` and white on hover. Disabled drops the label to `lmu-faint`. It is the default action button: header actions, jump buttons (related session, rules, Compare Laps), Retry, Update, Clear and the confirm and cancel pair. An icon carries color only when it has meaning (a session type dot).
- **External link:** the secondary shape with a `lmu-border` hairline, muted text and an external-link icon, brightening on hover ("Get a Gemini key"). An inline external link is `lmu-text-soft` text with a 12px icon that underlines on hover ("View sheet").
- **Quiet outlined:** hairline border, muted semibold 12px text, white text and `lmu-rule` border on hover ("Where's the time?", the leaderboard "Compare").
- **Icon:** a 6px-padded square on `lmu-bg` with a hairline border and muted icon. On hover it fills red (destructive or primary) or lifts one tonal step (neutral).
- **Tinted:** a signal color at 10% background, 20% border and its text step (`bg-lmu-accent/10 border-lmu-accent/20 text-lmu-accent-text`), filling solid on hover. (The replay action is not tinted: see Replay action.)
- **Busy:** a running action stays at full strength with a default cursor and a spinning icon rather than fading.

### Segmented Pills
The signature filter control (session type, car class, sort, chart view). A 36px `lmu-bg` well with a hairline border and 12px radius holds 24px-tall monospace uppercase segments with a 5px radius (32px wells for chart view switches).
- **Red means the list is narrowed.** A selected segment that filters is solid red with white text. A selected "All" rests neutral (`lmu-raised` fill, `lmu-rule` hairline, white text; `SEGMENT_RESTING` / `SEGMENT_NARROWED` in `common/SessionTypePills.tsx`).
- **Replay action** (`common/replay/`): one glyph everywhere a replay opens (dashboard hero, session header, session rows and cards, lap rows, the Has Replay filter). A neutral `lmu-card` button with a hairline and a white bold label; the glyph carries the meaning. A replay only is the solid white play triangle, "Replay". A replay with the car's own telemetry is the same triangle in gain green with a trace knocked out of it, "Replay + telemetry" with the label in the same `lmu-gain`. Rows use the compact 28px icon button, headers the 32px labelled one. Processing, queued and failed keep the shape, muted, with their own icon. A partly failed replay that still opens keeps its normal button and says what is missing in the tooltip.
- **Toggles are neutral.** On/off toggles (Hide Empty, Has Replay), the grid/table switch, chart view switches, unit toggles and the current page are `lmu-raised` when on, never red.
- **Off segments** have a hairline and `lmu-faint` text at full opacity, brightening to white on hover.
- **Colored filters** keep their color when selected (car class, session type); off, they fade to the family's `faded` step with a 30% border and no fill, returning to full color on hover. Session type pills show the dot when off and the chip when chosen, so the filter doubles as the legend.
- Filter buttons expose `aria-pressed`.

### Status Pills & Badges
- **Style:** 4px radius, 2px × 8px padding, 10–12px bold label, the family's `strong` step at about 15–20% background with a 30% border and its `soft` or base step as text.
- **Session type chip** (`common/sessionTypeStyles.ts`), rising with the stakes: practice neutral (`lmu-raised` chip, muted dot), qualifying amber (`lmu-warn` tint), race red (`lmu-accent-deep` 60% fill, `lmu-accent-soft` text, `lmu-accent` 70% border, reading at least as strong as qualifying). Warm-up and other types stay neutral. The chip (R1, Q1, P1) has a 34px minimum width so names line up.
- **Lap status** (`LapStatusBadge`): the canonical lap status. Pit stop is red, out lap is cyan; start, pit and out icons are neutral, valid is gain, incomplete is warn, and inferred and invalid are told apart by icon and color. Reuse it rather than re-deriving it.
- **Pace badge** (`PaceBadge`, `PACE_CATEGORY_STYLES`): flat and identical everywhere: a 6px dot and the category name in its pace color, the percentage in muted mono, no box, fill or emoji. It never wraps (the lap table reserves 176px for it). It shares its dot with the benchmark ladder and ranked lists.
- **Car class** (`CarClassBadge`): fixed per-class colors; the ELMS corner fades with its pill.
- **Identity tags:** your row carries a filled red "You" tag; the rival an outlined amber "Rival" tag. In classifications "(You)" is muted text.
- **Safety badges:** independent compact badges so penalties never hide contacts or track limits: amber for reported contacts (no blame inferred), neutral for cleared track limits, amber for warnings, rose for serious track limits (from 0.75 points, `utils/trackLimits.ts`) and issued penalties. A clean record is a quiet emerald check and label. Each badge has an accessible name and a full event tooltip.
- **Empty session:** an amber-text chip on a rim, with no row tint.

### Cards / Panels
- **Corner Style:** 16px for top-level panels, 12px for compact ones.
- **Background:** solid `lmu-card` with a 1px `lmu-border` hairline.
- **Heading:** a 14px uppercase tracked heading with a 16px muted icon over an `lmu-border/60` hairline; a muted count beside it where there is one ("Laps 42"). Session detail panels pad 20px.
- **Signal rim:** a card with one meaning takes a 30% rim of that signal (the rival card is `lmu-warn-strong/30`).
- **Clickable card:** hover steps to `lmu-cardHover` with an `lmu-rule` border; no lift, no translate. Cards that navigate are native links with a visible focus outline.
- **Internal Padding:** 24px (top-level) or 16px (compact), with 12–16px between groups.
- **Header icons are neutral.** Dashboard card headers are `lmu-text-soft` with a muted icon, all alike.

### Summary Figures
The label-over-value stack, unboxed. `SummaryStat`: a 10px muted uppercase label, a white mono value, a muted hint, on shared columns with no tile around each figure. Color only for signals (gain for a sub-best potential or very steady consistency, warn and loss when scattered, gold for P1 and laps led, gain or loss for places). The headline value is a large white mono readout (personal-best gold when it is one) with its pace badge beside it; when it opens telemetry it is a button with a muted chevron that brightens on hover. In a race, the result is a second row of figures under a hairline on the same columns (finish, places, peak, laps led, pit stops, incidents, track limits); the sector table spans both rows on the right, vertically centered, and practice and qualifying use one row.

**Ranked list** (`RankedList`): the first item is a headline (value in 28px mono extrabold, the name in white, one muted detail line); the rest are quiet numbered rows (`lmu-faint` numbers, `lmu-text-soft` names and values). A "most driven" order is not a podium, so ranks take no gold, silver or bronze. On a pace headline, the percentage carries the category color and the category name stays soft white.

### Benchmark Ladder
`common/BenchmarkLadder.tsx` is the one way the app shows a layout's benchmark pace, always under the circuit name (session header, track header): six equal rungs in an `lmu-bg` well split by hairlines, Alien to Offline. Each rung has a dot and label in its pace category color (the label muted unless it is the current band), the target time in white mono and the percent in `lmu-faint`. The band the best lap falls in takes the category's tint fill and `aria-current`. There are no other tiles or grids for benchmark targets.

### Data Tables
Lap table, classification, standings, session list and leaderboard share one grammar.
- **Headers:** 11px uppercase tracked muted (Table Header); sort buttons inherit it and carry `aria-sort`.
- **Rows:** hairline rules, hover tint one step up. Rows take focus and open or select on Enter or Space, with the inset 2px `lmu-accent` outline.
- **Order:** position reads first, then the lead figure (lap time bold at 14px, the pace badge beside it), then right-aligned 12px mono gaps, then secondary columns (sectors in soft text at a consistent 128px width), then status and resources. Optional columns extend the horizontal scroll.
- **Marks:** your row is the identity red (`lmu-accent/10` tint, rank in `lmu-accent-text`, filled "You" tag). The rival row has no tint, only its amber tag. The selected driver's session best is sky (`lmu-session-best` text, `lmu-session-best-strong/10` row tint); a personal best is gold and takes precedence; a sector best takes its sector color and says so to screen readers. P1 is gold; the best lap in a session list is white.
- **Positions:** in multiclass, the class position is the primary 14px bold white readout with the overall rank in muted 11px parentheses on the same line, for example P2 (P12), hidden when equal; the tooltip explains it, and sorting by position follows the class positions shown. A race finish reads `P7 +3`, the change in gain or loss, `±0` muted. The classification follows the session type: a race shows +/- and the time or gap to the winner; practice and qualifying drop +/- and show the best lap's gap to the fastest (in class when multiclass).
- **Measured vs uncertain:** invalid and inferred lap times stay white and italic, inferred ones keep their approximation marker. A sector sum slower than the recorded best carries an explanation rather than altering the measured time. Missing values are explicit text, never zero.
- **Columns explain themselves:** a label whose measure is not obvious (Gap, Vs You, Best S1, Vs alien target, Theoretical best, Race pace) carries a tooltip. Truncated names carry their full text as a tooltip; long names wrap with automatic text direction.
- **Expanded row:** a compact two-column debrief in 13px prose on a 20px line with sentence-case headings. Position changes and pit activity lead; recorded clocks align beside their event. Headings and prose stay neutral; gains keep green emphasis, and contacts, penalties, lost places and actionable track limits use small colored icons rather than colored paragraphs. Pit, conditions and traffic use muted icons. Pace exclusions and conditions sit in a muted footer. Estimated pit loss and likely repairs are worded as estimates.
- **Row actions:** one visible action per row (a small outlined "Compare"); secondary icon actions appear on row hover or focus, always on coarse pointers, and a lap already in use keeps its ticked icon. Your own row shows its icons all the time. While other drivers' laps are in the comparison, a small bar sticks to the bottom of the board ("N laps from the board in the comparison · Go to compare").
- **Collapse:** drivers a compact board hides fold into a quiet left-aligned "N more drivers" link.
- **Pagination** (`SessionPagination.tsx`): 25 per page under a hairline, "1–25 of 219 sessions" in muted text with mono numbers, then prev/next and a page window in 28px mono steps.

### Stored Records (Settings)
What the app keeps (cached replays, AI reports) reads as a log inside its panel. It follows the data table grammar, with no cards per item.
- **Scroll box table** (`settings/replays/ReplayCacheTable.tsx`): a capped height (448px) that scrolls inside the panel, between top and bottom hairlines with no side border. The 11px Table Header sticks to the top on `lmu-card`. Every column sorts: the active column's label turns white with a direction arrow, and inactive columns show a faint double arrow. A column whose meaning is not obvious explains itself in a tooltip and to screen readers. The name column takes the free width and truncates in the middle of a long filename so its date and suffix stay readable, with the full name as a tooltip. Figures are right-aligned 12px mono, with a value ladder: counts and durations in white, sizes in soft white, dates in muted.
- **State words, not badges:** the source column reads "Archived" in semibold gain (the cache holds the only copy, which counts as a kept asset) or "On disk" in muted. The version reads muted, "v behind" in semibold warn while a re-decode is due, or "v · kept" muted for an archived replay that can't be decoded again.
- **Filter row:** an `lmu-bg` name filter with a 36px, 12px-radius well and a muted focus border (it narrows the list, it doesn't select). Next to it are segmented pills with a count in each (All, On disk, Archived, Outdated), and on the right a polite muted mono result line.
- **Log list** (`settings/AiReportsHistoryCard.tsx`): rows between hairlines, 12px × 10px padding. Each row has a semibold white title that truncates, with the time in muted mono on the right. Below it come a 2-line clamped muted summary, then a muted mono metadata line (model, baseline, tokens). It shows the latest 5, with a secondary "Show all N" toggle. The panel heading carries the "N cached" count in muted mono and a small refresh icon button that spins while loading.

### Inputs / Fields
- **Style:** `lmu-bg` well, hairline border, 12px radius, 12–14px white text (mono for paths), an optional leading muted icon.
- **Focus:** the border shifts to Pit Lane Red; the session search shifts to `lmu-muted`, since red there would read as a filter. Both add the 2px outline (see Focus).
- **Selects:** transparent inline selects with semibold white text inside a pill or toolbar well (the driver picker is a single `lmu-bg` well with a transparent select).
- **Field label and status** (`settings/PathField.tsx`): the 11px Field Label on the left, with one status on the right: "Detected" in gain with a check, "Not found" in warn with an alert, or, once the value is edited, muted "Changed, save to check" with a Reset link. A field the server rejects takes an `lmu-loss` border and the reason under it in loss with an icon, and the typed value is kept. 11px muted help text closes the field.
- **Search in a side panel:** the settings search sits on `lmu-card` with an 8px radius and a leading icon, and a clear button appears once there is text. A polite line under it counts the matches ("2 of 6 sections match").
- **Toolbar** (`SessionFilterParts.tsx`): two rows. Row one finds and orders (search, track select, sort, view mode); row two narrows (class, session type, toggles) and ends with a neutral "Clear filters" shown only while something narrows the list.

### Navigation
A sticky top bar: `lmu-card` at 75% opacity with a blur (the one sanctioned blur on chrome) and a hairline bottom border, laid out as a three-column grid with equal sides so the tabs sit on the page's true center line.
- **Brand:** a 40px red-tinted gauge tile (it deepens on hover; the wordmark never changes color) and the uppercase wordmark with "Lap Time" in red.
- **Tabs:** a group in an inset `lmu-bg` well with a 12px radius; tabs are 32px, 14px medium with a 16px icon. Active is solid red with white text; inactive is muted, lifting to `lmu-raised/60` on hover.
- **Status:** 32px chips and the refresh button in the same well, muted, lifting to white with an `lmu-rule` border on hover (never red). The sessions dot is gain when LMU results exist and warn when none do; while a scan runs the film icon pulses and the refresh icon spins in `lmu-info`.
- **Links:** titles that navigate (the circuit title) are native React Router links with a visible focus outline and keep the car-class context.

### Section Navigation
The table of contents beside a long page (`settings/SettingsSidebar.tsx`). Items are 12px medium text with a 16px icon, 8px × 12px padding and a 6px radius. Muted at rest, they lift to white over `lmu-card/60` on hover. The current section takes an `lmu-card` fill, white text, a 2px Pit Lane Red left edge and a red icon (`aria-current="location"`), which counts as a selection under the One Red Rule. A scrollspy tracks the section in view, and a click pins it until the scroll settles.

### Confirmations & Feedback
- **Inline confirm** (`settings/controls/InlineConfirm.tsx`): a destructive or irreversible action asks in place of the button that started it. The button swaps for a soft-white question ("Clear 42 parsed sessions?") and a secondary confirm and Cancel pair. Focus lands on Cancel, Escape cancels, and focus returns to the trigger. Confirms do not open a modal.
- **Feedback message** (`FeedbackMessage` in `settings/SettingsPanel.tsx`): the result of an action sits under its control as 12px semibold text with a 16px icon: gain with a check for success (`role="status"`), loss with an alert for failure (`role="alert"`). Long server messages wrap.
- **Setup banner:** when required folders are missing, a 12px-radius `lmu-card` strip over the page names them, with a warn icon and an underlined white link that jumps to the field to fix. It is not a red alert.
- **Change summaries:** counts of what an update did read as colored words: "+3 new" gain, "2 updated" warn, "1 removed" loss. In the list below, each row has a matching 10px colored label, the old value muted and struck through, an arrow, and the new value in white mono.

### Progress
Running work (`settings/replays/ReplayProgress.tsx`) sits in an `lmu-bg` well with an 8px radius and 16px padding: a 10px Label and a white mono count ("12 / 40"), then an 8px full-round track in `lmu-border/50` with an `lmu-info` fill, then the current file in 11px muted mono with its percent in info, and the stage in 10px muted sans. The bar shows only while work runs. At rest, one quiet muted line says what is left ("Replay upgrade: nothing to do.").

### Dialogs
Modals (Rules & Config, circuit information) mount on the body with `animate-fade-in` over a blurred scrim, an 18px semibold title and flat specification columns separated by rules. In circuit information, restrained cyan marks specifications and data provenance, timing-gate labels take the sector gold and timing blue, and corner names are plain wrapping text. Opening focuses the close control, makes the background inert and locks scrolling; Tab stays inside; Escape and backdrop click close; closing restores focus, interaction and scrolling.

### Async States
- **Loading:** skeletons and loading text pulse; a polite status region (`role="status"`) announces progress, completion and unavailable results.
- **Errors:** a part that fails shows the server's message (`ApiError`) with a "Try again" link in its own place, and the rest of the page keeps working. A failed action keeps its context and says so under it.
- **Empty:** centered muted text at 48px vertical padding inside the same panel shell, worded plainly ("only you so far", "of N drivers" below ten).
- **On demand:** analysis that costs time (the debrief comparison) starts when requested, not on load.

### Telemetry Traces & Track Map (signature)

- **Fullscreen GPS HUD:** retain colored column headers for fast scanning (user preference, 2026-10-08): sky speed, green throttle, red brake, indigo steering, amber delta/G-force, cyan line separation and purple status. Use existing semantic tokens. This is an intentional exception to neutral ordinary labels; do not remove these colors in a polish pass.
- **Charts:** Recharts on the dark base with horizontal `CHART_COLORS.grid` gridlines only and `lmu-muted` axes; 2px traces with small unringed dots (the ring and a 4px point show only on hover); averages as a thinner dashed line of their series, or `lmu-muted` when they average several; an opaque tooltip marking each value with a short stroke of its line color over white text. Headings are short (Lap trends, Class positions, Tire wear, Fuel & energy); the metric controls carry the detail.
- **Series hues:** every series takes the hue it has elsewhere: sectors in `SECTOR_COLORS`, tyres in `WHEEL_CORNER_COLORS`, channels in `TELEMETRY_COLORS` (speed sky, baseline amber, throttle emerald, brake red, steering indigo), fuel and virtual energy as in the replay telemetry.
- **Positions chart:** you in red, the field in thin `lmu-muted` lines; hovering or focusing a legend name lifts that driver out in white.
- **Legend:** you first, then measured series, then averages; labels are `lmu-text-soft` native toggle buttons with `aria-pressed`, the swatch carrying the color.
- **Strips:** telemetry strip gridlines take the channel color dimmed, while scale labels stay `lmu-muted` at full strength (`TelemetryStaticTrace`).
- **Map:** road surface and boundaries in `MAP_COLORS` line work, racing lines colored by speed, pedal or lateral G; monospace labels obey the 10px floor.

### Telemetry Studio
- Telemetry header: track/layout leads, with primary and baseline driver/lap controls grouped beside it. Event, split, replay filename, duration and file size live in the Info disclosure; weather and temperatures stay visible under the track name. Back is the single page exit; playback groups rewind, play/pause and a native speed selector. Telemetry is a wide workspace designed for a minimum 1920px viewport.
- Telemetry charts, GPS map, HUD and corner phases share flat panes with compact toolbars and simple dividers, rather than nested cards. Trace and sector colors stay semantic. Toolbar sector times use sector 1 gold, sector 2 blue, and sector 3 teal only for session-best splits; other splits stay white. The toolbar lap time is gold only for the recorded personal-best replay/lap on the same layout and class, session-best blue otherwise, and white for ordinary laps; no Fastest Lap badge.
- Telemetry channels reserve a compact 24px title row: plain colored names at the left, legends and controls at the right. Below it, traces and scale ticks share one plotting area, filling its height with a 6px bottom inset. SVG viewBoxes match each channel’s actual numeric scale; speed ticks use the path’s computed maximum. Live readings appear only on the scrub cursor; status and source indicators remain beside the channel name. Scrub readouts keep one vertical position below the upper scale label throughout the lap, switching sides only near the right edge.
- The telemetry resolution popover uses flat fidelity statistics and explanatory text. Mode/source options use a shared neutral selected treatment; channel and source identity do not introduce saturated card fills.
- The telemetry preset editor uses flat channel rows, neutral selected presets and controls, and sans-serif UI copy. Color stays on channel identifiers and traces; category labels stay neutral. The apply button does not use telemetry blue as a primary action color. Compare-to-your-best is a neutral action, with gain colors reserved for measured gains.
- The telemetry preset dropdown follows the neutral editor selection treatment: white checkmarks, muted management links and a neutral edit action, with no telemetry-blue fills or borders.
- Telemetry drag controls use “Move cursor” and “Zoom range” under a quiet “Drag:” label. “Full lap” stays beside them, disabled at full view; it restores the range without resetting playback. A zoomed view shows its duration, with frame bounds in a tooltip.
- Resolution choices use semantic color sparingly: cyan Standard, green High, violet Full Raw; the selected source uses amber DuckDB or cyan VCR. Selected options retain aria-pressed, with softly tinted backgrounds and borders. Raw and active sample figures reflect those roles.
- Corner analysis uses “Lap analysis” without a baseline and “vs Baseline” when comparing. Selected rows and phase headings use neutral emphasis, with a red selected flag and small aqua/violet/teal phase icons for orientation. Measured gains/losses, track usage warnings and handling bands retain semantic colors; active overlay labels match their event colors on neutral backgrounds. Phase metrics appear once in the three-column breakdown, without a duplicate summary strip. The speed profile's apex marker is neutral.

### Track Cards & Headers
- **Track card:** one panel shell with a 128px circuit outline in a left column beside the title (16px semibold), session metadata and timing columns on a fixed 3:2 grid; the personal best in gold with its xs pace badge, the theoretical time in soft white; sector splits in three equal left-aligned columns below; one divider above the car inventory, a wrapping line of neutral 11px names. "Last driven" sits under the counts when known. No trophies, no bordered chips.
- **Track header:** a 160px outline column (128px minimum height) spanning the full height beside the 30px title, the car-class selection top right, an optional car-model selection beneath, then the benchmark ladder. Summary cards below are 20px semibold mono values without icons.
- **Session header:** one meta line (session type chip, date, mode, duration, conditions as quiet text, a hue only for wet and rain) over the circuit title, which hovers without gold, then the ladder. Rules & Config and the driver picker sit on the right as one row of 32px controls.

## Do's and Don'ts

### Do:
- **Do** set every comparable number in `font-mono` with its unit (The Readout Rule).
- **Do** use the semantic roles: `lmu-gain`, `lmu-loss`, `lmu-warn` (warning or uncertain), `lmu-info` (data), and gold/blue/teal for S1/S2/S3.
- **Do** take channel, map, wheel and opponent colors from `src/utils/themeColors.ts` by name.
- **Do** separate surfaces by tone and a `lmu-border` hairline.
- **Do** put a 10px uppercase tracked label above a bold readout for key figures.
- **Do** give every interactive control a visible `focus-visible` outline (2px, `lmu-accent-text`).
- **Do** mark inferred, estimated or partial values visibly (amber, an icon or wording). Never present them like measured values.
- **Do** show the server's error message with a way to try again, in the place that failed.
- **Do** confirm a destructive action inline, in place of its button, with Cancel focused; never with a modal.
- **Do** use `PRIMARY_BUTTON`, `SECONDARY_BUTTON` and `FOCUS_RING` from `common/buttonStyles.ts`; a disabled primary turns neutral, it never fades the red.
- **Do** reuse the canonical pieces (`LapStatusBadge`, `PaceBadge`, `BenchmarkLadder`, `ReplayLaunchButton`, the segmented pills) instead of re-deriving them.

### Don't:
- **Don't** render any text below 10px.
- **Don't** add glass (`backdrop-blur`) to content panels, glow halos, blurred color blobs or gradient panels; blur is for the navbar and overlays only.
- **Don't** use Pit Lane Red as a panel fill or a decorative accent; it marks brand, identity and selection.
- **Don't** mark your own row or name in gold or amber; gold is P1 and personal bests, amber is the rival.
- **Don't** use raw Tailwind palette classes (`text-emerald-400`, `bg-slate-800`) or introduce a new hue for something that already has a role; add a role to `tailwind.config.js` first.
- **Don't** dim text with `opacity-*`; step down a text tier or use the `faded` step.
- **Don't** box every figure in its own tile, or add a second grid of benchmark targets beside the ladder.
- **Don't** add a light theme.
- **Don't** add web fonts; Segoe UI and Consolas are the rendered fonts, and the app loads nothing from a font CDN.
- **Don't** use emoji in the UI; stored tags that carry them are stripped where shown.
- **Don't** loop an animation that is not waiting on work, and don't scale, rotate or lift on hover (The Still Wall Rule).
