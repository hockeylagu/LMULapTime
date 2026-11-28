# 3D telemetry traces and steering force (plan, 2026-11-26)

The lap view's 3D scene shows any telemetry chart channel as a curtain standing on each lap's racing line, so the
driver sees a brake trace, the balance or the steering force where it happens on the road. Two new channels come with
it: the steering torque the car sends up the column, and the driver's own steering force worked out from the FFB.
Reference: a coaching tool shown in a 2026-11 video (the user pasted its transcript and three screenshots); this plan
keeps the ideas, in the app's own look.

**Start after the night release** (driver, 2026-11-26): the night work ([NIGHT_RELEASE](NIGHT_RELEASE.md)) finishes
first, since both change `lapLayer.ts` and `replayScene.ts`; this plan starts from a clean tree.

**Status 2026-11-28**: part 1 (steps 1–6) built, not committed; waiting on the driver's look and acceptance. Part 2 not started.
Changed in the look (driver, 2026-11-28): the channel is the fullscreen bottom trace's, with a **3D trace** button between its
channel dropdown and Zoom range (the toolbar Trace menu is gone; Throttle + Brake stands as one curtain with two edges), and
the height is the value, so it never follows the camera smoothly: 3 m from the car cameras and trackside, and from orbit and overhead a step of 3 / 10 / 30 / 100 m nearest 8 % of the view where the camera looks at the lap, with slack going down, named in the legend ("100 % at 30 m"). Heights that followed the camera's distance read as the value changing, and one fixed orbit height was unreadable from the air or towering close by (driver, 2026-11-28). Edges and cursor lines keep a pixel width at any distance.

Reviewed against the code 2026-11-26. Part 1 (steps 1–6) is the feature; part 2 (steering force on replay-only laps)
is research with its own gate and starts only after part 1 is accepted.

## What the reference does

- **3D traces, one at a time** (keys 1–6): Pedals (throttle green and brake red, each toggleable), Balance, RPM, Yaw rate,
  Tyres front, Tyres rear. Each lap draws a translucent curtain over its line: height = value, fill fading toward the
  road, top edge a thin line in the lap's colour (A blue, B orange). Heights stay low (one to two car heights at peak) so
  the whole lap reads from a high chase or top-down view. Balance: height = the size of the under/oversteer, fill
  coloured by which one, back to the ground line where the car is neutral.
- **Charts under the view**, on distance with one cursor: Speed, Throttle, Brake (ABS stretches highlighted), Steering
  (degrees), Gear, Gap, and optional Steering force, Balance, Yaw rate, Lateral g, Rotation, tyres front/rear/all four.
  The cursor readout shows A and B per chart (`-5.3 -8.7 N·m`, `19% 28% of FFB`).
