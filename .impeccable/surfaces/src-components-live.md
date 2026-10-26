---
version: 1
slug: "src-components-live"
primary_target: "src/components/live"
related_targets: ["src/components/live/LivePage.tsx"]
---

# Live dashboard (`#/live`)

## Scope and mode

The second-screen page read while driving: `src/components/live/`, routed at `#/live`, opened by itself when LMU
starts. Mode: **Operate, read-only.** The visitor's task is to take one fact in a glance between corners and look
back at the road. It is a display, not an app: success is that the driver never has to touch it, search it or read
it twice.

## Audience and scene

- The driver in the seat, hands on the wheel, eyes on the game. The page sits on a second 27-inch 2560 x 1440
  monitor at 50 inches (1.3 m) or more, off to the side of the main screen.
- A glance lasts well under a second, usually on a straight. Peripheral vision catches colour and position change
  before the text is read, so where a value sits and its colour carry as much as its digits.
- Dim sim-rig room, dark UI only (PRODUCT.md).

## Job

Advice only: pit lap, VE or fuel to set, tyre call, damage pace loss beside repair time, lap and sector timing,
the pedal trace. The driver sets everything in the game; the page never asks for a decision on itself and never
claims what it cannot measure (unknown is `—`, estimates are `~` or labelled `EST.` / `GAME ESTIMATE`).

## Interaction contract

- **No input while a session is loaded.** No buttons, toggles, menus, hover-only content, scrolling, tabs or
  pagination. The page changes state by itself from the game's lifecycle (waiting, menu, loading, garage, grid,
  driving, finished) and the session kind (race vs practice, qualifying, warmup).
- The only controls are exits. The `LMU` wordmark (back to `#/dashboard`) is the one exit present in every state,
  driving included; it looks like the wordmark and only reacts on hover. While LMU is closed (`WAITING FOR LMU`)
  nobody is driving, so a visible exit is fine there: `OPEN THE DASHBOARD` is that screen's button. Once LMU is
  running, add no other exit or control. Peripheral status is a passive chip, never a launch or apply
  action.
- Preferences (pedal trace length and similar) live in the app's Settings, not on this page.
- `title` tooltips are developer aids only; nothing the driver needs may live in one.
- `?demo` renders the same view from sample data for checking states off the car. Demo-only controls (the strategy
  voice proof of concept) stay out of the production view.

## Stage and layout

- A fixed **2560 x 1440 stage** (`LiveFrame`) designed in its own pixels and scaled uniformly to fit the window,
  centred on `lmu-bg`. All sizes below are stage pixels. This page does not follow the app's 1500px column or its
  10–12px type scale.
- Stage padding 56px sides, 28px top and bottom; 20px between bands.
- Three bands, top to bottom:
  1. **Session bar**, 88px, 48px semibold, hairline below. Left: red bar + `LMU`, session kind, layout (muted), class
     badge (zoomed 2.75x), race place. Right: one fixed 520px weather slot, laps left, PR, data status (`LIVE`,
     `CONNECTING`, `DISCONNECTED`, `NO REC`). During significant race damage the **damage row** (184px, `lmu-loss`
     15% tint with a 2px inset rim) takes this band's place and keeps the data status.
  2. **The state**, flexible height: the big state title, the garage checklist and race strategy, the practice
     timing, the race plan or the session result.
  3. **Pedal trace**, 294px, full width, hairline above, on track only.
- **Race columns** (`raceColumns.ts`): one grid for every race row, a 1.5fr lead then three equal columns with 34px
  gutters and `lmu-rule` dividers, so labels and values line up from the plan down to the damage row and the garage
  checklist.
- **Nothing moves.** Every slot is held at its width and height for the whole session and shows `—` until its
  value arrives. Labels, value and note lines keep fixed heights; empty history rows are held invisible; values use
  `min-w-[Nch]` mono boxes; a zero delta holds an invisible `+`. A glance must find a value exactly where it was
  last time.

