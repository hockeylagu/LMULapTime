# Corner comparison rework

Status: plan, 2026-10-02, cleaned up before implementation. Supersedes the stale `corners-definitions` branch
(216f40e, hand-written corners for 6 layouts), which stays as prior art only.

Every decision taken so far is written into the text where it applies, and listed once in §15. Questions that still
need an answer before or during the work are in §17.

## 1. What we have today

Entry point: `computeLapSegmentComparisons(primary, baseline)` in `src/utils/cornerAnalysis/segmentComparisons.ts`
(529 lines). It is used by the inspector (`ReplayInspectorContent.tsx`), the session debrief
(`loadSessionDebrief.ts`), the leaderboard/rival debrief (`loadLapDebrief.ts`), corner consistency
(`cornerConsistency.ts`) and the AI payload.

How it works:

1. It finds corners from the **primary lap's speed trace**: speed max → min → max, plus steering reversals for linked
   corners. T1, T2… are the dips in lap order.
2. The windows are in the primary lap's driven distance. The baseline is moved into that frame by track station, so a
   window covers the same physical stretch for both laps. That part is right.
3. Every value is read at a **primary-lap event**: the baseline's "min speed" is its speed at the primary's apex, the
   rotation and entry phases end at the primary's turn-in point, and corner angle and radius come from the primary's
   line.
4. It runs on the client, on the points the inspector loaded (2 m or 4 m apart).

### Coverage against the driver checklist

| Phase | Item | Today | Notes |
|---|---|---|---|
| Entry | Brake point | ✅ both laps | Brake ≥ 10 %. Given as distance into the window, not against a track marker |
| | Brake pressure | ❌ | Brake pedal % is in the data. No peak or average |
| | Brake shape | ❌ | No time to peak, hold time or release profile |
| | ABS | ⚠️ | `absActive` is decoded per sample and drawn on the pedal trace. Not counted per corner |
| | Trail braking | ⚠️ primary only | Brake ≥ 5 % and steering ≥ 5°. No baseline value, so nothing to compare |
| | Entry speed | ⚠️ | Read at the primary's speed peak, not at a fixed point |
| | Position on track | ⚠️ | Lateral offset at the window start only, not at the brake point or turn-in |
| | Gear selection | ❌ | `gear` is in the data. Not used |
| | Steering (turn-in) | ⚠️ | Turn-in point (5°) for both laps. No turn-in rate |
| Apex | Apex point | ❌ | Primary's speed minimum only. The baseline never gets its own apex |
| | Rotation | ✅ | Peak yaw rate for both laps, plus how much of the turn is done at 15 % throttle |
| | Minimum speed | ❌ **biased** | Baseline speed is read at the primary's apex distance, which is at or above its real minimum |
| | Steering mid-corner | ⚠️ | Steering scrub (understeer) for the primary only. No corrections or held angle |
| | Lat/lon G | ❌ | `accelLatG`/`accelLonG` exist. Not used in corners |
| | Throttle hesitation | ❌ | Mid-corner throttle dabs and pumping are in the data. Not detected |
| Exit | Throttle shape | ⚠️ | First 15 % and the 90 % hold point. No ramp rate, no lifts |
| | TC | ⚠️ | Only a yes/no "wheel slip on exit" (TC, slip > 12 % or lock) for the primary lap |
| | Coasting / pedal overlap | ❌ | Time with neither pedal, or both pedals, is not measured |
| | Track usage | ✅ both laps | Track-out offset and space left |
| | Acceleration | ❌ | No exit longitudinal G or speed gained |
| | Exit speed | ⚠️ | Read at the primary's next speed peak, not at a fixed point |
| | Steering unwind | ❌ | |
| Racing line | Width used | ⚠️ | Space left at 3 points only, against a fixed nominal width (12 m default). The real local width from the boundaries is not used |
| | Line shape | ❌ | No driven-path radius, no V/U shape, no early/late line apex |
| | Apex distance (gap to the inside edge) | ❌ **wrong** | `apexSpaceLeftM` = half-width − \|offset\|. It is read at the speed minimum, not at the closest point. It uses the size of the offset, not its side, so a car 5 m out on the **outside** shows as 1 m from the inside kerb. The half-width grows to fit the car's own offset, so it rarely goes negative. The baseline is read at the primary's apex distance |
| | Where the lines differ | ❌ | The two lines are never compared along the corner |
| Overall | Time delta | ✅ | Segments add up to the lap delta. Phase splits use the primary's events |
| | Corner type | ❌ | Angle, radius and direction come from the primary's line. No hairpin, chicane or sweeper label |

### The reference problem (the blocker)

The corner set depends on which lap is the primary:

- **Corners move.** Change the primary lap and the windows move, T-numbers can shift by one (a small corner below the
  6 km/h prominence threshold drops out), and a flat-out kink is not a corner at all.
- **Corner numbers are not stable across features.** Consistency builds its corners from one reference lap, and the
  stored debrief keys by `cornerNumber`. A debrief built against another lap can name a different T3.
- **The baseline is measured at the primary's events.** If the baseline driver apexes 10 m earlier, we report its speed
  10 m after its real apex and call it "min speed". The early or late apex, which is often the most useful thing to
  tell the driver, cannot be seen.
- **Swapping the laps does not mirror the result.** Primary vs baseline should equal minus (baseline vs primary). Today
  it does not.

## 2. Principles (decided)

1. **No information is better than bad information.** Every value that can come out wrong (a corner type, a
   sub-apex, a line label, a reference from too few laps) has a gate. Below the gate it is left out with a short
   reason, never shown as a guess. A feature that cannot pass its gate ships later, and only if it is worth it.
2. **Source data is trusted; everything we compute must be proven.** The channels as LMU records them (speed,
   pedals, gear, steering, ABS/TC flags, positions, temperatures, DuckDB channels) are taken as they are. Everything
   the app computes or interprets from them is not: a metric, a shape or line label, a cause, a tip. Each one ships
   only with a passing validation (§9). One that cannot pass is **not built**: not stored, not hidden behind a flag,
   not sent to the AI. It goes on the rejected list (§9) with the reason.
   - This includes the channels the app derives for replay laps (`src/utils/computedTelemetry.ts`): G-forces from
     speed and heading, yaw rate, body slip angle, understeer, tyre slip and wheel lock. They use one wheelbase
     (2.7 m) and one steering ratio (11:1) for every car, so understeer, for example, is a model output. Each derived
     channel is validated before a corner metric may read it (G against the DuckDB accelerations of the same lap).
3. **A corner belongs to the layout and the car class, not to a lap.** Every lap is measured on its own against the
   same corner map, and a comparison is the difference of two independent measurements.
4. **A corner runs from its braking zone to the next corner's braking zone.** It owns its brake zone, the rotation,
   the exit, and the straight that follows, where the exit is paid for. There are no separate straight segments.
   Braking depends on the car (a Hypercar brakes later than a GT3, a kink can be flat for one class and a lift for
   another), so **segments are per class**, while the **corner and its number are per layout** (C3 is C3 for every class).
5. **Naming.** Our corners are **C1, C2…**, numbered in lap order from the track shape, the same for every class. A
   segment carries the number of the corner whose braking zone opens it. A corner that is flat for a class keeps its
   number but opens no segment for that class (GT3 can show C4, C5, C6 where Hypercar shows C4, C6). **T** is kept
   for the official turn numbers, which can differ (one C corner can hold T4 and T5). Official numbers are not needed
   to ship. When added, each is pinned to a station in the per-layout override file and shown next to the C label
   ("C4 · T4–T5 · Variante della Roggia"). Never guessed.
6. **Generated for every layout, no fallback.** Every layout with a track geometry file gets its complete corner map
   from that file and the class profile, without a single driven lap (§3). Driven laps never move a segment; they
   only add the quick-lap references once there are enough. There is one code path: no zones from the two compared
   laps, no corners from one lap's speed dips, nothing to maintain per circuit.
7. **Every recorded sample, never downsampled.** Every corner measurement runs on all the samples of the lap's own
   best source: the replay at ~50 Hz (stored in full in `replay_trajectories`, 49.9 Hz measured over 43,090 laps),
   or the DuckDB telemetry at 100 Hz. The 2 m display points and the display downsampler are for drawing only.
