# Corner insight (plan accepted 2026-11-18, not started)

Agreed with the driver on 2026-11-18. Goal: while watching a race or a lap, see how the car drove the corner it is in
against its own race and its class, and bring the lap and race data onto one track reference so such questions are
plain queries between laps.

## The card

- One corner insight card, always shown on the left of the scene (the race view's left side is free: controls and timing
  sit on the right, the standings tower beside the scene). A button in the controls row and a shortcut close it; it
  stays closed until reopened.
- It switches to the next corner as the car crosses into it: no fade, no slide. Its size is fixed; fields not driven yet
  show "–" (no layout shift).
- For the followed car, on its laps of this session:
  - this pass's time against the car's median for the corner ("than usual"), and its best pass with the lap;
  - brake point, slowest point and minimum speed, accelerating again, each against its usual pass; each value appears
    once the car has driven it (brake when it brakes, minimum after the apex, time at the exit);
  - the class's fastest pass this session, with its car number;
  - the corner's strip over the session: a cell per lap against the median, the current lap outlined, pit stops as
    dividers. A click on a cell moves the clock to that pass.
- Which passes set "usual" (the median, gains and the class's best), one rule for every session type (driver,
  2026-11-18): racing laps in the same conditions (wet with wet), read from the parser's stored lap flags. Left out:
  lap 1, in and out laps, invalid laps, laps tagged non-representative for `'contact'` or `'offPace'`. Laps tagged
  `'traffic'` are **counted** ("it's a race not hotlap"; qualifying is private, practice is practice). Fewer than 3
  such passes in the conditions: "–".
