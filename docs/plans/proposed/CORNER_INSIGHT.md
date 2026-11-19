# Corner insight (plan accepted 2026-11-18, steps one to five built, step 6 maps and passes built, readers next)

Agreed with the driver on 2026-11-18. Goal: while watching a race or a lap, see how the car drove the corner it is in
against its own race and its class, and bring the lap and race data onto one track reference so such questions are
plain queries between laps.

## The card

- One corner insight card, always shown on the left of the scene (the race view's left side is free: controls and timing
  sit on the right, the standings tower beside the scene). A button in the controls row and a shortcut close it; it
  stays closed until reopened.
- It switches to the next corner as the car crosses into it: no fade, no slide. Its size is fixed (no layout shift).
- For the followed car, on its laps of this session (driver, 2026-11-18: "the time, the potential gain, the minimum
  speed at least"; the first, fuller card was "too crowded"):
  - Time: the time in the corner so far, ticking with the replay (driver, 2026-11-18: "to know where we are"), then
    the whole pass. Time and Min speed: this pass against the car's usual (its median); the usual, its spread (standard deviation)
    and its best pass with the lap in the tooltip. The whole pass shows from the turn's entry: the next turn starts at
    this one's exit, so values revealed as driven left the time always empty.
  - Gain: the car's usual against the fastest usual of another car in its class, with the turn's place among the
    car's turns by gain.
  - Where: that gain split at the slowest point, entry and exit.
  - How: what that faster car does differently in its usual pass (brake point, minimum speed, throttle point).
  - The corner's strip over the session: a cell per lap against the median, the current lap outlined, pit stops as
    dividers. A click moves the race view's clock to that pass, or opens that lap in the lap view at the turn's entry.
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
2. **The driving (a sequence map per layout and class).** How a class drives the turns (braking, turn-in, slowest
   point, accelerating again) is detected once on its fastest laps and stored as a map: which official turns it takes
   as one sequence (a chicane in one braking zone covers two turns) and where its speed starts to drop for each (a
   brake, a lift, or a steering reversal between linked corners). Every lap is timed through the map's sequences when
   its passes are built (step 6).

Layer 1 times every official turn; layer 2 times the sequences the driver feels, as the detected corners do today. A better detection rule is a version bump and an
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
  the lap view's Consistency panel (which fetched every clean lap at 400 points, one request each, and timed them
  through the displayed lap's corners) and the debrief's "where the time goes" (400-point traces) read the session's
  passes instead (step 3, built). One read instead of a request per lap; full-rate precision (400 points is one every
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
   conditions and any question across sessions is one query. Estimated about +4% of the database with a text key on
   every row. Measured (2026-11-18) with the lean row (`WITHOUT ROWID`, integers in ms, dm and 0.1 km/h, the filename
   still the key): 915,667 passes of 540 replays in 75.5 MB, about 82 bytes a pass, +1.5% of the 5.1 GB database. Kept;
   a compact integer replay key would save most of the rest if it is ever needed.
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
   date), the placing rule over the centre line, the turns drawn on the 2D map. Done 2026-11-18, all 32 layouts. A
   badge's tooltip says what its number is (the circuit's own, a series', or counted on); a number of no recorded
   source claims none.
2. **Passes.** The pass table, the builder (layer 1 times, layer 2 cues, marks) on the ingestion worker, the offline
   script for stored replays. Done when the leaner row is measured and every stored replay has passes.
   Built 2026-11-18 (`server/corners/`, `tools/analysis/buildCornerPasses.ts`); row measured (decision 5). All 540
   stored replays built into a scratch database in 35 min of one core; the longest race (Le Mans, 12.5 M samples)
   takes about 40 s on the ingestion worker. Samples more than 30 m off the centre line (a retired car parked for the
   rest of the race) are left out before the projection, whose whole-track search made them cost 40x a driving sample.
   The row carries what steps 3 to 5 read, so they need no rebuild (driver, 2026-11-18, pass version 2):
   - entry and exit speed, and the time at the slowest point (the panel's Entry and Exit, the debrief's worst phase,
     the card's minimum after the apex);
   - turn-in: the start of the steered run that holds the slowest point (over 4% of full lock), none when the
     steering carries over from the previous corner;
   - throttle back on: the end of the corner's lift (under 50%), none when taken flat. The first throttle after the
     slowest point is no cue: speed bottoms out as the throttle comes back, a sample later on every pass;
   - traffic: the closest car ahead and behind within 2 s, its slot and gap in seconds at this car's speed (the
     spells' measure). Step 5's spells are then runs of passes with the same car close, merged when read: no second
     table.
   Rot% @ Gas (the Consistency panel) is dropped: it needs heading, and layer 2 is where it would come back.
   Pass version 3 (2026-11-18): a stored lap is cut where the game timed it, often metres past the centre line's
   start (11-17 m on some cars), so 31% of laps had no pass through the turn starting on the line. Each lap now
   borrows its neighbours' samples within 200 m of the line; what is left is a lap after a pit stop or the first
   stored lap, which have no crossing to read.
   Pass versions 4-16 (2026-11-18), from an audit run while each rebuild wrote: every stored lap x turn without a
   pass, given a cause. A lap's stations are unwrapped from its first sample, and laps are not always one clean
   track length: an out-lap from a pit exit late in the lap; stray samples left before a trip to the garage or a
   pre-start teleport; a race's lap 1 holding the formation lap, or running from a grid behind the line across it.
   So a lap is placed on the last track length it drives at least half the longest distance of (distance, not
   samples: a slow formation run has many), every turn it drives on every track length is timed, each track length
   searched from the lap's start (a rejoin from the garage a track length back drives the early turns again), and
   the latest pass of each turn by time is kept, a pass belongs to the lap when its midpoint is in the lap's own time (the neighbours' samples only
   complete passes across the line: only their unbroken run within 200 m into the lap's first sample or on from its
   last is borrowed, lined up by the whole track lengths between them; a neighbour's wait in the garage once hid every
   pass of a lap 1), a pass broken inside (a trip to the garage) or wholly in the previous lap's samples is looked for again further on,
   and a crossing is a step from short of the boundary to past it between samples
   that follow each other (a jump over it is skipped, not the end of the search). On all 540 stored replays
   (1,045,680 lap turns) every miss has a cause; the 10 the audit's 5 m margin left are holes in the replay itself:
   a remote car's position frozen for 2-3 s then 100-260 m on, a recording stall moving every car 50-90 m, or a
   teleport to the garage a few metres from a turn's edge. The rebuild of every replay (tools/analysis/
   buildCornerPasses.ts, a few worker threads at once) takes about 5 minutes.
   Pass version 17 (2026-11-18): a car under 5 m/s is no one's traffic. A parked safety car beside Sebring School's T16
   was the car ahead on every pass through it (323 of 323), so the card marked T16 traffic on every lap.