- **Balance** = steering angle against the yaw rate it creates.
- **Steering force**: "only two things change the steering angle: the force feedback and the human"; knowing the
  angle and the FFB, the human's share is the rest. Read for: light hands (force rises while the angle barely moves,
  under trail braking), passive counter-steer (wheel at 0° or turned left while the driver still pushes right, the
  front tyres self-centring toward the car's slip angle), gripping the wheel too hard.

## What the app has already

- Lap A/B compare (lap and baseline), gap, distance cursor, and 25 chart channels in
  `src/components/replay/telemetry/channels/` (inputs, dynamics, powertrain, tyres), with their scales in
  `telemetryChartPathBuilders.ts` (`SCALAR_CHANNELS`) and their colours in `src/utils/themeColors.ts`
  (`TELEMETRY_COLORS`, `WHEEL_CORNER_COLORS`).
- Balance: `understeerDeg` (`computeUnderOversteer`, `src/utils/computedTelemetry.ts`): road-wheel angle minus the
  kinematic angle `wheelbase × yawRate / speed`, signed by the turn so understeer is positive whichever way the car
  turns, zero below 15 km/h or with steering and yaw both under 3, smoothed, clamped to ±15°, charted on ±8° by
  `TelemetryUndersteerChannel.tsx`. It is the reference's balance ("the steering angle versus the yaw rate it
  creates"), so no new channel. Two differences, closed in step 1 and step 3:
  - **The steering lock.** The road-wheel angle uses the plugin's default steering range and ratio
    (`resolveVehicleHandling`), else 540° / 11:1. A setup with another lock scales the whole balance line. DuckDB
    laps carry the run's lock (`VM_STEER_LOCK`), which step 1 reads; balance uses it for those laps. Replay-only
    laps keep the plugin default (a rival's setup is unknown).
  - **The look.** The chart draws a line (lap in the highlight colour, baseline dashed). The reference fills it by
    sign; the chart gets the curtain's fill (understeer sky above zero, oversteer amber below) under the lap's
    line, so chart and curtain read the same.
  - The neutral line is the kinematic one: a car's natural understeer at high lateral g shows as understeer too. The
    reference reads it the same way, by comparing two laps rather than against zero.
- The 3D racing line (`src/components/replay/view3d/laps/racingLine.ts`): a flat ribbon draped on the road, per-point
  colours, re-draped as scenery streams; `makeDataMesh` keeps data colours exact under auto exposure.
- The 3D view's keys: 1–8 pick the camera (`CAMERA_MODES`, `view3d/camera/cameraModes.tsx`) and 0 resets the zoom,
  so the digits are not free for traces.

## Data facts (checked 2026-11-26 on `Algarve International Circuit_Q_2026-11-25T20_54_14Z.duckdb`, GT3)

| DuckDB channel | Rate | Unit | Meaning |
|---|---|---|---|
| `Steering Shaft Torque` | 100 Hz | Nm | Car-side column torque (physics). −154…+135 Nm on that lap, mean abs 31 Nm |
| `FFB Output` | 100 Hz | % (±100) | The force sent to the wheel base after the game's FFB processing. Clipped at ±100 on 0.06 % of samples |
| `Steering Pos` | 100 Hz | % | Already read (`steerYaw`) |
| `TyresTempLeft/Centre/Right` | 100 Hz | °C | Surface temperatures; the reader takes `TyresTempCentre` |

- Shaft torque opposes the steering (opposite sign in 19,593 of 19,723 cornering samples above 60 km/h): it is the
  self-aligning torque. FFB follows it (r = 0.98) but not as a fixed gain: FFB % per Nm has median 0.93, p10 0.70,
  p90 1.04, so the game filters or shapes it.
- The steering lock of the run is in the file's `CarSetup` metadata (`VM_STEER_LOCK` = `524deg (18.5deg)`): wheel
  rotation and road-wheel lock, better than the plugin's default calibration.
- Wheel motion on that lap: up to 312°/s and about 7,300°/s².
- The reference's chart scale (±25 Nm) and readout (5.3 Nm = 19 %, 8.7 Nm = 28 %) do not fit shaft torque (0.93 %/Nm):
  its Nm are torque at the rim, which needs the driver's wheel base peak torque.
- Replays (`.Vcr`) carry no confirmed FFB or torque (`docs/analysis/VCR_ANALYSIS.md` §2.12 D lead, r = 0.92, not
  decoded). Steering force exists only for laps with DuckDB telemetry.
- The in-game FFB strength is not recorded (checked 2026-11-26): the DuckDB `metadata` keys are Version, DriverName,
  SteamID, RecordingTime, SessionTime, SessionType, TrackName, TrackLayout, WeatherConditions, CarName, CarClass and
  CarSetup, and `CarSetup` has no FFB entry. The game's `UserData/player/current controls.json` "Force Feedback"
  block holds only "Steering torque filter" and "Steering torque zero-speed mult", and it is today's setting, not the
  lap's. So the chart cannot tell two laps' settings apart; the channel's tooltip says % compares only at the same
  FFB setting.

## Steering force model

Percent only (driver, 2026-11-26): the trace is there to show how the driver forces through the steering without
changing the steering angle, and % of FFB peak shows that. No wheel base torque, no Nm, no setting.

Signs, said once: the raw `FFB Output` is right-positive like the game's steering. The reader stores
`ffbPct = −raw` (ISO 8855: positive turns the wheel left), as it stores steering. The driver's force is
`driverForcePct = −ffbPct` (positive: the driver pushes left): the force the driver holds against the FFB.

- Holding a steady angle the driver's force equals the FFB's, opposite in sign, so the trace follows the FFB, as the
  reference says it does. What it shows is force that rises or falls while the angle stays put (light hands under trail
  braking) and force held against the angle (passive counter-steer).
- Not modelled: the wheel's inertia and damping (the driver turning faster or slower than the FFB alone would move the
  wheel). They would need the base's peak torque to put into %, and they matter only while the wheel moves quickly.
- **% is per FFB setting.** `FFB Output` includes the driver's in-game FFB strength and the car's multiplier, so two
  laps compare only at the same setting. The strength is not recorded (data facts above), so the channel's tooltip
  says it.
- **Holding still** marker: the force changes by more than a dead band while the wheel angle moves less than about
  1°, over at least 0.1 s (steering-wheel degrees from `steer% × steeringWheelRangeDeg / 2 / 100`, the range from
  `VM_STEER_LOCK`, else the plugin default; not the 18.5° road-wheel lock).
- **Passive counter-steer** marker: steering angle and driver force of opposite sign, both past a small dead band, held
  for at least 0.1 s.
- **Thresholds come first.** `FFB Output` also carries kerb and road effects, so a raw dead band would fire on every
  kerb. Step 2 starts by measuring the force's noise on straights and over kerbs on the recorded lap; that sets the
  low-pass and both dead bands, and the values with their evidence go in the module comment. No marker ships on a
  guessed threshold.
- Both markers are deterministic, drawn on the steering force curtain and chart. Pure function in `shared/domain/`
  (input: steering %, FFB %, lock, rate; output: driver force % and the two markers), unit-tested on synthetic traces
  (steady hold, force ramp at a fixed angle, counter-steer, a kerb strike that must not mark) and a recorded lap.

## Curtains

- **Every chart channel can stand as a curtain**, one at a time, picked from the same channel list as the chart.
- **Colour: the chart's.** The lap's curtain takes the channel's chart colour (throttle green, brake red, steering
  indigo, yaw rate cyan, …) and the baseline lap's the colour the chart draws its baseline trace in. That colour is
  per channel, not one: most charts draw the baseline in `TELEMETRY_COLORS.baseline` (amber), throttle and brake in
  `baselineThrottle` / `baselineBrake`, and the balance chart draws the lap in `CHART_COLORS.playerHighlight` with the
  baseline dashed in `TELEMETRY_COLORS.understeer`, not by sign. So the step 5 table carries both colours per channel.
  **Balance is the exception (driver, 2026-11-26):** its curtain is filled by which way the car slides, understeer
  in `TELEMETRY_COLORS.understeer` (sky, `#38BDF8`) and oversteer in `TELEMETRY_COLORS.oversteer` (amber, `#F59E0B`),
  as the reference does; each lap's top edge stays in its lap colour. Oversteer's amber is also the baseline colour,
  so the look check confirms the baseline's top edge still reads over an oversteer fill. Delta keeps its chart
  colours unless the driver asks for gain / loss.