8. **Two levels of data.** A comparison with another driver's lap uses the **replay data for both laps** (its
   channels and its ~50 Hz rate), so both are measured the same way, even when the player's lap also has DuckDB
   telemetry. The same holds for two of the player's own laps when only one has telemetry. The player's own laps with DuckDB telemetry also get a **self-analysis** level (100 Hz, 4-corner brake
   pressure, more wheel and tyre channels), shown only on their own laps and their own consistency, and added only
   where it tells the driver something the replay level cannot.
9. **Deterministic, same class, same layout.** All metrics, labels and rankings are deterministic; AI only writes the
   sentence. Comparisons stay in one car class (`mapVehicleIdToClass`). Nothing is shared between layouts of one
   venue (AGENTS.md §4A): maps are keyed by `getCircuitSpecification(...).layoutKey`.
10. **No new metric cache.** Corner metrics are computed on demand from the cached full-rate trajectory (§4.1).
11. **AI laps never count** for anything built from other drivers' laps (references, class profile).
12. **One useful answer first.** The first driver-facing release answers where time was lost, whether it carried onto
    the run, and which measured event differed. The full metric catalogue is a candidate backlog, not a release gate.
    The main debrief leads with the time loss and first measured difference. Once coaching passes its own gate, it
    adds one repeatable action; traces and detailed metrics remain available as evidence.

```
track geometry file ──► CornerGeometry (per layoutKey: corners C1…, apex, direction, width)     ┐
class profile (committed) ──► speed-profile model ──► segments, gates, types (layout, class)   ┴─► CornerMap (generated, fingerprinted)
fastest human laps ──► quick-lap references (layout, class, major patch), only when there are enough ──► optional layer, never moves segments
                                                                                                   │
lap A samples ──► measureLapCorners(A, map) ──► CornerLapMetrics[] ─┐                              │
lap B samples ──► measureLapCorners(B, map) ──► CornerLapMetrics[] ─┴─► compareCorners(A, B) ──► CornerComparison[]
```

## 3. Corner map

### 3.1 Three layers

| Layer | Key | Source | Holds | Changes only when |
|---|---|---|---|---|
| Geometry | `layoutKey` | `public/tracks/<layoutKey>.json` (2D centerline and edges, no elevation) | Corner ids and numbers, `apexRefM`, direction, angle, radius, `subApexes?`, width profile, edge quality | The geometry file or the detection code changes |
| Segments and phase gates | `layoutKey` + class | Geometry + class profile, through the speed-profile model (§3.4) | `zoneStartM`, `turnInRefM`, `fullThrottleRefM`, flat or not, `type?`, flat-corner windows, the segment list | The map's fingerprint changes (§3.7). Never because of new laps or a new patch |
| Quick-lap references | `layoutKey` + class + major patch | The 40 fastest clean human laps (§3.6) | `quickBrakeM`, `quickTurnInM`, `quickFullThrottleM`, quick-lap minimum speed, G envelope per corner, RPM per car model where it has enough laps | New laps on that major patch (rebuilt freely: nothing depends on them staying fixed) |

The first two layers are pure functions of committed files and code: the map is identical on every machine and does
not drift as the cache grows. They are computed at server start and kept in memory. Only the references are stored
(`corner_references` table: layoutKey, class, major patch, lap and driver counts, JSON).

### 3.2 Geometry

- Corners are found from the centerline **curvature** (heading change per metre, smoothed). This finds kinks and flat
  corners that speed dips miss, and gives the same answer for every lap. A corner is a curvature peak whose heading
  change is at least `CORNER_MIN_ANGLE_DEG` (15° to start), after smoothing over `CURVATURE_SMOOTH_M` (20 m); two
  peaks in the same direction closer than `CORNER_MERGE_M` (40 m) are one corner. The validation gate (§3.5) checks
  that no real speed dip is missed. Changing these values changes the maps' fingerprints.

| Field | Meaning |
|---|---|
| `id` | Key, e.g. `spa_gp:c07`. Stable while the layout's geometry and detection are unchanged; stored outputs also record the map fingerprint (§3.7) |
| `label` | `C7`, the corner number from the track shape, the same for every class. Official `T` numbers and names come from the override file, pinned to a station |
| `apexRefM` | Geometric apex = curvature peak |
| `direction`, `angleDeg`, `radiusM` | Track geometry, not taken from any lap |
| `subApexes?` | Only when the geometry gate passes: two or more strong curvature peaks inside one segment (opposite directions for a chicane, the same for a double apex) |
| width profile | Distance from the centerline to each edge every 2 m of station, from `leftBoundary`/`rightBoundary` (not symmetric in a corner) |
| edge quality | `measured` or `estimated`, from the line precision check (§6), per layout |

