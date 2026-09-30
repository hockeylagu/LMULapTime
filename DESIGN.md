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
- **Pit Lane Red** (`lmu-accent`, #DC3441): brand wordmark, active nav tab, selected segment, primary buttons, pit stop badges, scrollbar hover, text selection. The fill is tuned so white text on it passes 4.5:1. Red *text* on a dark surface uses **Pit Lane Red Text** (`lmu-accent-text`, #FF4D55), which passes on every surface and on its own 20% tint. **Pit Lane Red Soft** and **Deep** (`lmu-accent-soft`, `lmu-accent-deep`, Tailwind red 300 and 950) exist only to build the race chip. Treat red as the one "this is selected / this is us" color; its one category use is the race session chip.

### Secondary
- **Sector Gold** (`lmu-gold`): sector 1, first place, personal bests and compare lap 1. Classification marks the selected driver with red rather than gold. Paired with `lmu-blue` (sector 2) and `lmu-green` (sector 3) through `SECTOR_COLORS`.
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

Most families use Tailwind v4's 300/400/500/950 steps. Session best has a dedicated Sky blue ramp chosen for readable timing text and subtle row tints. Retune a role in `tailwind.config.js`, never in a component.

- **Signals**, one fixed meaning each:
  - **Gain** (`lmu-gain`, emerald): time gained, clean laps, positive trends.
  - **Personal best** (`lmu-personal-best`, gold): a personal record on the same layout and in the same class; takes precedence when the lap is also the session best.
  - **Session best** (`lmu-session-best`, sky blue `#75B9F5`): the selected driver's fastest lap in this session. Uses a dedicated blue family for text and subtle row tints. This distinction is labeled in text as well as color.
  - **Loss** (`lmu-loss`, rose): time lost, penalties, incidents, negative trends.
  - **Warn** (`lmu-warn`, amber): warnings, moderate deltas, inferred or uncertain values, the baseline trace.
  - **Info** (`lmu-info`, sky): the primary telemetry trace and informational highlights inside data views. Not for identity or decoration: the driver name is plain white (it is content, and red belongs to the app and to selection), and dashboard card headers are neutral (`lmu-text-soft` with a muted icon), all four alike: a hue on a header icon is decoration, so benchmark purple stays on the pace categories it describes.
- **Data categories**, for telemetry channels, pace categories, car classes, session types and conditions: **Aqua** (cyan), **Azure** (blue), **Indigo**, **Violet**, **Purple**, **Orange**, **Teal**. They separate categories and carry no judgement.

Telemetry, map, wheel-corner and pace-category colors used by charts and SVG are fixed lookup tables in `src/utils/themeColors.ts` (`TELEMETRY_COLORS`, `MAP_COLORS`, `WHEEL_CORNER_COLORS`, `PACE_CHART_COLORS`). Use them by name; never pick a new hue inline for a channel that already has one.

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

**The Meaning Before Calm Rule.** When removing color, keep every distinction a color draws: two states that had two colors keep two looks (the hero replay button stays amber for 100 Hz telemetry and green for a replay only). Only a color that separates nothing may go neutral.

**The One Red Rule.** Pit Lane Red marks identity and the current selection. A screen shows it on the active tab, the selected control and at most a handful of alerts. It never fills a panel.

**The No Dimmed Text Rule.** Never dim text with `opacity-*` to show an off, unselected or secondary state; that is how the app ended up with 2:1 labels. Step down a text tier instead (`lmu-faint` for off), or fade a colored control through its family's `faded` step (the base hue at `oklch(62% 0.06 h)`, still 4.5:1 on `lmu-bg`), full color when selected or hovered.

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

**The 10px Floor.** No text renders below 10px, and sizes stay on the ramp: 10, 11, 12 (`text-xs`), 13 for expanded event prose, 14 (`text-sm`) and up. Off-ramp sizes (`text-[9px]`, `text-[10.5px]`, `text-[13.5px]`) are drift. SVG labels follow the same floor at their rendered scale (the friction circle's 128-unit viewBox draws at 116px, so its labels are 11 units). Where 10px does not fit, restructure the element instead of shrinking the text.

**The Label Rule.** Uppercase text always carries `tracking-wider`; caps without tracking read cramped at 10–12px.

## Layout

Desktop only and dense. The design width is 1500px: content sits in a centered 1500px column (`max-w-[1500px]`) with 32px side gutters (`px-8`), and the sticky navbar spans the full width with its contents in the same column. The column stays 1500px on wider monitors so one screen holds one question, and a little vertical scrolling beats spreading data left and right. Below the floor (`min-w-[1480px]` on the app root, a 1500px window less its scrollbar) the page scrolls sideways instead of reflowing.

Spacing is tight and follows Tailwind's 4px scale, with half steps. Gaps between inline items are 4–8px (`gap-1`, `gap-1.5`, `gap-2`, the three most used values). Groups are 12–16px apart and panel padding is 16–24px. Chips and badges use 2px vertical padding. Laptops, tablets and phones are not the audience (see PRODUCT.md): new work needs no `sm`/`md`/`lg` variants, and the existing ones are inert above the floor.

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

## Motion

Motion reports state and keeps continuity. It is never decoration. A driver scrubbing a lap is reading traces, and anything that moves on its own competes with the playhead.

- **Feedback (100–150 ms):** color, border and opacity transitions on hover, press and selection (`transition-colors`, `transition-opacity`). Hover never scales, rotates or lifts a surface. Two exceptions: a chevron may nudge 2–4px toward where it leads, and a tiny target (a map marker or a sparkline dot) may grow to confirm it is under the pointer.
- **Enter (150 ms, ease-out):** overlays arrive with `animate-fade-in` (modals, scrims, full-screen views, inline banners). Anchored menus and popovers use `animate-pop-in`, a fade plus a 4px drop from their anchor. Keyframes live in `src/index.css` (`@theme`). Nothing animates out; a closing overlay unmounts.
- **Loops:** only while work is running: `animate-spin` on a busy control, `animate-pulse` on skeletons, loading text and the scan in progress. A live state such as ABS, TC, pit limiter, the selected corner or the car on the map is shown by fill, rim and position. It does not flash.
- **Content motion:** the playhead, the car on the map and chart updates move because the data moves. They are driven by playback (`requestAnimationFrame`), not by CSS.

### Named Rules
**The Still Wall Rule.** When the user is not acting and nothing is loading, nothing on screen moves except the data itself.

**The Reduced Motion Rule.** Under `prefers-reduced-motion: reduce`, a global rule in `src/index.css` makes transitions and enter animations instant and stops loops. A spinner keeps turning, slower, so running work still reads as running. JavaScript smooth scrolling checks the same media query.

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
A signature filter control (session type, car class, sort). It is a 36px `lmu-bg` well with a hairline border and 12px radius, holding 24px-tall monospace uppercase segments with a 5px radius. Red means the list is narrowed: a selected segment that filters is solid red with white text (session-type and car-class pills take their own chip look instead), while a selected "All" rests neutral (`lmu-raised` fill, `lmu-rule` hairline, white text; `SEGMENT_RESTING` / `SEGMENT_NARROWED` in `common/SessionTypePills.tsx`). On/off toggles (Hide Empty, Has Replay), the grid/table switch and the current page are neutral `lmu-raised` when on, never red. Unselected segments have a hairline and `lmu-faint` text at full opacity, brightening to white on hover (The No Dimmed Text Rule). Car-class pills keep their class color when selected; when off they fade to the class's `faded` step with a 30% border and no fill, and return to full color on hover. The ELMS corner fades with them.

### Session List (dashboard and track detail)
- **Toolbar** (`SessionFilterParts.tsx`): two rows. Row one finds and orders (search, track select, sort, view mode); row two narrows (class, session type, toggles) and ends with a neutral "Clear filters" that shows only while something narrows the list. Search focus moves the border to `lmu-muted`.
- **Session type colors** (`common/sessionTypeStyles.ts`), rising with the stakes: practice neutral (`lmu-raised` chip, muted dot), qualifying amber (`lmu-warn` tint), race red (the same tint as qualifying: `lmu-accent-deep` 60% fill, `lmu-accent-soft` text at 9:1, `lmu-accent` 70% border, so the race reads at least as strong as qualifying). Purple is never a session color: it means best lap and alien pace; gold stays with P1. The session chip (R1, Q1, P1, 34px minimum so names line up) and the dashboard hero's type tag use these; the type filter pills show the dot when off and the chip when chosen, so the filter doubles as the legend. Warm-up and other types stay neutral.
- **Rows and cards:** the best lap is white (gold is kept for P1); a race finish reads `P7 +3` with the gain in `lmu-gain`, a loss in `lmu-loss`, `±0` muted; an empty session is an amber-text chip on a rim with no row tint. Track names are plain white; the open chevron is muted until hover. Kept in color: car class, pace category and the telemetry source (amber 100 Hz, green replay).
- **Pagination** (`SessionPagination.tsx`): 25 per page, a hairline above, "1–25 of 219 sessions" in muted text with mono numbers, then prev/next and a page window (first, last, neighbours, ellipsis) in 28px mono steps.

### Benchmark Ladder
`common/BenchmarkLadder.tsx` is the one way the site shows a layout's benchmark pace, always under the circuit name (session header card, track header): six equal rungs in an `lmu-bg` well split by hairlines, Alien to Offline. Each rung has a dot and label in its pace category color (the label muted unless it is the current band), the target time in white mono and the percent in `lmu-faint`. The band the best lap falls in takes the category's tint fill and `aria-current`. No other tiles or grids for benchmark targets.

### Session Summary (session detail)
The circuit's benchmark ladder sits in the header card under the circuit name, as on the track page, with the best lap's band marked; the summary below is the session alone, anchored by the best lap: a 30px white mono time (personal-best gold when it is the personal best here) and its pace badge; the time is a button to the lap's telemetry, with a muted chevron that brightens on hover, as on the track title. Beside it, one six-column row of `SummaryStat` figures (true pace, average, spread, consistency, theoretical, clean laps): a 10px muted label, a white mono value, a muted hint, no boxes. The sector table spans both rows on the right. Color only for signals: gain for a sub-best potential and a very steady consistency, warn and loss when scattered, gold for P1 and laps led, gain or loss for places won or lost. The race result is a second row under a hairline on the same columns: the finish under the best lap, with starting position available in its tooltip rather than a duplicate hint, then places, peak, laps led, pit stops, incidents (with penalties as their hint) and track limits (warn when any) under the pace figures. The replay button is the dashboard's `common/ReplayLaunchButton` (amber tint "Launch 100Hz Replay" with DuckDB telemetry, green "Launch Replay" without); the other jump buttons (related session, rules) are neutral `lmu-card` buttons whose icon carries the only color (the session type dot). The header card reads as one meta line (session type chip, date, mode, duration, conditions as quiet text, a hue only for wet and rain) over the track title, which hovers without gold; a course or event line shows only when it adds to the title. Rules & Config and the driver picker sit on the right as one row of 32px controls (the picker a single `lmu-bg` well with a transparent select). The header, summary and debrief follow the page's panel pattern: 16px radius, 20px padding, a `text-sm` uppercase heading with a 16px icon over an `lmu-border/60` hairline.

Below the chart, the lap table and the classification. In the lap table the selected driver's session best lap is blue (`lmu-session-best` text and a subtle `lmu-session-best-strong/10` row tint), a personal best here gold (`lmu-personal-best`), with the personal best taking precedence; a sector best takes its sector color and says so to screen readers. Status icons are neutral for start, pit and out-laps, gain for valid, warn for incomplete. Track limits read by what they cost: neutral when cleared (No Further Action), warn for a warning, loss from 0.75 points (`utils/trackLimits.ts`). There is no separate stewards log: the heading carries the tally (incidents and penalties in loss, track limits in their worst severity) and each lap's expanded row holds the events; events no lap holds are listed under the tally. The table is titled just "Laps" with a muted count, and its columns come in three tiers: lap time (bold, `text-sm`) and pace (badge, left) lead; the gaps to session best and theoretical optimal each have a separate right-aligned 12px mono column (including the optimal gap on the best lap); the sectors come second in soft text at consistent 128px widths; status takes the spare width, and optional resource columns extend the horizontal scroll area; position sits between lap number and lap time so the race order reads first; tire and status come last, the compound circle keeping its color, tire wear in plain soft mono, fuel and virtual energy with their icons (warn-soft, aqua) and no emoji. Header buttons are neutral 32px (`lmu-card`, muted icon). The Laps title and actions share the first header row; one full-width second row combines the telemetry/event instruction and stewards tally. Chart headings are short: Lap trends, Class positions, Tire wear, and Fuel & energy; the metric controls provide the detail. Classification has a plain heading with a muted driver count and one instruction to select a driver. Safety uses independent compact badges, so penalties never hide contacts or track limits: amber for reported contacts (no blame inferred), neutral for cleared track limits, amber for warnings, rose for serious track limits and issued penalties; clean records have a quiet emerald check and label. Each badge has an accessible name and the full event tooltip remains available. The classification follows the session type: a race shows +/- and the time or gap to the winner; practice and qualifying drop +/- and show the gap of the best lap to the fastest (in class when multi-class). Your row is marked by a muted "(You)", never gold; red stays with the selected row. Rows of both tables take focus, open or select on Enter or Space, and show a 2px `lmu-accent` outline inside the row; sort headers carry `aria-sort`.

Session-best laps use Sky blue (`#75B9F5`, equivalent to `oklch(76.412151% 0.11091167 246.489047)`), in the lap table, with matching soft, strong and deep steps. The summary session-best time stays white. Personal best remains gold. Invalid and inferred lap times remain white and italic; inferred times keep their approximation marker. Pace badges never wrap, and the lap table reserves 176px for the pace column so Tail-ender and its percentage fit together.

In multiclass classification, every class uses its own position as the primary 14px bold white readout, with overall rank in parentheses beside it in muted 11px text on the same line, for example P2 (P12). Hide the overall rank when it matches the class rank. The tooltip and accessible label explain overall rank without repeating “Overall” in every row. This applies to Hypercar as well as GT3. The selected driver's finish keeps class first and overall secondary. Lap positions use a stronger 14px readout, with overall available in the tooltip; sorting laps by position follows the class positions shown.

Expanded lap details use a compact two-column debrief with 13px prose, 20px line height and sentence-case headings. Position changes and pit activity lead; recorded clocks align beside their event. One event uses a single horizontal row. Pace exclusions and conditions sit in a muted full-width footer, separated by one rule when events are present. Keep headings, traffic labels and event prose neutral. Places gained retain green emphasis; contacts, penalties, places lost and actionable track limits use small colored icons rather than colored paragraphs. Pit activity, conditions and multiclass traffic use muted icons. Track limits retain their actual severity, including neutral cleared reviews. Position changes describe the timing-line result independently of passing evidence. Recorded steward events show an 11px mono lap offset only when the start and duration establish it; otherwise show the recorded session clock. Missing times remain absent. Pit duration, estimated loss and likely repair wording stay explicit.

The sector card is vertically centered against the summary content. It spans the pace and race-result rows in a race; practice and qualifying use one row, without an empty second-row span.

The selected driver's finish uses a 24px extrabold mono position. In multiclass sessions, the muted 11px overall position sits to its right on the same baseline, with a 10px gap; class finish stays the dominant readout.

### Session-detail interactions and state
- The circuit title is a native React Router link with a visible focus outline; its destination keeps the player's car-class context.
- Chart legend labels are native toggle buttons. `aria-pressed` reports whether a series is visible; keyboard focus highlights a driver on the positions chart, matching hover.
- Rules & Config opens a body-mounted modal. Opening focuses the close control, makes background content inert and locks page scrolling. Tab stays within the dialog; Escape and backdrop click close it. Closing restores the original focus, background interaction and scrolling.
- Debrief analysis starts when requested. A polite status region announces comparison progress, completion and unavailable results; failed requests expose the server's message as an alert and offer Try again.
- Race metrics use the race context and available race fields. Absent optional fields do not turn practice into a race summary.
- Lap-table class ranks and expanded event sections are prepared once per session/driver change. Sorting and expansion reuse those entries. This preserves recorded chronological neighbours for position changes even while displayed rows are sorted.

### Status Pills & Badges
- **Style:** 4px radius, 2px × 8px padding, 10–12px bold label, the family's `strong` step at about 15–20% background with a 30% border and its `soft` or base step as text.
- **Lap status** (`LapStatusBadge`): pit stop is red, out lap is cyan, and valid or incomplete show as an icon plus label, with inferred and invalid told apart by icon and color. This is the canonical lap status presentation; reuse it rather than re-deriving it.
- **Ranked summary list** (`RankedList` in `dashboard/DashboardSummaryParts.tsx`): the first item is a headline: value first at the hero's 28px mono extrabold (`LEADER_VALUE`), then the name in white, then one muted detail line (the leader's share of your laps or distance, or the car and lap time); the Totals card uses the same three lines (figures, labels, session count) and the same row style below, so all four dividers align. The rest are quiet numbered rows (`lmu-faint` numbers, `lmu-text-soft` names and values). A "most driven" order is not a podium, so ranks take no gold, silver or bronze. A pace category shows as a small dot in its category color on the rows, and as its name in that color on the headline. The laps/km `UnitToggle` beside it is neutral: `lmu-raised` for the selected unit, muted for the other.
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
- **Focus:** the border shifts to Pit Lane Red (the session search field uses `lmu-muted`, since red there would read as a filter). A `focus-visible` ring is still owed (see Buttons).
- **Selects:** transparent inline selects with semibold white text, sitting inside a pill or toolbar well.

### Navigation
A sticky top bar: `lmu-card` at 75% opacity with a blur (the one sanctioned blur) and a hairline bottom border, laid out as a three-column grid with equal sides so the tabs sit on the page's true center line. On the left is the brand mark: a 40px red-tinted gauge tile (it deepens on hover; the wordmark never changes color) and the uppercase wordmark with "Lap Time" in red. In the center is a tab group in an inset `lmu-bg` well with a 12px radius; tabs are 32px, 14px medium with a 16px icon. The active tab is solid red with white text; inactive tabs are muted and lift to `lmu-raised/60` on hover. On the right are 32px status chips and the refresh button in the same inset well, muted, lifting to white with an `lmu-rule` border on hover (never red). The sessions dot is `lmu-gain` when LMU results exist and `lmu-warn` when none do; while a scan runs the film icon pulses and the refresh icon spins in `lmu-info`. A running refresh stays at full strength with a default cursor rather than fading.

### Telemetry Traces & Track Map (signature)
Recharts traces on the dark base use `CHART_COLORS.grid` (`lmu-border`) gridlines and `lmu-muted` axes; the session chart keeps horizontal gridlines only, a 2px trace with small unringed dots (the ring shows only on the hovered lap) and its average as a `lmu-muted` dashed line, and its view switch (Lap Pace, Sectors…) is a 32px well whose selected view rests neutral (`lmu-raised`), like the grid/table switch. Every series takes the hue it has elsewhere: sectors in `SECTOR_COLORS`, tyres in `WHEEL_CORNER_COLORS`, fuel and virtual energy as in the replay telemetry, averages as a thinner dashed line of their series (or `lmu-muted` when they average several). The positions chart draws you in red and the field in one thin `lmu-muted` line; hovering a legend name lifts that driver out in white. The legend lists you first, then measured series, then averages, and the tooltip marks each value with a short stroke of its line color over white text; legend labels are `lmu-text-soft` (the swatch carries the series color). Telemetry strip grid lines take the channel color dimmed, while their scale labels stay `lmu-muted` at full strength (`TelemetryStaticTrace`). Channels always use their `TELEMETRY_COLORS` hue (speed is sky, the baseline is amber, throttle is emerald, brake is red, steering is indigo). The 2D map draws the road surface and boundaries in `MAP_COLORS` line work, with racing lines colored by speed, pedal or lateral G. Monospace labels on the map obey the 10px floor.

### Tracks overview
Track outlines occupy a 128px square in a dedicated left column beside the title, session metadata and timing columns. Sector splits sit beneath the timing area in three equal, left-aligned columns; car inventory spans the card below it. The larger silhouette is the circuit's visual anchor without adding another panel or extra statistics.
The tracks toolbar sits directly on the page surface. Track cards retain circuit outlines and a single panel shell, with unboxed timing columns and one divider above the car inventory. Personal-best gold remains the primary timing signal; theoretical times use soft white, and sectors, pace and car classes retain their established semantic colors. Titles use 16px semibold text. Car inventory is a wrapping line of neutral 11px names rather than individually bordered chips. Repeated trophy decorations are omitted. Lap pace uses the same xs PaceBadge (icon, category, percentage) as the session summary, placed beside the personal-best time. A fixed 3:2 timing grid reserves space for the badge and aligns every theoretical-best column; the full BenchmarkLadder remains on track detail. A localized Last driven date sits below session/lap counts when the timestamp is available.

## Do's and Don'ts

Tracks hardening: cards are native links with visible keyboard focus and class-preserving destinations. Class filter buttons expose their pressed state. Benchmark loading and missing targets use a polite status region; failures show the API message and a retry button without hiding records. Pace sorting is disabled when no usable comparison exists. Empty sessions and missing lap or sector data use explicit text. Long circuit/car names wrap with automatic text direction. A sector sum slower than the recorded best carries an uncertainty explanation rather than silently changing the measured time.

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
- **Don't** loop an animation that is not waiting on work (no pulse or ping on chrome, badges or map markers), and don't scale, rotate or lift on hover (The Still Wall Rule).