- **Height: the chart's scale.** A channel's chart range maps to 0–3 m (a car height and a half), the same for both
  laps, clamped where the chart clamps. A channel centred on zero (steering, lateral g, yaw rate, balance, slip
  angle, lateral offset, delta) stands by its size, since a curtain cannot go under the road; left or right reads
  from the corner itself, and the cursor readout keeps the sign.
- **Per-wheel channels** (tyre and brake temperatures, pressures, wear, wheel speeds, wheel slip, suspension): four
  top edges in the chart's wheel colours over one light fill under the highest; the baseline lap's edges at half
  opacity. To judge in the look check: if eight edges do not read, the picker offers front and rear pairs.
- Fill opacity about 0.35 at the top, 0 at the road; the top edge a solid line; no glow.
- Both laps' curtains stand on their own lines and overlap; the top edges carry the comparison. The minimap and HUD
  stay as they are.
- **On or off, in place of the racing line** (driver, 2026-11-26). The Trace menu's first entry is Off: the
  ribbons as today. Picking a channel replaces each lap's ribbon with its curtain, whose foot on the road is the
  line, so the two are never drawn together; Off brings the ribbons back with the Line menu's colouring. The pick is
  remembered, and hiding the lines in the Line menu hides the curtains too.
- A channel without data on a lap (steering force on a replay-only lap) shows a note in place of the curtain.