## Type for distance

- Same fonts as the app (Segoe UI, Consolas). Figures are always mono and bold with negative tracking
  (−0.025 to −0.04em); labels are sans, uppercase, semibold, in `lmu-text-soft` or `lmu-muted`.
- Scale, in stage pixels, at 1.3 m on a 27-inch 1440p panel (≈0.23 mm per pixel):

  | Role | Size | Where |
  |---|---|---|
  | Lead figure | 180–200px | race action (pit countdown, per-lap use), estimated lap (182), preparation laps |
  | State title | 120–164px | `WAITING FOR LMU`, `GARAGE`, result title (164 alone, 120 above a checklist) |
  | Figure | 80–120px | race cells, checklist values, practice delta/best, history cells (80) |
  | Word in a figure slot | 68–104px | `CALCULATING`, `THIS LAP`, `NEW MED`: words step down so the slot keeps its width |
  | Note / unit | 56–64px | units after figures, state notes, preparation line |
  | Label | 44–48px | readout labels, column heads, session bar |
  | Small | 32–40px | detail lines, strategy basis, sector-delta caption; **32px is the floor** |

- One lead per screen. The lead figure is the page's `h1` while driving a race; every other value is visibly
  smaller.
- Words that would take a figure's size are set smaller (`/[A-Z]{2}/` test) rather than wrapping or truncating; long
  action words step down again (72px past nine characters).

## Colour

- The app's tokens and the Signal Rule (DESIGN.md) apply unchanged, with a narrower vocabulary:
  `lmu-gain` good / gained / set correctly, `lmu-loss` lost / change it / damage, `lmu-warn` warning or uncertain
  (`CONNECTING`, `NO REC`, provisional result), `lmu-blue` wet weather and forecast, `lmu-muted` waiting and
  unknown. Red `lmu-accent` is only the brand bar and the chosen race strategy's 2px border.
- Tyre compounds take their sidewall colour on the word only: soft white, medium `lmu-warn`, hard `lmu-loss`, wet
  `lmu-blue` (`CompoundText`).
- Colour never stands alone: every coloured value also carries its sign, word or label, so it reads in a glance and
  for colour-blind drivers.
- Surfaces stay flat: `lmu-bg` page, `lmu-card` for the lap in progress and the strategy card, `lmu-border`
  hairlines between bands and rows. No shadows, glows or gradients.

## Motion

- Values change in place; nothing animates in, slides, pulses or flashes. An alert is a colour and a band (the
  damage row), never a blink, which would pull the eye off the road.
- Only two things update between snapshots: the running lap clock (ticks in tenths, monotonic within a lap) and the
  pedal trace (canvas, 6px lines, throttle and brake from `TELEMETRY_COLORS` on a fixed 0–100% grid; a gap over
  0.25 s breaks the line). Everything else follows the snapshot stream.

## Content priority

Pit and finish instructions and the pedal trace outrank detail. Practice leads with the estimated lap, then delta
and session best (laps left in qualifying), then the history (lap in progress, last two laps, best row; only the
newest lap gets sector deltas). A race leads with one action readout and three supporting cells, over a history
that drops to one completed lap while damage shows. Detailed analysis belongs after driving.

## Don't

- Don't add any control, hover state or tooltip-only content to the driving states (the `LMU` wordmark exit is the
  one standing exception).
- Don't set anything on this page below 32px, or a figure in a proportional font.
- Don't let a value appear, disappear or change width as data arrives: hold the slot and show `—`.
- Don't show a second lead, a chart other than the pedal trace, or a table longer than the history.
- Don't animate state changes or flash alerts.
- Don't reuse the analysis pages' 1500px column, small type or panels-in-panels here.

## Unresolved

- Seat check still pending: read every state from the seat at 50+ inches on the 27-inch display, including pit
  instructions, class-relevant fuel/VE targets, the full-width pedal trace, and the wet-track and online forecast
  states (docs/plans/README.md, Live dashboard and learning).