3. **Consistency and debrief on the passes.** Both read the session's passes; the 400-point per-lap paths and their
   corner windowing are removed. Built 2026-11-18: `GET /api/session/:id/corner-passes` (`server/corners/sessionCornerPasses.ts`)
   serves the turns, the cars and the passes, one request for the session (a driver's only with `driverOrdinal`).
   - Consistency panel: one row per official turn over the laps the card counts, in the shown lap's conditions, less
     the laps left out (Brake, Turn-in, Throttle, Entry, Apex, Exit,
     each relative to the pass's slowest point). Each turn is placed on the displayed lap for its mini map, and a
     click opens the lap view on that turn.
   - Session debrief: official turns ranked by the analysed pass against the reference lap's pass; repeatability from
     the session's passes on the laps the card counts in the analysed lap's conditions, leaving out a pass with a car within 1 s in front (its spell from the pass's closest car);
     an analysed pass in traffic is trusted at half. Evidence (brake, turn-in, apex, throttle, exit) against the
     fastest lap's pass. The link opens the lap view on the same corner, numbered in the layout's order.
   - The lap-versus-lap views keep their detected corners (the inspector's Compare list, the rival debrief, the AI
     report); the AI report's repeatability reads the placed turn stats.
4. **The card.** In the race view and the lap view, on the same passes. Built 2026-11-18
   (`src/components/replay/cornerCard/`). The corner-passes response also carries each car's laps (the session's lap
   flags for its driver, else the replay's; wet from the lap's conditions) and the replay's contact events, so the card
   reads one request per session. Shown in the race 2D and 3D views, the lap 3D view and the lap view's fullscreen 2D
   map (driver, 2026-11-18), under the minimap; K or the controls-row button hides it, remembered across views. In the
   lap view the card follows the playhead on the shown lap, and a strip cell opens that lap with the car at the turn's
   entry. Laid out for reading
   (driver: "hard to read"): Time and Min speed lead as two large numbers with their change on the usual under them;
   below, the gain to find, its entry/exit split and the faster car's points as a plain sentence.
5. **Retire the race positions index** (driver, 2026-11-18). Built 2026-11-18: `replay_race_positions`, its first-use
   build (7.7-19 s on Le Mans), its worker and its second centre-line projection are removed (the table dropped offline).
   - The race view's live gaps (`/race/distances`, `server/traffic/raceDistances.ts`) read every car's distance once a
     second, linear between each pass's entry, slowest point and exit; a gap of more than 0.5 s between two passes
     (pit lane, garage) leaves the car empty. Against the old 5 Hz index on six stored races the gaps differ by a median
     of 0.03-0.07 s (p95 0.23-0.47 s, Le Mans worst); the crossing-only option (a gap per turn boundary, exact there,
     held between) was compared on Le Mans R1 52 (2026-11-19): it updates every 8.6 s typically, 30 s at the 90th
     percentile and up to 61 s on the straights, lagging a sudden change until the next boundary, while matching the
     per-second gap to 0.18 s (median; 1.0 s at the 95th percentile). Settled by the driver: the per-second gap stays,
     crossing-only is dropped.
   - The traffic route had no reader left (the debrief takes each pass's spell from its closest car, step 3), so it is
     removed; a screen that needs spells builds them from the passes' closest cars when it comes.
   The lap-level traffic tag (from the session's line crossings) does not use the index and is unchanged.
6. **Turn sequences (layer 2), proposed 2026-11-19; maps and sequence passes built 2026-11-19, readers next.** The card and the panel read one official turn at a time, where the
   driver thinks in sequences: esses taken in one rhythm, a chicane in one braking zone. The detected corners of the
   lap-versus-lap views ("Corner N") read that way but move with the shown lap and number in lap order. Sequences bring
   both onto the passes: at least as close to the driving as the detected corners, with stable labels and the class's
   usual way through.
   - **Detection rule.** The detected corners' rule moves to `shared/domain/`: alternating speed peaks and dips with
     6 km/h prominence, a steering reversal splitting at 2 km/h once the lock reaches a quarter of the lap's largest.
     Thresholds unchanged and the same for every class (driver, 2026-11-19: "a good compromise"): the class difference
     shows through each class's own laps, and the steering split already scales with each car's lock.
   - **A map per layout and class, from its fastest laps** (driver, 2026-11-19), not worked out per session: a
     sequence then means the same in every session, so history across sessions is one query. The map's laps: the
     fastest clean dry laps, one or two per driver, up to 10; at least 3 in all. The driver's own count only when
     among them: their replay is no denser (count below). Two neighbouring official turns join when most of the map's
     laps drive them as one corner, or as one braking zone (a chicane: under a third of the speed comes back between
     them). The driver's own **5 fastest** clean dry laps in the class then **validate** the
     map (driver, 2026-11-19), read from the native 100 Hz telemetry where it exists: detected the same way, they must
     group the same turns and start each sequence within 10 m of the map (a first value: 50 samples a second is about 1.4 m apart at 250 km/h,
     and a good driver's braking point moves a few metres lap to lap). The report gives every sequence's distance, so
     the first fill shows whether 10 m is right; a lift or a steering split may sit less sharply than a braking point. A
     sequence that fails is reported by the builder and the script for a look, the map kept, so no egregious boundary
     passes unseen. Where the driver's laps are the only ones, the check has nothing to compare and says so. In the
     app the check reads the driver's replay laps: the first audit found them grouped and placed as the native telemetry
     places them, so the native read stays in the audit script (`tools/analysis/buildSequenceMaps.ts`). Each sequence stores its turns and its start: where the class's speed starts to drop
     for it (a brake, a lift or a coast), the median speed peak before it on the map's laps, or the point a steering
     reversal splits two linked corners. A sequence runs from its start to the next sequence's start, the straight
     after a corner being its exit, exactly as the detected corners do today (driver, 2026-11-19). Labelled SQ1, SQ2… in lap order (driver,
     2026-11-19, replacing the first rule of naming it by what it spans); its title names the turns by their labels: one turn
     its label, several the range ("T3–T5"). A numbered turn goes by its number, a name only where the circuit
     numbers none (Le Mans); official names over a numbered range were turned down (driver, 2026-11-19: "Monza is too
     verbose"). The familiar names go before the range instead ("Lesmo 1, Lesmo 2 (T6–T7)", "Variante Ascari (T8–T9),
     then T10 flat on the exit"; driver, 2026-11-19: "the familiar names for the turn if possible"), from cited sources
     in `shared/domain/circuitTurns/familiarNames.ts` (Monza, Silverstone, Interlagos, Sebring and their variants), else
     the turn list's own names (Spa, Laguna Seca, Daytona, Fuji); a name is given once, an exit sharing it going by its
     number or ", flat on the exit" (Le Mans' Porsche Curves). Imola, Barcelona, Paul Ricard, Fuji, Long Beach and the
     Maggotts / Becketts / Chapel split come from general racing knowledge, no source page (driver, 2026-11-19: "I'm ok
     to hard code those… its not like the circuit change"), each checked against its placed turn's direction, uncertain
     ones left out; Bahrain, Portimão, Qatar and COTA go by numbers, as drivers call them. Edited by hand as needed. Kept apart from `turnLists.ts`, whose version bump rebuilds the passes.
   - **Built in the app.** The builder lives in `server/corners/`. Ingestion builds a missing map when a session brings
     its layout and class to 3 usable laps; the map grows with each session until it has 10, then stays fixed. Replays
     record every car, so a multi-class race maps every class on its grid. A faster lap later (an alien's) does not
     change a full map: one lap cannot swing the vote, and its different driving shows on the card through its passes.
   - **Re-map on purpose only, checked on its own** (driver, 2026-11-19: "Flag it"). A rule change is a version bump.
     Once 3 laps new to the class's fastest 10 are stored, ingestion builds a fresh map from the fastest 10 and compares
     it (same grouping, starts within 10 m); the result and the laps read are stored, the map is never replaced on its
     own. Settings → Corner Sequences lists every map with the driver's check and the last recheck, flags one that
     differs (with what: "T5–T6: now T5 + T6", "T1: start 18 m later") and regenerates it, then its layout's sequence
     passes, one map at a time and not during a replay scan. The offline script (`--remap --layout --class`) does the
     same with the app stopped.
   - **Sequence rows per lap.** Each lap's time through each sequence of its class's map, its minimum speed and cues
     (brake point, turn-in, throttle back on), built at ingestion in the passes' worker from the samples it has already
     decoded, keyed like the passes plus the map's version. Built as passes: the pass rule runs a second time with each
     car's class sequences as its segments (start to the next start), so a sequence row has every column of a turn
     pass, traffic included (`replay_sequence_passes`). The sequence across the line is the lap's it starts in. A sequence's time cannot be summed from the turn passes,
     its start being where the speed drops, not a turn boundary, and interpolating between pass points was off by 0.03-0.07 s
     on the live gaps. A re-map rebuilds its layout and class's rows; the turn passes are untouched.
   - **First fill.** An offline script (app stopped) calls the builder over every stored replay: maps first, then the
     rows. Counted 2026-11-19 on the stored replays (dry, valid, not lap 1 or an out lap, every turn passed): 48
     layout and class pairs on 24 layouts; 42 have 10 laps or more from 5 drivers or more, 47 have at least 3. The
     thin ones are the driver's own alone (Barcelona GT3 3 laps, Interlagos GT3 11, Silverstone National GT3 14,
     Silverstone WEC GT3 10, Spa Hypercar 8) and Paul Ricard Short GT3 (1 lap, no map). The other 8 layouts have no
     dry replay yet. The replay records the driver's own car at the same rate as every other (median 50 samples a
     second for both): its laps are no denser there, only the native telemetry is (100 Hz).
   - **First audit, 2026-11-19** (report mode, nothing written to the database). The rule moved to
     `shared/domain/cornerSequences/` (`speedTurningPoints.ts`, the client's Compare list now calls it there), the map
     rule beside it (`sequenceMap.ts`), the lap reading in `server/corners/sequenceLaps.ts` and the script
     `tools/analysis/buildSequenceMaps.ts` (report and SVG pictures). 47 maps built in about 40 s. The 10 map laps agree
     on each start within 4 m (median; 11 m at the 90th percentile). Native against replay on the same laps of the
     driver: the same grouping on all 202 sequences of 23 pairs, starts 1 m apart (median; 3 m at the 90th
     percentile, 17 m once). So the 50 Hz replay places boundaries as the native telemetry does. Against the map, the
     driver's own laps start 10-26 m earlier at Le Mans: driving (earlier braking than the 10 fastest), not data, so
     that comparison is informative only and the replay check is the one held to 10 m. Fixed on the way: a
     sequence's slowest point is the lap's own corner (it reached into the next one's dip), the first turn is never
     an exit turn, one-driver pairs take more of that driver's laps, a repeated name labels once, a bend no source
     names goes by its distance ("km 0.9", as the Consistency panel shows it). Sebring School's hairpin (driver: "the
     brake point is not at the middle"): taken in two dips, it picks up 12-17 km/h in its middle, so the last peak
     before it sat mid-hairpin. A start is now the last peak before the first turn's apex that the speed drops from
     for real, at least half the largest drop after a peak there (the hairpin: 12 against 108 km/h); the fastest
     peak and the peak before the slowest point were tried and moved other starts (Porsche Curves, Forest Esses).
     Every other start stays within 20 m of the first build.
   - **Chicanes join** (driver, 2026-11-19: "should the bus stop be one sequence?", then kept for every circuit). The
     Bus Stop and Monza's first chicane split at a real speed rise (8-15 km/h), not at the steering reversal: without
     the split they stayed two. A rise alone cannot tell them from a lift between two corners (Raidillon 6-11 km/h), but
     how much of the speed lost into the first turn comes back before the second can: chicanes 1-20%, separate corners
     40% and more. Two turns now join on a lap when no peak sits between them **or less than a third comes back**.
     Over every map: 410 sequences become 356, no start moves more than 10 m, native and replay still group alike. It
     joins, among others, the Bus Stop, T5-T6 and T12-T13 at Spa, Monza T1-T2, Interlagos T1-T2, Silverstone's
     Maggotts-Becketts-Chapel and Brooklands-Luffield, Imola T17-T18, Fuji T10-T12, Le Mans' Ford Chicanes with the
     Motul Turn. The steering split stays (it alone split only Spa Hypercar T5-T6).
   - **Review fixes, 2026-11-19.** The speed come back between two turns is read in track order, so a pair across
     the start line can join. A run of turns no lap slows for is held by the sequence before it as exit turns: every
     turn has a sequence (none of the 47 maps had such a run). A map's laps are the parser's clean dry laps of the
     replay's matched session, the replay's own flags only for a lap no session holds. Ingestion's corner work and a
     regeneration run one at a time; a map change rebuilds only the sequence passes. The 47 maps stand as built: the
     rule is not bumped, so they change only when regenerated or remapped offline.
   - **Settled, left as they are** (driver, 2026-11-19, after a second review): the `act(...)` warnings reported in
     the race replay view's tests (not reproduced in any run here); no guard for an empty map in a recheck (a map
     with no sequence cannot come from laps that drove every turn); a worker run with nothing to build (once per
     replay, when its "no map" key is first stored); the offline script needing a second run on a new database
     (ingestion builds a replay's turn passes, then its maps, in one go).
   - **First fill, 2026-11-19** (app closed, `tools/analysis/buildCornerPasses.ts`): 47 maps on 24 layouts in 21 s
     (356 sequences), then the sequence passes of all 540 replays in 327 s: 467,430 rows. A lap's sequence times add up
     to its lap time within 4-56 ms (median per layout; they start at the first sequence, not the line); 0.2-4.4% of
     laps differ by over 1 s, a stop or a spin inside a sequence. The driver's own laps group 244 of the 267 checked
     sequences as the map does; 65 starts sit more than 10 m from the map's (driving, as in the audit).
   - **Readers.** The card and the Consistency panel, then the session debrief, the inspector's Compare list and its
     map badges, the rival debrief and the AI report. The lap-versus-lap metrics (brake point, turn-in, trail braking,
     rotation, track usage, the entry/rotation/exit split) stay, because they need both laps' full traces, and take
     their windows from the class's map. The Consistency panel keeps the official turns for turn-by-turn detail, and
     the live gaps stay on the turn passes.
   - **Removed once every reader moved** (driver, 2026-11-19): the per-lap detection in `src/utils/cornerAnalysis/`
     (`findSpeedTurningPoints` and the corner building of `computeLapSegmentComparisons`), the "Corner N" numbering, and
     the debrief's and panel's mapping of an official turn to the detected corner at its apex.
   - **Check.** Each class's map drawn on the 2D map on Monza and Le Mans (fast kinks), Portimão (esses) and Sebring
     School (short turns), accepted by the driver's eye like the official turns. A class grouped wrongly changes the shared rule (for example a dip as a share of the
     entry speed), a per-class value only if no shared rule works.
   - **The card shows one entry per sequence** (driver, 2026-11-19): a chicane taken in one braking zone is one card,
     from where the speed drops to where it drops for the next sequence, with one time, minimum speed, gain and brake point. The per-turn times stay in the
     Consistency panel. Built 2026-11-19, the first reader (driver: "Card first"): the card reads the sequence passes
     (`corner-passes?segments=sequences`), each car its class's map; the gain ranks the car's sequences ("3rd of 5
     corners"), and a compare lap counts only through a sequence holding the same turns. A class without a map has no
     card on that track ("No class of this replay has a corner map on this track yet", or no pass for that car).
   - **The Consistency panel switches** (driver, 2026-11-19, chose a switch over sequences only or rows opening to
     turns): Sequences (default, the driver's class map, as the card) or Turns (the official turns, one by one), one
     switch in the panel's corner header, remembered. The AI report reads the same corners as the lap view (its sequences when the class has a map, else
     the turns), so a corner's repeatability counts that corner's own passes (review fix, 2026-11-19).
   - **The session debrief ranks sequences** (driver, 2026-11-19): "where the time goes" compares the best lap with the
     references through the class's sequences ("SQ3"); a reference pass counts only through a sequence holding
     the same turns. A class without a map on the layout keeps the official turns, and the note under the list says
     which it ranked.
   - **The lap view takes its corners from the map** (driver, 2026-11-19, "Whole lap view" over the Compare list
     alone): one corner list for the lap view (Compare list, telemetry corner strip and markers, map badges, handling
     balance, AI report). Each sequence of the lap's class is a window from its start to the next start, the lap's own
     slowest point inside as the apex, numbered in the layout's order; a class without a map gets the official turns
     as windows. Built 2026-11-19 (`GET /api/corner-sequences/layout`, `useLapSegments`, `lapCornerWindows`).    - **The rival debrief** (driver, 2026-11-19, "Rival debrief"): Compare laps' "where the time is" ranks your class's
     corners the same way (`loadLapPairDebrief` → `loadLayoutCorners`, the cached fetch the lap view shares), named
     as the map names them ("SQ5"); its links open the lap view on the same corner number. Built 2026-11-19.
   - **The AI report** (driver, 2026-11-19, "AI report"): its evidence carries each corner's name (`cornerLabel` on
     segments and priorities) and the prompt names corners by it, never by number (PROMPT_VERSION 9). Every reader has
     moved.
   - **Client detection removed** (driver, 2026-11-19, "Remove it"): `src/` no longer finds corners in a lap. The lap
     view, the rival debrief and the AI report need the layout's corners (without a centre line there are none, and
     the list says so); the session debrief and the panel number corners in the layout's order, so the telemetry
     fetch behind their links is gone. The speed-dip rule stays in `shared/domain/cornerSequences/` to build the maps;
     tests window their laps on its dips (`test/utils/cornerAnalysis/dipWindows.ts`).
   - **Sequences are numbered** (driver, 2026-11-19: "SQ1 SQ2 etc", everywhere, single turns too): every screen, the
     map badge and the AI report call a sequence SQ1, SQ2… in lap order (the lap view's corner number); the turns it
     covers ("T14–T15", "km 0.9") show on hover. Set where the sequences are served (`sequenceTurns`,
     `server/corners/sessionCornerPasses.ts`); the stored maps are unchanged. Official turns keep their names.

Later, on the same passes: the rival duel (two cars' segments over the same laps) and
[debrief corner tracking](DEBRIEF_CORNER_TRACKING.md) across sessions, which needs layer 1's stable segment numbers.