## Review constraints (external review, checked against the code 2026-11-26)

Each holds for the step named; they correct the sections above where they differ.

- **Served laps are spaced (steps 1, 2, 4).** The lap view asks for High by default (`pointSpacingM=2`,
  `telemetryResolution.ts`), and `replayTrajectoryService.ts` spaces the lap after the DuckDB fusion; only Full sends
  every sample. A 2 m spacing is about 7.5 points a second in a slow hairpin, wider than a 0.1 s marker, and picking
  raw `FFB Output` samples aliases kerb spikes. So the low-pass and both markers run on the full-rate DuckDB lap in
  the reader, before spacing: `driverForcePct` is stored filtered, and the markers are discrete flags the line cut
  and `selectFeatureSamples` keep. The pure function takes `timeSec[]`, not a fixed rate.
- **Setup lock is two values (step 1).** `VM_STEER_LOCK` `524deg (18.5deg)` is the steering-wheel range (524°) and
  the road-wheel lock (18.5°), so it sets both `steeringWheelRangeDeg` and `steeringRatio` (262 / 18.5 = 14.2) as one
  calibration (`handling.ts`: never half a calibration), with `steeringSource: 'setup'`. It rides on the DuckDB lap
  (kept in `telemetry_lap_cache` if the file goes) and through the fusion onto the trajectory, where
  `applyTelemetryPostProcessingToTrajectory` uses it.
- **Steering in degrees (step 3).** After post-processing `steerYaw` is ±270 chart degrees for every consumer. The
  degree option scales each lap by its own range, since lap and baseline can differ (setup 524° against a plugin
  540°); `TelemetrySteerChannel.tsx` is at 252 of 300 lines, so the degree helpers go in their own module.
- **`steerTorqueNm` (step 1).** Stored on the points for the replay fit and inspection; no chart or curtain of its
  own in this round. The one new channel is Steer force.
- **Channel table (step 5).** Ranges carry a minimum as well as a maximum (tyre pressures, temperatures, wear, ride
  height, gear do not start at 0). Steer force joins the presets (`handling`, `all-channels`) with a bump of
  `PRESETS_STORAGE_KEY`.
- **Balance chart text (step 3).** Its readout says Understeer in `text-lmu-warn` (amber) and Oversteer in
  `text-lmu-loss`; it changes with the fill to sky and amber.
- **Draw order (step 4).** `carObject.ts` numbers the ghost's parts from `renderOrder` 1, so it starts above the
  curtains (from 20). Every curtain, edge and cursor material goes through `hazeProgram` (`assertHazed` throws on a
  bare one). Edges and the cursor line are thin quads: WebGL line width is 1 px on Windows. The night look check
  also confirms a curtain neither blooms nor pulls the exposure meter down.
- **Picking (6a).** Lap geometry sits under the mirrored world (`world.scale.z = -1`), so the ray's z is mirrored as
  `carPick.ts` does. `surfaceWithin` reports an opaque surface inside the span: for a curtain (no depth write) −1
  over camera → hit means visible; for the flat line the span stops about 0.2 m short so the road under it does not
  count. One query in flight at a time. A hit on the baseline maps to the lap sample at the same lap distance before
  `onSelectIndex`, which indexes the lap.