- Every pass shows on the strip, with marks set where they happened: start, in / out lap, pit lane, traffic, incident
  (the replay's contact events), wet. Marks explain; only the lap flags decide what counts.
- The lap level is unchanged: clean lap average, consistency rating and leaderboard keep leaving traffic laps out.
- Deterministic, same car class, no AI.

## Corners in two layers

The app's corner is the driver's sequence of braking and steering, and it differs per class (a hypercar takes flat a
kink a GT3 lifts for, a chicane can be one braking zone). One definition cannot be both the map's corner and the
driver's, so they are split.

1. **The track (fixed, per layout).** Every lap of every car is placed on one distance along the layout's centre line:
   the shared reference for queries between laps, cars and sessions. The centre line is cut into the layout's official
   turns (step one decision 1): one segment per turn, its time comparable across cars, classes and sessions. The turns
   change only with their official list or the track package's geometry revision; no coordinate is edited by hand.
2. **The driving (detected per lap).** Each lap's sequences (braking, turn-in, slowest point, accelerating again) are
   detected from its channels when its passes are built, and placed on the segments they cover: a chicane in one
   braking zone covers two segments, a flat kink has no sequence and still a time. A class's usual way through is the
   median of its sequences in the session, worked out when a view opens. No per-class map is stored or reviewed.

The card's times come from layer 1; its explanation from layer 2. A better detection rule is a version bump and an
offline rebuild of the passes (decision 6), never a data fix. The `corner-map` worktree (hand-reviewed per-class maps, see [corner comparison](../CORNER_COMPARISON_REWORK.md))
adapts to this model if it is kept, rather than this model waiting for it.

## Data

Today the stored laps (`replay_trajectories`, every car, every lap, full replay rate with throttle) are read three ways:
the lap view's `/telemetry` (one lap, fused with native telemetry for the player, projected on the centre line),
the race view's `/race/poses` (every car resampled to 10 Hz in 60 s windows, memory only, no throttle) and the race
positions index (5 Hz, SQLite, built on first use) for traffic and live gaps. Each has its own idea of where a car is.

- Corner passes come from the stored laps at full rate, one pass per car, lap and segment: times, the layer 2 cues,
  traffic, pit lane, conditions. The lap view and the race view read the same passes, so both cards agree.
- Measured on the longest race (Le Mans, 63 cars, 12.65 M samples; [numbers](REPLAY_STORAGE_DESIGN.md#one-pattern-for-a-car-over-time-2026-11-18)):
  deriving them on demand takes about 45 s (decoding and the centre-line distance; the pass rule itself 0.12 s). So they
  are built once on a worker at ingestion into disposable SQL rows (decision 5) keyed by a version key: the pass rule's
  version, the turn lists' version, the geometry revision and the replay parser version. When any changes, the offline
  script rebuilds them (decision 6); they are never a source of truth. No further full copies of the samples.
- Traffic marks come from the same distance frame.
- The passes replace the existing per-lap corner timing, in this plan, to remove the duplication (driver, 2026-11-18):
  the lap view's Consistency panel (`useCornerConsistency.ts` today fetches every clean lap at 400 points, one request
  each, and times them through the displayed lap's corners) and the debrief's "where the time goes" (400-point traces)
  read the session's passes instead. One read instead of a request per lap; full-rate precision (400 points is one every
  34 m at Le Mans); corners that do not move with the displayed lap. Their numbers change: corners become layer 1 and 2,
  and the player's passes come from the replay laps like every car's, not the native telemetry. The old per-lap paths
  and their corner windowing are removed once both read the passes.
- How the lap data is stored is being brought to one pattern at the same time (three today for the same information):
  see [one pattern for a car over time](REPLAY_STORAGE_DESIGN.md#one-pattern-for-a-car-over-time-2026-11-18).

## Decided

- A session's derived cache builds at ingestion, on a worker after its replay laps commit (driver, 2026-11-18), so the
  card is ready on first open. Stored replays and version changes are rebuilt offline (item 6).
- All 32 layouts have a centre line in the track package (personal-v24, checked 2026-11-18): no fallback needed.

## Step one decisions (the fixed segments and the passes)

1. **Segment rule from the official turns (driver, 2026-11-18: confirm against official sources, invent nothing).** Each
   layout lists its official turns (number, name where one exists, the source and its date), from the circuit's or the
   series' official track map. The list decides which bends are turns; the centre line's curvature only places each one
   (its apex, the curvature peak nearest where the map puts it), and a boundary sits midway between two turns' apexes.
   Esses stay separate turns, as officially numbered; layer 2 groups them per class. A layout variant (Bahrain Outer,
   Sebring School, Silverstone National, Monza Curva Grande, Paul Ricard Short) keeps the full layout's numbers and names
   for the turns it shares, so T3 stays T3 (driver, 2026-11-18); a turn only the variant has takes its own official
   number where one exists. Where official sources disagree, the list records which it follows.
   Finding (2026-11-18): most circuits' own pages name their corners without numbers (Monza, Spa), Le Mans has no
   numbering found, some sites refuse automated reads (Sebring, IMSA), and official maps often label only some turns
   (Sebring's 2026 event map: 1, 3, 5, 7, 10, 13, 15, 16, 17 of 17).
   Rule (driver, 2026-11-18): **segments and labels are separate.**
   - Segments always exist, on every layout: where an official list exists it decides which bends are turns; where none
     does, the placing rule falls back to the centre line's own bends (kinks under a fixed angle left out). Each segment
     has a stable internal id (layout and order), never shown as a number.
   - Labels take the best source that exists, recorded per turn: (1) the circuit's official numbering, fully labelled
     or anchored by its labelled turns with the unlabelled numbers filled in order (marked "filled"); (2) a racing
     series' published numbering (Formula 1, IMSA, WEC), recorded as such; (3) the official corner name alone;
     (4) no label: the card shows the segment's position ("after Arnage", "km 4.1"). Never a number of our own.
   - A better source later is an edit to that layout's list: a version bump, and the offline rebuild relabels the
     passes; segment ids and history across sessions keep their place on the track.
   - Map positions (driver, 2026-11-18): each listed turn carries its rough distance from the start line, read off the
     source map against a few unmistakable corners; the rule snaps it to the nearest bend. Without one the rule takes
     the largest bends between its neighbours, which mismatched Portimão, Sebring and Le Mans.
   - The game's data is a count check only (driver, 2026-11-18): each layout's corner count is read once from the
     game's layout file (`CircuitCorners`), and again once for a new track, not exported continuously; the list records
     it and a test compares it with the list, where a difference is explained in the list or fixed. The game's own turn numbers (a few labelled scenery
     objects: Le Mans numbers to 38, Sebring's "T1" sits in our T1) never label turns.
2. **Where the official lists live: decided (driver, 2026-11-18).** Beside the layouts in
   `shared/domain/circuitDefinitions.ts`, the layouts' single source of truth (real-world names, not game data); no
   package change.
3. **Where the rule runs: decided (driver, 2026-11-18).** In the app, over the package's centre line, keyed by its
   geometry revision; no package change. A misplaced turn is a tested app fix beside the lists.
4. **Acceptance.** Each layout's turns drawn on the 2D map with their official numbers, checked against the official map
   by the driver's eye on a few layouts first (Le Mans, Sebring, Spa, Monza, Portimão proposed); a misplaced turn is a
   fix to the placing rule, not a per-layout coordinate. The five check layouts were accepted on 2026-11-18, on the
   map's Official turns layer (off by default), after the apex moved from the sharpest point to where half the bend's
   turning is done (the sharpest point sat at Lesmo 1's exit). The game's corner counts for all 32 layouts are in
   `circuitTurns/gameCornerCounts.ts`; a list whose length differs says why (`gameCountNote`). The other 26 lists were
   accepted on 2026-11-18, after a map-position fallback: a turn the map numbers with no bend of its own (Barcelona 11,
   Fuji 7 and 14) sits at its map position between its neighbours. Variants keep the full layout's numbers and leave
   their own bends unlabelled. Daytona and Fuji are numbered from Wikimedia Commons maps, no official numbered map
   having been found. Le Mans (both layouts) carries the ACO's names, placed in its order on the centre line's bends;
   the Karting Esses as the two quick bends before the Ford Chicanes and the Motul Turn as the second Ford chicane's
   right are readings, the source having no map.
5. **Storage of the passes: decided (driver, 2026-11-18), SQL rows to start.** One row per car, lap and segment, keyed
   like `replay_laps` (`filename, driver_slot, lap, segment`) plus the version key, so passes join with laps, events and
   conditions and any question across sessions is one query. Measured about +4% of the database with a text key on
   every row; a leaner row (`WITHOUT ROWID`, compact key) is measured in step one. A blob per replay (+7-9 MB) stays
   the fallback if the rows prove too large.
6. **Sessions already stored: decided (driver, 2026-11-18), an offline migration.** A one-off script, run with the app
   stopped, builds every stored replay's passes (about 520 M samples, roughly half an hour of one core) with the same
   builder as ingestion; no backfill code in the app. A rule, geometry or parser version change is rebuilt the same way,
   offline. A replay whose passes are missing or carry another version key shows the card's "not built" state, never a
   build on open.
7. **Sessions without a replay: decided (driver, 2026-11-18), no passes.** The data is replay first, augmented by the
   game's telemetry: passes come only from replay laps. A session with telemetry alone gets no passes, and its
   Consistency panel shows its empty state (today it runs on the telemetry laps; that path goes with the others).
8. **Scope: decided (driver, 2026-11-18).** Step one is the corners only. The race positions index stays as it is (built
   on first use, its own JSON blob) until step 5 retires it; the native lap cache stays as it is, for later.

Card questions, not blocking step one:

- **Where: decided (driver, 2026-11-18), the race view and the lap view.** In the lap view the card follows the viewed
  lap's playhead: that lap's pass through the current corner against the car's median and the class's best pass in the
  race. Both read the same passes.
- Lap 1: decided, left out of "usual" by the existing lap flags and shown marked on the strip (the card rules above).

## Steps (proposed)

Each step lands on its own, with zero warnings, before the next starts.

1. **Official turns.** The turn list per layout in `shared/domain/circuitTurns/turnLists.ts` (number, name, source,
   date), the placing rule over the centre line, the turns drawn on the 2D map. Done 2026-11-18, all 32 layouts.
2. **Passes.** The pass table, the builder (layer 1 times, layer 2 cues, marks) on the ingestion worker, the offline
   script for stored replays. Done when the leaner row is measured and every stored replay has passes.
3. **Consistency and debrief on the passes.** Both read the session's passes; the 400-point per-lap paths and their
   corner windowing are removed.
4. **The card.** In the race view and the lap view, on the same passes.
5. **Retire the race positions index** (driver, 2026-11-18). Its two readers move to the pass builder's output, then
   `replay_race_positions`, its first-use build (7.7-19 s on Le Mans) and its second centre-line projection are removed:
   - traffic spells (kind, start and end time and station, closest gap) are found by the pass builder, which already
     has every car on the centre line at full rate for the traffic marks, and stored as rows with the passes;
   - the race view's live gaps come from the turn crossings, as real timing loops do (about every 3 s at Le Mans), or
     interpolate between crossings along the car's own lap to stay once a second; the driver picks after seeing both.
   The lap-level traffic tag (from the session's line crossings) does not use the index and is unchanged.

Later, on the same passes: the rival duel (two cars' segments over the same laps) and
[debrief corner tracking](DEBRIEF_CORNER_TRACKING.md) across sessions, which needs layer 1's stable segment numbers.