- **Chicanes and sub-apexes are a nice-to-have, not v1.** Until their gate passes (curvature peak, separation and
  direction thresholds, tested on the sign-off tracks), a chicane is one C segment with one braking zone and its own
  times and metrics, which is already correct. When the gate passes, each sub-apex gets its own window for its own
  apex, line apex and minimum speed: from the midpoint with the previous geometric apex to the midpoint with the
  next one (the same rule as a flat corner's window, §3.4).
- **Geometry quality (decided).** Each part of the geometry is checked automatically against
  the laps, and only the parts that pass are used:
  - **Centerline shape** (curvature, corners, segments): checked through the model's validation gate (§3.5), which
    compares the segments with where humans really brake and lift. A wrong curvature shows up there as a failure.
  - **Edges** (width, distance to the kerb): checked per layout by the line precision check (§6). A layout whose
    edges fail it is marked `estimated` and gets no edge-based line metric. The metrics that need no edges (the
    driven path shape, where two lines split, the gap between them) still work.
  - An updated layout geometry file uses the same validation rules.
- **Override file** `server/data/corners/<layoutKey>.json`: official T numbers and names only, pinned to stations.
  It never moves a segment or a gate; a wrong segment is fixed in the model (principle 6).

### 3.3 Class profile

One entry per class in `server/data/corners/classProfiles.json`: lateral grip against speed, braking deceleration
against speed, acceleration against speed, top speed.

- Built by `tools/analysis/buildClassProfiles.ts` from that class's clean human laps on every layout, then
  committed. This is car capability, not layout data: no corner, zone, reference or time of one layout is used on
  another, so the layout rule holds.
- Grip, braking and acceleration are the **envelope** of the fast laps (the 95th percentile per speed band), not
  their median, so before the wet factor and the margin the model brakes no earlier than the fast drivers.
- It reads the derived G channels, so those channels pass their validation first (principle 2).
- **Tested on tracks it was not built from**: the validation gate (§3.5) also runs with each layout left out of the
  profile, and must pass on the left-out layout. That tests generalisation, but the generated map on a new layout
  remains provisional until its own checks pass (§3.5).
- Regenerating it is a code change; it changes the fingerprints of that class's maps only (§3.7).
- A class with no profile yet has no map: its laps show "no class profile for <class> yet". A class LMU adds later
  gets its profile from the same tool once it has been driven (§12).

### 3.4 Segments from the speed-profile model

A deterministic quasi-static point-mass model on the centerline, per class:

1. **Corner speed limit** along the track: the speed where v² / R(s) equals the class's lateral grip at that speed,
   with R the smoothed centerline radius. The racing line has a larger radius; the model only has to be consistent
   and conservative, not exact.
2. **Forward pass** with the class acceleration and top speed, **backward pass** with its braking. The result is a
   model speed trace with a braking onset before each corner, the corners that need no braking or lift, and the point
   where the car is back on full acceleration.
3. **`zoneStartM`** = the braking onset computed with **wet** braking (dry deceleration × `WET_BRAKING_FACTOR`),
   minus a fixed margin (30 m to start). Dry, wet and slower drivers then all start braking inside their own
   segment, so there is no wet map and no wet buffer. Starting earlier only lengthens the previous corner's run
   phase, which costs nothing.
4. **`turnInRefM`** = where the centerline curvature starts to build before the apex; **`apexRefM`** = the curvature
   peak; **`fullThrottleRefM`** = where the model is back on full acceleration.
5. **Gate order** is enforced: `zoneStart < turnIn < apex ≤ fullThrottle ≤ nextZoneStart`. When the margin would put
   a zone start before the previous corner's `fullThrottleRefM`, it is clamped to it. In esses or the Porsche Curves
   the model may never get back to full acceleration before the next braking: `fullThrottleRefM` is then the next
   `zoneStartM`, and the run phase is empty, shown as "no full throttle before the next corner". The builder reports
   every clamp, and a clamped zone that humans brake before is a model failure like any other (§3.5).
6. **Flat corner** for this class = the model needs no braking or lift. It keeps its number, opens no segment for
   this class, and gets its own **window** inside the segment that holds it: from halfway between its apex and the
   previous corner's apex to halfway to the next corner's apex. Its minimum speed, speed-minimum station, line and grip used are
   measured in that window. This is in v1.
7. **`type?`** (per class): `hairpin` · `slow` · `medium` · `fast-sweeper` · `kink`, from the angle, the radius and
   this class's model corner speed (a "medium" corner for GT3 can be a fast sweeper for Hypercar). `chicane` ·
   `esses` only with sub-apexes (§3.2). Left out when its validation does not pass.
8. The **segments** are the zones in lap order: the segment of corner N runs from its `zoneStartM` to the next braked
   corner's `zoneStartM`.
9. **The start/finish straight is cut at the line.** The lap starts and ends there, so the last corner's run ends at
   the finish line, and the lap opens with a **Start** segment (line → C1 zone). The speed at the line comes from the
   last corner's exit (on the previous lap); the Start segment shows it and links back to the last corner, so a slow
   last exit is not blamed on the next lap. A zone that starts before the line (a corner right after it) is cut the
   same way, with stations wrapping past the lap length (same handling as `lapLineCut.ts`). That case is built when a
   layout first needs it; the builder flags any zone that starts before the line.

The gates are **cut points, not targets**. They only need to be in order and the same for both laps. Where the driver
actually brakes, apexes and gets on the throttle is measured on each lap (§4.3).

### 3.5 The model's validation gate

Before the model ships, `measureCornerMaps.ts` checks it on every (layout, class) that has human laps. It needs the
full local cache, so it runs there, not in CI; CI runs it on a small committed fixture set as a regression (§13). The current
cache has 47 layout/class pairs in the session logs; at most 33 reach 40 laps from 5 drivers (an upper bound, since
not every lap has a stored trace), and 13 have only the player. Per pair:

- ≥ 99 % of the human **braking onsets** (brake > 10 %) fall after `zoneStartM`. For a corner taken with a lift and
  no brake, the lift onset (throttle < 90 % after the lap's own full throttle on the previous exit) counts instead.
  A lift-and-coast before braking (§8) is not an onset and is left out, so race laps do not fail the check.
- the flat-corner calls match the laps (fewer than 20 % of them brake or lift there, lift-and-coast left out)
- no speed dip over 6 km/h falls outside a corner
- wet laps, where they exist, also start braking after `zoneStartM` (checks `WET_BRAKING_FACTOR`)
- the same results with each layout left out of the class profile (§3.3)

A failure is fixed in the model, the profile or the margin (a code change, which changes the affected maps'
fingerprints), never by moving one map at runtime.

**Quality is per (layout, class), not inherited from the sign-off tracks.** A generated map must first pass structural
checks (ordered gates, complete lap coverage, monotonic projected stations and segment times summing to the lap).
Until at least 20 eligible clean human laps across at least two sessions exist for that (layout, class), and each
non-flat corner has observed brake or lift onsets, its status is `provisional`: show C locations and segment/phase
times with that label, but withhold precise brake markers, quick-lap comparisons and ranked corner coaching. If a
structural check fails, show no corner analysis for that pair. If a human-data check fails, mark the map `failed` and
keep only the structurally verified timing with an explicit map-quality warning; do not rank tips from its gates.
Passing on another layout, including a sign-off track, never upgrades this pair.

After shipping, the same check runs on each new session. When a zone is braked before by more than 1 % of recent
human laps (a new car or a BoP change), Settings shows it for that layout and class, to be fixed in the model. The map is
never changed silently.

### 3.6 Quick-lap references

Per layout, class and **major patch**:

1. Take the **fastest** clean flying laps of that class (dry, no traffic spell, no tow on a run, no off track) from **human drivers
   only**: the 40 fastest, at most 5 per driver, from at least 5 drivers, so one quick driver does not set every
   reference. Human is decided by `isHumanDriver` (`shared/domain/leaderboard.ts`: the player, or anyone in an online
   session), which needs the replay's linked session. A driver in a replay without a linked session counts as
   unknown and is left out.
2. Per corner, the medians of those laps' own events: `quickBrakeM` (brake or lift onset), `quickTurnInM`,
   `quickFullThrottleM`, and the quick-lap minimum speed and G envelope. A lap's events are then also given against
   them as **context**, not instructions: "you brake 18 m before the quick laps". The reference is a class-wide
   mixture of car models, fuel loads, tyres and track states; its median is not automatically the right target for
   this car or stint. Show the sample count and car-model mix with the readout. Do not derive a practice target or
   estimated time gain from the class median alone.
   - **RPM is per car model**, never per class: a class mixes cars that rev very differently (a 9,000 rpm Porsche
     and a 7,000 rpm car are both GT3). The RPM range at each apex and the shift RPM are kept for a car model when it
     has at least 10 of the reference laps from at least 3 drivers; otherwise only the player's own laps in that car
     give them (§8).
3. Below the threshold the references are **absent**, not estimated: "quick-lap reference: 12 of 40 laps". Only the
   readouts that need them are hidden.
4. **Patch.** Each lap's LMU game version comes from its session (`gameVersion` in the results XML; for a replay,
   from its linked session, otherwise unknown). Five patches are in the current data (1.3, 1.4, 1.413, 1.415, 1.42).
   The parser stores it as a number today, so `1.4` and `1.40` collapse: it is kept as **text** from the XML
   (a parser fix with a `DB_PARSER_VERSION` bump).
   - References are keyed by the **major patch** (1.3, 1.4, 1.5…, the first two numbers: `1.42` → `1.4`). Minor
     updates within a major (1.4, 1.413, 1.415, 1.42) share one set; each lap still records its full version.
   - A new major starts **empty**. The previous major's references are not shown on it, only "waiting for 1.5 laps
     (12 of 40)": a major usually changes BoP and physics, and old references would be bad information.
5. Rebuilt on a worker when a scan adds laps for that (layout, class, major patch). Dry only: a wet lap is not set against
   them.

### 3.7 Stability and versions

- Each (layout, class) map has a **fingerprint**: a hash of its corners, segments and gates. It changes only when
  that map really changes: a new geometry file for the layout, a code change to detection or the model that moves
  its gates, or a new profile for its class. New laps, patches and references never change it.
- Stored debriefs, AI reports and progress series record the fingerprint, so a change on one layout or one class
  restarts only that map's series, not every map. `CORNER_MAP_VERSION` stays as a label for the code; it is not the
  key.
- Each metric definition carries its own version (§9), so a change to one metric marks a break only in that
  metric's history. With no metric cache, nothing is invalidated.

### 3.8 Layouts without geometry

`circuitDefinitions.ts` defines 32 layouts; 21 have a geometry file. A layout without one has no corner map. Its laps
get odometer stations and no lateral offset (`serverTrackSync.ts`), so the corner analysis checks for the geometry,
not just for stations, and shows "no track geometry for this layout yet". The lap's own speed and pedal traces stay
available. The fix is to build the geometry (§12). A DuckDB lap without a replay has no track position either, so it
gets no corner analysis ("no replay for this lap").

### 3.9 Validation tool

`tools/analysis/measureCornerMaps.ts [layoutKey]`, per layout and class:
- the generated segments, types and gates, also drawn on the track map for a visual check
- structural and human-data gate results, the current `provisional` / `validated` / `failed` state (§3.5), and every
  gate-order clamp
- lap and driver counts per major patch, and whether the reference threshold is reached
- the leave-one-layout-out result of the class profile
- corners without a steering peak in the laps

## 4. Measuring a lap

### 4.1 Where it runs

- `CornerLapMetrics` is computed **on the server, on demand**, from the full-rate trajectory already cached in
  `replay_trajectories`, or from the DuckDB telemetry. DuckDB laps are placed on the track through their linked
  replay (`server/telemetry/telemetryFusion.ts`).
- It is **not stored**: the trajectory is the source of truth, and measuring a lap is cheap next to decoding it.
  Changing a metric is a code change only: no table, no invalidation, no recompute job.
- `GET /api/replays/:name/corners?slot=&lap=` serves one lap; a batch form serves a session, consistency or a
  progress query. Batches run on a worker, so the event loop stays free. The client only compares and displays.
- Phase 2 measures the cost per lap and per progress query. A cache comes back only if a real screen is too slow, as
  its own decision.
- A test checks that the measurement code refuses display points (a lap from the 2 m endpoint).
  `measureLapDensity.ts` reports how far the 2 m display traces are from the measured values, so the display never
  contradicts a number.

### 4.2 Contracts and code layout

- `CornerGeometry`, `CornerMap`, `CornerLapMetrics`, `CornerComparison` and the metric definitions go in
  `shared/types/corners.ts`.
- The pure code goes in `shared/domain/corners/`, split by subject: `map/`, `measure/`, `line/`, `pedals/`,
  `compare/`, each under 20 files, every file under 1,000 lines. The server measures and the client compares with
  the same copy. Components stay under 300 lines.
- Every threshold is a named constant in one `shared/domain/corners/thresholds.ts` (the values in §16).

### 4.3 Events and phases

- Every event is the lap's **own** event, in station, and also given against the corner's markers: "brakes 112 m
  before the geometric apex marker", "speed minimum 9 m after the marker".
- **Stations** come from projecting every full-rate sample onto the centerline (`enrichTrajectoryWithTrackGeometry`,
  which today only runs when a trajectory is served); the measurement projects the full-rate points itself. Stations
  are computed data: they are checked by segment times adding up to the XML lap time and by stations increasing
  through the lap (§9).
- **Speed minimum** = the lowest speed in a bounded window around this corner's `apexRefM`, never the minimum over
  the entire brake-zone-to-brake-zone segment. For a flat corner, use its own window (§3.4); for a braked corner,
  start at the midpoint from the previous geometric apex and end at the midpoint to the next, intersected with this
  corner's segment. If the window is empty, contains a sample gap above the validated limit, or the lowest point is
  at its boundary with a continuing decrease, mark the event unavailable rather than assigning a neighbouring
  corner's slowdown to this one. `speedMinimumOffsetM` = its station − `apexRefM` (negative = early). The value is
  the lap's actual minimum **within that window**.
- **Line apex** = the closest approach to the inside of the corner (§6). The UI always says "speed minimum" or
  "line apex"; it does not use the unqualified word "apex" for either lap event.
- **Phase times**, cut at the map's gates (the same for both laps): **braking** = `zoneStartM` → `turnInRefM`,
  **rotation** = `turnInRefM` → `apexRefM`, **exit** = `apexRefM` → `fullThrottleRefM`, **run** =
  `fullThrottleRefM` → next `zoneStartM`. Phase times add up to the segment time, and the segments add up to the lap.
  The braking phase starts at the conservative zone start, so it usually holds some full throttle before the lap's
  own brake point: the gate is a cut point, and the lap's own brake-on is the event to read.
- **Flags per segment**: off track, traffic spell (`sessionDebrief.spellCoversCorner`), tow, contact, wet, braked
  before the zone.
- The full list of what is measured per phase is the catalogue (§9); the line and pedal metrics are described in §6
  and §7.

## 5. Comparing two laps (`compareCorners(a, b)`)

- A field-by-field difference of two `CornerLapMetrics` for the same corner `id`. It has no idea which lap is the
  primary. Invariant: `compare(a, b) === −compare(b, a)` for every delta, with identical windows.
- Events are compared on the shared marker axis: "you brake 14 m earlier, reach minimum speed 9 m later, and hit full throttle
  0.2 s later".
- **Sign convention**: **+ = lap A's value is larger than lap B's** (more time, more speed, a later station), in a
  table next to the types.
- **Only time is coloured** (green = less time). Every other value stays neutral: a higher minimum speed, a later
  brake point or an earlier speed minimum is not good or bad by itself (a V line carries less minimum speed on purpose and
  can be faster), and the time next to it says whether it paid off. Today's apex-space green/amber goes away.
- **"Same" band** per metric comes from measurement resolution alone (brake in 64 steps; roughly ±3 m for a brake
  point at 50 Hz and 200 km/h). Both compared laps are at the replay level (principle 8), so they share one
  resolution. A difference inside that band shows as "same". The player's lap-to-lap spread is displayed separately
  as **consistency** and informs confidence and coaching rank; it never widens "same" or hides a measured difference.
- **Channels**: each metric records its source channels. A comparison shows only the metrics both laps have, and says
  what is missing for the rival instead of showing a zero.
- **Steering across car models**: steering ratio and lock differ within a class. Raw angles are compared only for the
  same car model; across models, steering is a share of the lap's own peak lock, and rates and corrections are
  compared rather than angles.
- **Fairness flags**: different car model or major patch, traffic, tow. The TC setting and BoP are not in the data;
  a lap with much more TC activity is shown as such, not judged. Wet laps are compared only
  with wet laps (AGENTS.md §4B).

## 6. Racing line

What the driver sees on the map ("the fast car uses another shape, or more of the track") breaks down into five
measurable things, all read at the corner map's stations.

**Track position.** Each sample's `lateralOffsetM` and the width profile (§3.2) give a position from 0 (left edge) to
1 (right edge) and a distance to the inside and the outside edge. Kerbs show as position < 0 or > 1; the off-track
flag stays the authority for leaving the track. The inside is the side the corner turns to (track geometry).

**Precision first, per layout, automatic.** The edges are of mixed quality (§3.2) and their error is not known
yet. `isOffTrack` is a status bit recorded in the replay (source data), so it can measure it: on every lap of a
layout, where the flag switches on is compared with the edge plus the car half-width (1.0 m per class to start).
The spread of that gap, per corner, gives the real noise of edge-based metrics and calibrates the half-width. A
layout passes when the spread is under the "more track" threshold (0.5 m) in its corners; it is then `measured`,
otherwise `estimated` (§3.2). The check reruns when laps are added, so a layout can pass later.

The metrics split in two:
- **Need edges** (only on `measured` layouts): track position 0–1, distance to an edge, width used, apex distance,
  kerb use, time near the inside edge.
- **Need no edges** (every layout with a geometry file and a usable map): driven path radius and shape index, line apex station
  (from the closest approach to the inside, measured as lateral offset, compared between laps on the same
  centerline), where two lines split and their gap, path length.

1. **Track used** (per lap)
   - Distance to the outside edge at the lap's own turn-in, to the inside edge at its own line apex, and to the
     outside edge at its track-out
   - Width used = (max − min track position across the corner) × local width, in metres and as % of what was there
   - Kerb use: metres beyond an edge, and how far beyond
2. **Apex distance: the gap between the line and the inside edge**
   - The signed distance from the car's edge to the **inside** edge (centre gap − half the car width), all along the
     corner. The **line apex** is the station of the smallest gap; the apex distance is that gap. 0 = inside wheels on
     the edge line, negative = over the kerb by that much. Never the size of the offset with the side thrown away.
   - On an `estimated` layout there is no apex distance; the line apex is then the station of the largest lateral
     offset toward the inside, and two laps are compared by their offsets there ("0.8 m further inside").
   - Readout: "Apex: 0.3 m from the inside · baseline 1.4 m → you use 1.1 m more of the inside", plus "over the kerb
     by 0.6 m" when negative and a track-limit warning when the off-track flag is set.
   - Time spent within 0.5 m of the inside edge (a long clip vs touching it for one point).
   - Line apex vs speed minimum, both against `apexRefM`: "line apex 12 m later than the marker and 6 m later than the
     baseline". An early line apex that forces a lift or runs wide on exit is the classic mistake.
   - Replaces `apexSpaceLeftM`/`apexSpaceDeltaM`. The same signed rule applies to the turn-in and track-out gaps
     (outside edge).
3. **Line shape** (from the driven path in x/z, not the centerline)
   - Path radius along the corner, with the tightest radius and where it is
   - Shape index = share of the heading change done in the tightest 30 % of the corner. High = **V line** (brake
     straight, rotate hard, straighten early). Low = **U line** (one long radius that carries speed). Between the two
     thresholds: no label.
   - Radius in the last third before the track-out (a wider exit radius allows an earlier full throttle)
   - Path length through the segment
4. **Where the lines split** (comparison only)
   - Signed lateral gap between the two lines along the corner
   - **Split point**: the first station where the gap goes over 1 m and stays there for 20 m ("moves to the outside
     60 m earlier")
   - Largest gap and its station, and where the lines rejoin
5. **Line vs time** (evidence, not blame)
   - Next to each line difference, what happens at the same station: minimum speed, full-throttle point, exit speed,
     speed at the next zone. "Exit radius 18 % wider → full throttle 22 m earlier → +6 km/h at the next zone".
   - Labelled as observed together, not as cause and effect. A line difference enters the coaching ranking only when
     the gain repeats on the driver's other laps.

**Across laps** (consistency): spread of the line apex station and of the track position at the apex and track-out.
A line that wanders by 1.5 m at the apex is the first thing to fix.

**UI**: a corner close-up map with both lines on the real edges (`useTrackBoundaryGeometry`), coloured by speed
delta, with the split point, line apexes and track-outs marked; a track position strip (0–1 against station, both
laps); a short readout: "Uses 1.8 m more track on exit · line apex 6 m later · U line vs V line".

## 7. Pedal inputs

The pedal traces show how the driver works the car; their *shape* is often the difference between two laps with the
same brake point. Replay pedals: throttle 8-bit, brake 64 steps, ABS and TC flags in the same byte (`VCR_FORMAT.md`).

**Brake shape** (the lap's own brake zone: from brake-on ≥ 10 % to zero)
- **Attack**: time from brake-on to 90 % of peak, and the rate (% per 0.1 s). A slow build wastes the part of the zone
  with the most speed and downforce.
- **Peak**: highest brake %, and how long it is held within 10 % of the peak.
- **Release**: time from leaving the peak to zero, and its shape: a steady bleed, a step (a drop of 40 % or more in
  0.1 s), or in stages. Plus the brake % at turn-in and at the speed minimum.
- **Shape label**: `classic` (fast attack, hold, smooth release into the apex), `late peak`, `stab` (short peak,
  quick drop, often a second press), `coast-in` (released well before turn-in, no trail braking).
- **Re-applications**: drops below 50 % of peak followed by a climb. More than one usually means a misjudged brake
  point.
- **Straight-line braking**: time braking before steering (from today's `straightBrakingDistM`).
- **Trail braking**: distance and time with brake ≥ 5 % and steering ≥ 5°.

**ABS**
- Time and distance with ABS active, as % of the brake zone, and where it starts (at the peak = on or over the limit;
  in the release = locking the inside wheel with steering on)
- Brake % when ABS first fires: "you hit ABS at 85 %, the baseline brakes at 80 % without it"
- ABS during trail braking counted on its own
- A car without ABS shows **wheel lock** instead (`wheelLockActive`, a derived channel), with the same fields

**Downshifts**
- Count, the station of each against the geometric apex marker, and the gear at the speed minimum
- **Late or missing downshift**: the last downshift lands after turn-in, or the RPM at the apex is below the range
  for that car model (§8)
- Downshift blips are **not** analysed: many cars blip automatically, and the data cannot tell who did it

**Mid-corner throttle hesitation** (from turn-in to full throttle; this is what "blip" meant)
- **Dabs**: short on-off pulses (a rise over 10 %, then a drop over 10 % within 0.5 s) before the driver commits.
  Count, the largest, and where against the apex marker.
- **Hesitation time**: from the first pick-up to the commit to the final ramp.
- **Pumping**: a part-throttle plateau that wobbles (several reversals over 5 %).
- Readout: "2 throttle dabs mid-corner, 0.6 s hesitating · baseline: one clean pick-up". Shown next to the early apex,
  understeer or rotation signs it often goes with (§11), not as a score on its own.

**Throttle shape** (from the speed minimum to the segment end)
- **Pick-up**: first 15 %, and the throttle % at the speed minimum (maintenance throttle while rotating)
- **Ramp**: time and rate from 15 % to 90 %, and its shape: `progressive`, `stepped` (holds a part throttle, then
  goes up), `snap` (0 → 90 % in under 0.2 s)
- **Lifts**: drops of more than 20 % after pick-up, with depth and duration (a too-early throttle or an early apex)
- **Full throttle**: the 90 % point held 0.4 s, and the share of the exit at full throttle
- **Overlap**: time with both pedals over 10 %, leaving out short overlaps around a downshift (automatic blips)

**TC and slip**
- Time and distance with TC active on exit, share of the exit, throttle % when it first fires
- TC during the ramp (pushing into the slip) vs at full throttle (can be the setup)
- Rear wheel slip peak (`tireSlipPct`, derived), so a car with TC off is still covered
- The TC setting is not in the data: much more TC activity than the rival is shown, not judged

**Coasting and transitions**
- **Coasting**: brake < 5 % and throttle < 10 % between release and pick-up. Short is normal; long is lost time
  waiting for the car to turn.
- **Brake-to-throttle**: time from brake at 0 % to throttle at 15 %

These enter the coaching ranking only when they repeat on the driver's laps in the same conditions.

## 8. Run phase and context

- **Run phase**: top speed and where it is reached, time from full throttle to top speed, upshift stations and RPM
  against that car model's shift RPM (§3.6), limiter time, short shifts, any lift on the straight.
- **Lift-and-coast**: a throttle release more than 0.5 s before brake-on. In a race it is usually fuel or energy
  saving: labelled "lift-and-coast (saving)" when the session is a race, and kept out of the braking metrics, the
  model check (§3.5) and the coaching ranking (see §17 for showing its cost).
- **Slipstream**: a car within ~30 m ahead on the run (5 Hz traffic index, `server/traffic/`) flags the run "with
  tow", so top speed and run time are not compared as if the air were clean.
- **Elevation**: gradient through the braking zone (downhill braking is longer), crest or compression at the apex
  (Eau Rouge, the Mulsanne kink). The geometry files have no elevation, so it comes from the lap's own height `y`
  (source data). Context for the coach, not a score.
- **Gear range**: the RPM spread at the apex for that corner and **car model**: from the player's own laps in that
  car, and from the references when that model has enough laps (§3.6). The vehicle catalog has no gear or engine
  data. Absent when neither exists.

## 9. Metric catalogue and validation

**The catalogue is data.** Each metric is a definition: id, version, phase, unit, source channels, resolution,
"same" band, useful difference, level (replay or telemetry), and its **validation**. Only time has a good direction
(§5). The UI, the ranking and the AI read
the definitions, so only validated metrics exist for them. Adding a metric = one definition, one measure function, its
validation; changing one bumps its own version. A metric a lap's data cannot give is **unavailable** with the missing
channel, never 0.

**What a metric needs to pass** (all four, recorded in its definition):
1. **Known answer**: synthetic laps with a known result (a 0.25 s brake attack measures 0.25 s within the resolution;
   a constant-radius arc gives a shape index of 0.30).
2. **Properties**: units and bounds, swap symmetry, and no change when the lap starts one sample later.
3. **Real laps**: on the sign-off laps, the value matches the trace or the map (checked by the driver), or an
   independent source where one exists: segment times add up to the XML lap time; stations increase through the
   lap; off-track metres against `isOffTrack`; replay G against DuckDB G; apex distance against the off-track flag.
4. **Repeatability**: on the driver's own consistent laps (one session, same conditions), the lap-to-lap measurement
   noise is below the metric's predeclared useful difference (for example 5 m for a brake point). A metric noisier
   than what it reports is rejected. Driver variability beyond measurement noise is retained as a separate
   consistency signal, not used to call distinct measurements "same".

Labels and interpretations (shape labels, V/U, over-driving signs, causes, tips) pass the same checks, with the
driver's sign-off as the real-lap check. One the driver disagrees with is reworked or rejected.

**Rejected** (with the reason): none yet.

**Candidates** (per corner and lap; built only when they pass):

| Group | Metrics | Source channels |
|---|---|---|
| Timing | Segment time; time per phase; time at each gate; path length; mean speed | `timeSec`, stations |
| Speed | At each gate; minimum and where; maximum on the run and where; speed gained apex → segment end; speed at the S/F line (Start segment) | `speedKmh` |
| Braking | Brake-on station, against the marker and `quickBrakeM`; peak; attack; hold; release time and shape; re-applications; brake at turn-in and apex; trail time and distance; brake "energy" (∫ brake % dt); peak and mean deceleration; deceleration per brake % | `brake`, `accelLonG` |
| ABS / lock | ABS time, distance, share of zone, brake % at first fire, ABS while trailing; lock time per event; inside-front lock | `absActive`, `wheelLockActive`, `wheelSpeeds` |
| Gears and engine | Entry gear, minimum gear, downshift count and stations, upshift stations and RPM, RPM at apex, limiter time, short shifts | `gear`, `engineRpm` |
| Steering | Turn-in station and rate (°/s over 0.3 s); peak angle and share of lock; angle at apex; held angle; corrections; reversals; unwind rate and station (below 25 % of peak); steering work (∫ \|steer\| ds) | `steerYaw` |
| Throttle | Pick-up station; % at apex; dabs; hesitation time; pumping; ramp time, rate and shape; lifts; full-throttle station and share; overlap with brake; coasting; brake-to-throttle; lift-and-coast | `throttle`, `brake` |
| Traction | TC time, distance, share of exit, throttle % at first fire; peak and mean rear slip; wheelspin events | `tcActive`, `tireSlipPct`, `wheelSpeeds` |
| Vehicle dynamics | Peak and mean lat G, lon G, combined G; share of the G envelope; yaw rate peak and at apex; body slip angle; understeer peak, mean and ∫; oversteer events (`handlingBalance/evidence.ts`); pitch and roll at braking and apex (`rotX`/`rotZ`); minimum ride height (bottoming) | `accel*G`, `yawRateDeg`, `slipAngleDeg`, `understeerDeg`, `rot*`, `rideHeight` |
| Racing line | Track position and edge gaps at each gate; line apex station and gap; width used; kerb metres and depth; off-track metres; path radius (min, at exit); shape index; split point, largest gap, rejoin point | `lateralOffsetM`, `x`/`z`, width profile, `isOffTrack` |
| Tyres | Temperatures at zone start and segment end, and the rise (4 wheels); pressures; wear used in the corner; compound; tyre age (laps on the set) | `tireTemps`, `tirePressures`, `tireWear`, `tireCompoundIndices` |
| Brakes thermal | Temperature at zone start, peak, rise (4 wheels) | `brakeTemps` |
| Energy | Fuel and virtual energy used per segment; SoC change; regen in the zone; deployment on exit and run; peak regen rate | `fuel`, `virtualEnergy`, `soc`, `regenRate` |
| Elevation | Gradient through the zone; crest or compression at the apex; height change | `y`, centerline |
| Context | Track and ambient temperature; rain; wet or dry; patch; car model and class; session type; fuel at lap start; damage change (`detachablePartState`); pit limiter | `trackTemp`, `ambientTemp`, `rainIntensity`, session |
| Flags | Traffic spell; tow; contact; off track; braked before the zone; wet | traffic index, contacts, `isOffTrack` |
| Quality | Sample count and rate; largest gap between samples; channel availability; map and metric versions | — |
| Telemetry level (own laps) | 4-corner brake pressure and front/rear balance as driven; 100 Hz pedal and steering shapes; damper deflection; per-wheel speed and slip; further channels in the lap's `channelsList` (`TELEMETRY_FORMAT.md`) | DuckDB |

## 10. Corner type changes which metrics come first

| Type | Lead with | Less important |
|---|---|---|
| Hairpin | Brake point and release, rotation at throttle, V line and exit radius, speed at the next zone | Peak lat G |
| Slow/medium | Trail braking, speed minimum and line apex vs marker, throttle ramp | |
| Fast sweeper | Minimum speed, lift or brake tap, combined-G use, steering corrections, U line and width used | Brake shape |
| Kink | Flat or not, lift duration, minimum speed | Most entry metrics |
| Chicane / esses (when gated) | Segment time first, the line through the first part, exit of the last part | Exit speed of the first part |

The deterministic coaching ranking (`priority = estimatedTimeLoss × repeatability × confidence`) is unchanged. It gets
more evidence, plus this type weighting. A corner without a validated type gets no weighting.

## 11. Coaching layer

A coach answers five questions before telling a driver to change something. Everything here is deterministic; AI only
writes the sentence. (Which one the debrief leads with: §17.)

**1. Where is the time, and is it worth it**
- **Corner-level best lap**: the driver's best time through each segment across the session (clean laps, same
  conditions), summed into a theoretical best. Gap per corner = this lap − own best.
- **Two kinds of gap**: *this lap − own best* is a **consistency** gap (already done once); *own best − rival* is a
  **technique** gap (never done). Different advice; the debrief says which.
- **The straight is in the corner**: the run phase carries the exit's cost. "C3: 0.08 s lost through the corner,
  0.21 s on the run to C4".
- **Entry vs exit trade-off**: phase deltas side by side. "+0.05 s on entry, −0.12 s on exit → brake a little earlier
  and get on the throttle sooner".

**2. Why**
- **Linked corners**: a corner whose entry is set up by the previous exit is judged as a pair. A loss in C5 that starts
  with a late line apex in C4 points to C4.
- **First difference**: the first station where a measurement leaves the driver's normal range (line split, brake
  point, lift). It is a candidate explanation; what follows may be an effect, but the advice needs repeatable time
  evidence before treating it as a cause.
- **Over-driving signs** together: steering corrections, understeer, long ABS, TC on the ramp, a tyre temperature
  spike. Several at once means "slow down to go faster".

**3. Can I take it**
- **Grip used**: combined G against the envelope at that speed: the driver's own best laps, and the class envelope
  from the references when they exist. Well below = room left; at the envelope = the time has to come from the line.
- **Hit rate**: how often the driver reaches the target across the session's laps ("7 out of 12 laps").
- **Risk cost**: off-track, track-limit and contact events at that corner, so a faster technique that went off 3
  times in 10 is shown with that cost, especially in a race.

**4. Is it me or the car**
- Same class (enforced), plus flags for a different car model or major patch (BoP is not in the data).
- **Hypercar energy**: SoC, virtual energy and regen at the exit; an exit speed difference can be deployment.
- **Car state**: tyre age, temperatures and pressures, fuel load, brake temperatures ("your fronts were 12 °C
  colder").
- **Balance pattern**: the same phase problem in every corner of one type is probably the setup. It becomes a setup
  note for the AI garage report instead of a driving tip.
- **Conditions and traffic**: wet against wet; a traffic spell disqualifies the lap for that corner.

**5. What to practise next**
- **One focus per session**: the top item of the ranking, as a target the driver can feel. Derive the target from
  the driver's own comparable clean laps in the same car and conditions when a change repeatedly saved time:
  "C3: on your quicker exits you braked near 95 m before the marker; try to repeat that on 8 of 10 laps".
  A rival or class reference supports the diagnosis but cannot set a target or an estimated gain by itself. If the
  driver's laps do not establish a repeatable gain, show the observation without a prescriptive target.
- **Best reference per corner**: which lap to learn each corner from (own lap 7 for C3, rival for C9).
- **Progress over time**: the driver's laps on a layout are measured in one batch (§4.1). Key: driver + layout + class
  + `cornerId` + map fingerprint. Per corner and session: best and median corner time, hit rate, and the key metrics
  (brake point against the marker and `quickBrakeM`, minimum speed, line apex, throttle hesitation), dry and wet
  apart. Views: a corner trend chart with the previous session's target marked; a "most improved / still open" list
  per layout; the next debrief opening with "C3 brake point: 85 → 93 m, target 95 m". Only a change of that map's
  fingerprint starts a new series, and a metric's version change marks a break in that metric only; patches are
  marked on the chart.
- **Confidence label** on every tip: alignment quality, sample rate, traffic. A tip on weak data is a hint, not a
  ranked tip.

## 12. Adding a layout, and what arrives with the data

**State today.** 21 of the 32 defined layouts have geometry. The missing ones are added **one at a time, as each
circuit is driven** (§15 row 19), not up front. Road Atlanta, probably the next circuit, is defined (`road_atlanta`,
scene `roadatlanta`) but has no geometry file

**Procedure for a new layout** (Road Atlanta as the example):
1. **Drive one session** there (results XML and replay). Sessions, lap times, the leaderboard and the replay already
   work without geometry; the corner analysis says "no track geometry for Road Atlanta yet".
2. **Build the geometry**: take the Tier 1 trackmap from the LMU REST API
   with a single GET from the main menu, not during a replay (some endpoints crashed LMU in replay mode); run
   the boundary generator; check 0.99 < s < 1.01; commit the files in `server/data/tracks/` and
   `public/tracks/`.
3. **Nothing to write for corners.** On the next server start the map is generated for every class, initially
   provisional until that layout and class passes its own human-data checks (§3.5). The projection
   runs when a trajectory is served (`downsampleTrajectoryResponse` → `enrichTrajectoryWithTrackGeometry`), so the
   sessions already driven there get stations and corners with no re-decode.
4. **Check it once**: `measureCornerMaps.ts road_atlanta` prints and draws the segments. If one is wrong, fix the
   model, not the layout. Official T numbers can go in the override file.
5. **Commit the golden map** for the layout (§13).

A new **class**: drive it, run `buildClassProfiles.ts`, commit the profile; maps are then generated for that class on
every layout with geometry. No other class's map changes.

**What arrives as the data grows** (per layout, class and patch). Nothing already shown or stored moves.

| Laps on the layout | What the corner analysis has |
|---|---|
| Geometry only, your first laps | After structural checks, provisional C locations and segment/phase times; raw lap comparison on the same map, with no precise markers or ranked corner coaching until this (layout, class) passes its human-data gate (§3.5) |
| Enough eligible human laps for this layout and class to pass §3.5 | Validated corner events and metrics, consistency, corner best lap and progress; ranked coaching can use repeatable evidence from the player's own comparable laps |
| A few sessions of your own | Also: hit rate per corner and lap-to-lap spread shown separately from the resolution-based "same" band |
| ≥ 40 fast human laps from ≥ 5 drivers on the major patch | Also: the quick-lap references and the class G envelope; RPM ranges for each car model with enough of those laps |
| A minor patch (1.42 after 1.415) | Its laps join the current major's references |
| A new major patch (1.5 after 1.4) | No references until it reaches the threshold; the previous major's are not shown |

The "against the quick laps" values are worked out when read, from metrics in absolute stations, so new references
change no segment and no progress series.

## 13. Trust, stored outputs and tests

- **Provenance** on every corner view: map quality for this layout and class (`provisional`, `validated` or `failed`)
  with the eligible lap count and a short reason; then "segments generated from the track geometry · quick-lap
  references from 212 laps, 18 drivers · patch 1.42", or "no quick-lap reference yet (12 of 40 laps)". The same for
  the rival. A provisional map has no ranked advice.
- **Old AI reports and debriefs** (`ai_reports`, stored debriefs) quote T-numbers from today's lap-based corners. New
  ones record the map fingerprint and the metric versions; an older one shows "corner numbers from an older version"
  instead of being silently wrong.
- **Tests**:
  - synthetic laps per type (hairpin, chicane, flat kink with its window, esses with no full throttle, a clamped zone)
  - property tests: swap symmetry, phases sum to the segment, segments sum to the lap
  - the model's validation gate (§3.5) on a small committed fixture set in CI, as a regression; the full gate runs on
    the local cache with `measureCornerMaps.ts`
  - a golden generated map for every layout with geometry, so a model or profile change shows as a diff
  - each metric's four validation checks (§9)

## 14. Phases (one branch, `corner-map`)

**First driver-facing release:** complete phases 0, 1a–1d, the core of phase 2, and a minimal UI/consumer path.
It shows stable C locations, segment and phase time including the run, and both laps' own brake point and bounded
speed minimum where the map and event gates pass. It has a clear detail view for the supporting traces. Acceptance:
on the sign-off laps, the driver can identify the largest loss and its first measured difference; both laps use the
same windows; swapping them mirrors every delta; phases and segments add to the lap; no map with a failed gate emits
a ranked tip. This release shows measured differences, without prescribing a change until phase 3d validates the
coaching rule. Quick-lap references, advanced pedal/line labels, long-term trends and AI wording follow only after
this release is correct. The catalogue in §9 is not a checklist for that release.

0. **Safety net.** Invariant tests on today's output: segment sum = lap delta, swap symmetry and the same corner set
   whichever lap is the primary (both fail today, marked `todo`). No golden outputs of today's corners: phase 2
   changes every corner window, so they could not be diffed.
1. **Corner map** (§3).
   - 1a geometry: curvature detection and its thresholds, ids and C numbers, width profile.
   - 1b derived-channel validation (G against DuckDB, §2), then the class profiles: `buildClassProfiles.ts` and
     `classProfiles.json` (fast-lap envelope, leave-one-layout-out).
   - 1c segments: the speed-profile model, gate order and clamps, flat-corner windows, type per class, the S/F cut,
     map fingerprints.
   - 1d the validation gate in `measureCornerMaps.ts`, golden maps for every layout with geometry, the breach warning
     in Settings.
   - 1e (after the first release) quick-lap references per major patch, RPM per car model: `gameVersion` kept as text (parser fix, `DB_PARSER_VERSION` bump), the
     worker job, the `corner_references` table and store, provenance.
   - Gate: the validation gate passes, and the user signs off the C segments for two classes on the 4 sign-off
     tracks (§15 row 18).
2. **Per-lap measurement and comparison** (§4, §5). Contracts and `shared/domain/corners/`; the on-demand endpoint
   (single and batch, batch on a worker); the cost measured per lap and per progress query. Rebuild
   `computeLapSegmentComparisons` on it behind the same output shape (fields added, none removed), with `cornerId`,
   own events (brake-on, turn-in, bounded speed minimum, full throttle), phase times, channel availability,
   "same" bands and the sign convention. Swap symmetry and the same corner set turn green. New goldens of the new
   output, checked against the sign-off laps.
3. **Metrics**, each with its four checks (§9); a failure goes to the rejected list, not the code. Order: brake peak
   and shape, trail braking for both laps; gear; lat/lon G; throttle ramp and lifts;
   steering corrections and unwind; speed at the next zone; then the run phase and context (§8).
   - 3b **Racing line** (§6): the per-layout precision check first (`measured` / `estimated`), then track position, track used, apex distance (fixes
     today's wrong value), line apex vs speed minimum, shape index, split point, evidence readout. Gate: on 3 laps per
     sign-off track picked by the user, "uses more track" and V/U match what they see on the map.
   - 3c **Pedal inputs** (§7): brake shape and re-applications, ABS/lock, downshifts, throttle hesitation, ramp and
     lifts, TC/slip, coasting. Gate: the shape labels match the traces by eye on the same laps.
   - 3d **Coaching** (§11): corner best lap and the consistency/technique split, entry/exit trade-off, hit rate and
     risk cost, fairness flags, the practice target.
   - 3e **Progress over time** (§11 5): batch measurement, trend chart, "most improved / still open", the debrief
     opener. Needs phases 1–2 only, so it can come right after the first metrics.
4. **Consumers.** Consistency (every lap against the map, no reference lap). The debrief stores `cornerId`, the map
   fingerprint and the metric versions (bump the debrief version). Then the rival debrief and the AI payload (`shared/types/aiReport.ts`), which
   only ever receive validated metrics. Old reports are marked (§13).
5. **UI.** Lead with time lost by segment and phase (including the run), one repeatable driver action when supported,
   and an evidence disclosure for detailed metrics and traces. Phase cards put both laps' events on one marker axis
   (brake point, turn-in, speed minimum, full throttle, centred on the geometric apex marker); the speed-minimum
   early/late badge; a type chip when validated; the corner close-up map and
   the track position strip (§6); provenance. The map and telemetry strip draw the corner map's segments, not the
   primary's.
6. **Docs.** `docs/CODE_MAP.md` (modules, endpoint, table, versions, smells fixed); the user-facing corner help text.

## 15. Decisions (2026-10-02)

| # | Topic | Decision |
|---|---|---|
| 1 | Principle | No information beats bad information. Source data is trusted; every computed value or interpretation is built only when it passes its validation, otherwise not at all (no hidden tier, nothing unproven to the AI). Derived replay channels included |
| 2 | Corner | Brake zone to the next brake zone; segments per class, identity per layout |
| 3 | Labels | Corners are **C1, C2…**, numbered from the track shape, the same for every class; a flat corner keeps its number but opens no segment for that class. **T** is reserved for official turn numbers, added later per layout and pinned to a station. Never guessed |
| 4 | Map | Generated for every layout with geometry, from the geometry and a committed class profile through a speed-profile model. No fallback, no per-circuit maintenance. Data never moves a segment |
| 5 | Chicanes | A chicane is one C segment. Chicane/esses labels and sub-apexes only when the geometry gate passes, and only if worth it |
| 6 | Quick-lap references | The 40 fastest clean human laps (≤ 5 per driver, ≥ 5 drivers) per major patch. AI never counts. Absent below the threshold. Kept in a small table. Class medians are context with sample and car-model mix, never a practice target or estimated gain by themselves |
| 7 | S/F straight | Cut at the line: the last corner's run ends there; the lap opens with a Start segment linked to the last exit. A zone starting before the line wraps past the lap length, built when a layout first needs it |
| 8 | Wet | No wet map, no buffer: zones are placed with wet braking, so wet and dry share segments. Wet compared with wet only |
| 9 | Patch | Kept as text on every result and progress point. References are per major patch (1.3, 1.4, 1.5…); minor patches share them. A new major shows no references until it reaches the threshold. Segments do not depend on it |
| 10 | Sample rate | Every metric on all recorded samples. Never downsampled |
| 11 | Data level | A comparison with another driver's lap (or an own lap without telemetry) uses the replay data for both laps. The player's telemetry adds a self-analysis level where worth it |
| 12 | "Blip" | Means mid-corner throttle hesitation. Downshift blips are not analysed |
| 13 | Metrics | The catalogue is the candidate list; each metric is built only when its four checks pass |
| 14 | Cache | No new metric cache: computed on demand from the cached full-rate trajectory |
| 15 | Missing geometry | A layout without geometry shows "no track geometry yet"; the fix is to build it |
| 16 | Line thresholds | Start with §16, tuned by eye on the sign-off tracks; car half-width 1.0 m per class, calibrated by the precision check |
| 17 | Coaching | Corner progress over time is wanted |
| 18 | Sign-off tracks | The 4 layouts with the most clean human laps in the cache (2026-10-02): Daytona Road Course (5,981), Imola (2,883), Le Mans (2,004), Bahrain GP (1,961) |
| 19 | Missing geometry | Added one layout at a time as each is driven, through §12. Road Atlanta first, once it has been driven |
| 20 | Branches | One branch, `corner-map`, to start |
| 21 | Geometry quality | The geometry files are used as they are, no hand work. Centerline shape is checked by the model's validation gate; edges per layout by the off-track precision check, and a layout that fails gets only the line metrics that need no edges. Elevation comes from the laps' `y` |
| 22 | Flat corners | In v1, with their own window (halfway to the neighbouring geometric apexes) for minimum speed, speed-minimum station, line and grip |
| 23 | Model check | Counts braking onsets, plus the lift onset only in corners taken with a lift and no brake. Race lift-and-coast is left out |
| 24 | Map versions | A fingerprint per (layout, class) map; a change restarts only that map's progress series. Each metric has its own version |
| 25 | RPM and gears | Per car model, never per class: own laps in that car, plus references for a model with enough laps |
| 26 | Colour | Only time is coloured. Every other value is neutral, with the time next to it |
| 27 | First release | Stable C locations, segment/phase/run time and each lap's own brake point and bounded speed minimum, with a concise evidence view; advanced metrics, references and trends follow after driver sign-off |
| 28 | Speed minimum | Search only the corner's bounded geometric-apex window; ambiguous or boundary minima are unavailable. UI says "speed minimum" and "line apex", never an unqualified lap "apex" |
| 29 | Noise | "Same" is based on measurement resolution only. Driver spread is a separate consistency and coaching-confidence signal |
| 30 | Map quality | Structural checks precede any display; human-data checks promote each (layout, class) independently. Provisional or failed maps yield no precise marker claims or ranked coaching |
| 31 | Practice target | A repeatable time gain in the driver's own comparable laps sets a target. Rival and quick-lap differences are supporting observations, not instructions by themselves |

## 16. Starting thresholds (named constants in `shared/domain/corners/thresholds.ts`)

| Where | Constant | Starts at |
|---|---|---|
| Segments | Zone margin | model braking onset (wet braking) − 30 m, never before the previous `fullThrottleRefM` |
| Segments | Wet braking factor | dry deceleration × 0.75 |
| Corners | Detection | heading change ≥ 15° after 20 m smoothing; same-direction peaks < 40 m apart merge |
| Segments | Validation | ≥ 99 % of human braking onsets (brake > 10 %) after the zone start; lift onset (throttle < 90 %) only for lift-not-brake corners; flat calls match (< 20 % of laps lift) |
| Segments | Local validation sample | ≥ 20 eligible clean human laps across ≥ 2 sessions for the (layout, class), with observed onsets at each non-flat corner; smaller samples remain provisional |
| Segments | Breach warning | > 1 % of recent human laps brake before a zone |
| References | Laps per (layout, class, major patch) | 40 fastest clean human laps, ≤ 5 per driver, ≥ 5 drivers |
| References | RPM per car model | ≥ 10 of the reference laps from ≥ 3 drivers in that model |
| Class profile | Envelope | 95th percentile per speed band of the fast laps |
| Braking | Brake on / trail braking | 10 % / brake ≥ 5 % with steering ≥ 5° |
| Braking | Release step / re-application | drop ≥ 40 % in 0.1 s / below 50 % of peak, then up again |
| Throttle | Pick-up / full | 15 % / 90 % held 0.4 s |
| Throttle | Dab / pumping | rise > 10 % then drop > 10 % within 0.5 s / several reversals over 5 % on a plateau |
| Throttle | Lift / snap | drop > 20 % after pick-up / 0 → 90 % in < 0.2 s |
| Throttle | Coasting / overlap | brake < 5 % and throttle < 10 % / both > 10 % |
| Throttle | Lift-and-coast | released > 0.5 s before brake-on |
| Steering | Turn-in / unwind done / rate window | 5° / below 25 % of the corner's peak / 0.3 s |
| Line | Split | gap ≥ 1.0 m held ≥ 20 m |
| Line | More track / apex shift / kerb / tight clip | 0.5 m / 5 m / 0.2 m past the edge / within 0.5 m |
| Line | V / U | shape index ≥ 0.55 / ≤ 0.40, no label between (a constant arc scores 0.30) |
| Line | Car half-width | 1.0 m per class |
| Context | Tow | car ahead within 30 m on the run |
| Coverage | Uncovered dip | speed dip > 6 km/h outside a corner |
| Noise | "Same" band | measurement resolution only; player spread is shown separately |
| Noise | Metric repeatability | measurement noise < the metric's predeclared useful difference; driver variability is separate |

## 17. Still open

**Before phase 1**
1. **Sign-off classes.** Which two classes are signed off on the 4 tracks (§15 row 18)?

**Before phase 3**
2. **Starting thresholds.** Any value in §16 you already know is wrong from driving (the 30 m zone margin, 0.5 s for
   lift-and-coast)?
3. **How to estimate the gain.** The target must come from a repeated gain in the driver's own comparable clean laps
   (§11). Decide the minimum lap count, the repeatability test and how to keep correlated brake/line/throttle changes
   from being presented as a proven single cause before shipping a numeric "5 m is worth 0.03 s" claim.
4. **Lift-and-coast in a race.** Keep it out of the ranking (current plan), or still show the time it costs, so the
   driver sees what the saving costs?
5. **Coaching detail.** The first debrief view leads with time lost, its run cost, and one supported action. Decide
   which further evidence belongs in the first expanded view and which belongs only in the telemetry studio.

**Later**
6. **Self-analysis level.** Which telemetry-only metric first: 4-corner brake pressure (brake balance as driven),
   100 Hz pedal shape, or wheel slip per corner?
7. **Sub-apex gate** (only if chicane detection is pursued). Which corners on the sign-off tracks must count as two
   apexes, and which must not?
8. **Official turn numbers.** Which source, and which layouts first?