- **Fullscreen (step 6).** The 3D toolbar is replaced by `GpsMapModeBar` when expanded, so the Trace menu goes in
  `GpsMapModeBar` (3D only, like the racing-line toggle); `HeatmapLegendBar` hides while a curtain shows.
- **Camera keys (6b).** `SceneShell.beforeFrame` holds one hook, used by playback: the held-key move runs in the rig's
  per-frame step, never through a second `beforeFrame`. The chart keeps `+ = -` when the 3D view has no focus and is
  not fullscreen (`CHART_KEYS`); `+`/`=` and `-`/`_` are one key on release, so Shift mid-hold cannot leave a key
  stuck. The lap and race 3D views share `cameraActions`, so both get it.
- **Placement.** The steering force module goes in `shared/domain/vehicles/` (`shared/domain/` is at 18 of 20
  files); the tooltip rows in `src/utils/` (`map/scene/` is at 20, `map/display/` at 19).
- **Format spec (step 1).** In `TELEMETRY_FORMAT.md` the `accelLonG`, `accelLatG`, `yawRateDeg` and `slipAngleDeg`
  rows still say replays compute them; cache v10 replays carry measured values, computed only for older rows.

## Steps (part 1)

Each step lands as its own commit with tests; lint, tests and build stay at zero warnings.

1. **Read the channels.** `Steering Shaft Torque` and `FFB Output` into the lap points (`steerTorqueNm`, `ffbPct`,
   ISO sign as above), and the lock from `CarSetup`. `server/telemetry/duckdbReader.ts` is at 893 of 1,000 lines, so
   the `CarSetup` parse and the two channels go in their own module beside it. `telemetryFusion.ts` carries them.
   Types in `shared/types/replay.ts`. The run's lock replaces the plugin default in the handling calibration of that
   lap (balance and steering degrees). Bump `DUCKDB_TELEMETRY_CACHE_VERSION` (the lap cache rebuilds from the DuckDB
   files on read; a lap whose file is gone keeps its old row without the fields). Look for the FFB strength in the
   metadata. In `docs/TELEMETRY_FORMAT.md`: both channels and their sign, and the `accelLatG` row, which still says
   replays compute it as `v · r / g` while `replayPose.ts` takes it from the measured acceleration.
2. **Steering force function**: thresholds measured first, then the function and its tests.
3. **Charts.** A Steer force channel (% of FFB peak; A/B readout at the cursor; holding-still and passive counter-steer
   shading), steering in degrees on the existing Steering chart's scale option, and the balance chart's fill by
   sign (understeer / oversteer). Under 300 lines per component.
4. **Curtain mesh** (`src/components/replay/view3d/laps/traceCurtain.ts`, new): one mesh per lap on the racing line's
   points and draped heights: a vertical strip per sample from the road to its height, gaps broken as the ribbon's,
   re-draped with the line. It has its own material, not `makeDataMesh` as it is: that one bakes one RGB colour for
   both vertices of a sample and pulls toward the camera with `polygonOffset`, right for a ribbon on the road and
   wrong for a standing sheet. The curtain needs a per-vertex alpha for the fade, no offset, depth test on and depth
   write off; it shares the exposure divide and the colour bake (split out of `racingLine.ts` for both). Draw order
   is fixed by `renderOrder`: lines, marks, baseline curtain, lap curtain, then the see-through ghost. `lapLayer.ts`
   owns the curtains next to the lines; only the hook-up touches `lapLayer.ts` and `replayScene.ts`. Checked
   2026-11-26: the scene's lap points are the chart's. `useReplayInspectorData.ts` runs
   `applyTelemetryPostProcessingToTrajectory` (→ `computeVehicleDynamics`) on the lap and the comparison lap, and
   `ReplayMapContainer.tsx` hands the same trajectories to `Replay3DView`. DuckDB laps come at 100 Hz; replay laps are
   stored at about 50 Hz.
5. **Channel values for the scene.** One table gives each chart channel its value, range and colour for both the chart
   paths and the curtain, so the two cannot drift (`SCALAR_CHANNELS` and the per-wheel builders are its start).
6. **Trace picker.** A Trace menu in the 3D toolbar beside the Line menu: Off (the racing lines) and the chart's
   channels in the chart's groups; a pick replaces the lines with curtains (Curtains above). No digit keys (the
   cameras have them); no new key in this round. Remembered per user.
6a. **Hover and click** (Hover and click above), on the curtains and the 3D racing lines.
6b. **Continuous camera keys** (Camera keys above): its own commit, can land before step 1.
6c. **Acceptance.** The 8-view look check (the small capture set) after step 4 and after the picker, with a night
   lap, a corner from a high chase view, the cockpit camera, both laps' curtains overlapping, and balance on a lap
   with real oversteer; the 3D bench before and after step 4; and one of the driver's own laps checked by the driver:
   light hands and passive counter-steer marked where the driver remembers them.
7. **Docs.** `CODE_MAP.md` (the new modules and setting), this plan retired into the code map once accepted.

## Around the curtains

- **Legend.** While a trace shows, a small legend in the 3D view's corner gives the channel's name, its scale (the
  value at full height and at the road) and its colours (balance: understeer / oversteer), so a curtain's height
  reads as a number without hovering.
- **Cursor on the curtain.** The playback cursor shows on each curtain as a thin vertical line from the road to the
  top edge at the car's sample (and the ghost's), like the chart's cursor line.
- **Driver cameras.** A 3 m curtain on the lap's own line stands in front of the Cockpit, Hood and Roof cameras (and
  close behind in Chase). In the driver cameras the curtains fade per fragment by distance to the camera (a shader
  uniform; `cars/ghostFade.ts` fades a whole material, which would hide the whole lap), out within about 30 m, so the
  view ahead stays clear and the trace still shows further down the road. Chase sits 7.8 m behind the car, so a 30 m
  cut would hide the curtain at and ahead of the car: Chase gets a shorter fade (about 10 m), tuned in the look check.
- **Corner focus.** Curtains stay on in corner focus; the driving marks (brake, turn-in, slowest point, throttle-on
  stripes) stay on the road at the curtain's foot and read through the fill.
- **Night.** Curtains are unlit data like the lines, so they keep their colours at night; the look check includes a
  night lap to confirm they do not glare against the dark scene.
- **Scope.** The lap view's 3D scene only. The race replay's 3D view and the 2D map stay as they are.

## Hover and click (driver, 2026-11-26)

Hovering a curtain shows a tooltip as hovering the racing line does on the 2D map, and clicking it moves the cursor
there. The 3D view has no line hover today: the 2D one is `GpsTrackSegments.tsx` (nearest vertex of the hovered
run) with `GpsTrackHoverTooltip.tsx` (speed, delta to the baseline, throttle, brake, distance; a ring on the point),
and a click selects that point (`onSelectIndex`).

- **Same content, plus the trace.** The 2D tooltip's rows, and the picked channel's value at that point for the lap
  and, at the same lap distance, the baseline, in the chart's units and colours (balance with its under / oversteer
  word). The rows come from one function both tooltips call, so they cannot drift; the 3D one is a DOM overlay at the
  point's screen position, not SVG.
- **Which lap.** Hovering the baseline's curtain names the baseline lap first. Where both curtains overlap under the
  pointer, the nearer one wins.
- **The pick.** The curtain's own geometry is a sheet per lap with one quad per sample: the pointer's ray
  (`SceneShell.pointerRay`) is tested against the quads, nearest hit first, giving the sample index. Scenery in front
  hides it: the hit is kept only if `surfaceWithin` finds no nearer surface on that stretch of the ray, as the race
  view's car hover does (`race/carPick.ts`). The quads sit in a coarse per-50 m grid so a move tests a few hundred, not
  the whole lap; at most one pick per frame.
- **The racing line too.** With the Trace menu on Off, the same pick runs on the ribbons (a flat quad per sample), so
  the 3D lines get the 2D tooltip as well.
- **Click** sets the cursor to that sample (`onSelectIndex`), as on the 2D map; a drag that orbits the camera is not a
  click.
- **Where:** `laps/tracePick.ts` (pure: quads, grid, ray test; tested with a synthetic lap and ray) and a small
  `laps/TraceHoverTooltip.tsx` overlay; under 300 lines each.

## Performance

A single-value curtain is two vertices per sample, as the ribbon; a per-wheel one four edges more. Drawn once per
lap, transparent, no shadow. The scene gets the lap at the chart's resolution: by default High, a point every 2 m
(about 5,000 vertices on a 5 km lap, 13,600 at Le Mans); Full sends every sample (24,000 for a 2 minute DuckDB lap
at 100 Hz). Check with the small capture set and the 3D bench before and after
step 4, including a view through both curtains at a corner.

## Part 2: steering force from a replay (no DuckDB)

A replay carries no FFB or torque, but it carries, for every car, what makes the torque: lateral g (`accelLatG`,
measured), yaw rate, speed and steering (cache v10). The self-aligning torque is the front tyres' lateral force times
their trail, and the trail shrinks as the front tyres pass their grip peak, so:

`ffbPct ≈ −a_y × (c₁ + c₂ × max(0, 1 − u⁺ / u₀))` (ISO sign; `driverForcePct = −ffbPct`), with `u⁺ = max(0, u)`,
`u = δ − L·r / v` the understeer angle the app already computes (not β, which the format spec keeps for body
sideslip) and `u₀ ≈ 0.05 rad`. Only understeer shrinks the front trail: with `|u|`, a rear slide would falsely
collapse it. The fit also tries the front axle's slip angle from the measured `velocityLat`, `velocityLon` and yaw
rate (cache v10) in place of `u⁺`.

First fit (2026-11-26, Algarve Q, GT3, 100 Hz, above 15 m/s). Its lateral g came from DuckDB `G Force Long` (10 Hz),
not from a replay, so it shows the model can work, not that the replay's channels are enough:

| Model | R² against `FFB Output` | Error (RMS, % of FFB) |
|---|---|---|
| Steering angle only | 0.53 | 25 |
| Lateral g only | 0.90 | 12 |
| Lateral g + trail term above | 0.93 | 10 |

- `c₁`, `c₂` are per car **and** per FFB setting: FFB % includes the driver's in-game FFB strength. They are fitted
  offline from the driver's own laps that have both a replay and DuckDB telemetry (any car without such laps has no
  estimate); nothing is fitted at runtime. A changed FFB strength makes them stale: the fit is run again, and the
  stored row keeps its fit date and the DuckDB files it came from.
- The same coefficients apply to every car of that model in a replay, so rivals' laps get "what that lap would have
  felt like on your wheel": the comparison the DuckDB path cannot give (DuckDB holds only the player's car).
- Labelled estimated in the chart and the 3D picker; a lap with DuckDB always uses the measured FFB.
- **The tool** (`tools/analysis/fitSteeringForce.ts`) opens the cache DB read-only, pairs the driver's DuckDB laps
  with their replay laps, fits from the replay's own channels at the replay's sample rate, runs the gate and prints
  the result. Only with `--write`, and the server stopped, does it open the DB for writing and store the passing
  cars in a `steering_force_fit` table (car key, `c₁`, `c₂`, R², fit date, source files; DDL in `dbSchema.ts`).
  The driver's own data, so not in app source. Read and written through a store module under `server/core/`.
- **Gate**, on held-out laps (other sessions, at least two tracks and two classes), all from replay inputs: R² ≥ 0.85
  and the holding-still and passive counter-steer markers agree
  with the measured ones on most of their samples. The 10 % error is the size of the moments the markers look for, so
  the markers are checked first. The rate is enough: stored replay laps run at about 50 Hz (8 laps of 104–342 s, 49.6–50.0
  samples a second, 2026-11-26), so a 0.1 s marker spans 5 samples, provided it is computed on the stored lap
before the served lap is spaced (see Review constraints). If the gate fails, part 2 is dropped and only DuckDB laps show steering force.
