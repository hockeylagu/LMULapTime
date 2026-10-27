# Work queue

Reviewed 2026-10-25 against source, Git and existing observations; no new real-game acceptance was run.
Current implementation belongs in [CODE_MAP](../CODE_MAP.md), not in completed delivery plans.

## Corner comparison

[Corner-map design](CORNER_COMPARISON_REWORK.md) remains a substantial unfinished plan on the
separate `corner-map` worktree. At review it is `b2a5c44f`, not an ancestor of main. Read that
worktree's current handoff before continuing; do not restart completed metric/map phases or infer
visual acceptance from implemented code. Remaining work includes M2 metric/sequence revalidation,
M3 inspector acceptance and shared consumer integration. Preserve the separate `debrief-first`
worktree; its overlap has not been assessed here.

## Live dashboard and learning

Capture, learning lifecycle and the dashboard are implemented. [Live capture format](../LIVE_CAPTURE_FORMAT.md)
owns channels, schema, clocks, recording ownership and correction gates; it supersedes old inventories.
Keep these outstanding checks separate from implementation status:

- Drive a normal practice/qualifying/race weekend; check session transitions, pause/garage/timing-line
  behavior, HUD/sector agreement, genuine service/refuel/tyre changes and replay isolation.
- Check the passive page from the seat on the 27-inch 1440p display at 50+ inches, including pit
  instructions, class-relevant fuel/VE targets and the full-width pedal trace. Exercise wet-track and
  online forecast states; unobserved states remain untested.
- Verify recording with no dashboard and after reconnect. In isolated private practice/test fixtures,
  check backend recovery and writer failures: bounded queues, readable committed data, explicit gaps
  and strict continuity before resuming. Never fault-inject during a race or write to active recordings.
- Check current wheel channels against native telemetry and producer definitions, accounting for
  corner order, source cadence, finite/unavailable values and normalization version. Reintroduced
  camber/toe/deflection/lateral channels need physical frame/units validation, not just nonzero values.
- Compare game frame-time/CPU/disk with and without capture using matched conditions. Synthetic
  benchmark headroom and zero reported drops do not establish actual game overhead.
- Collect multiple independent compatible sessions and run `npm run learning:evaluate`. Check exact
  cohorts, chronological holdout, prospective improvement, current-run XML patch trust, activation,
  fallback and withdrawal. Offline holdouts alone do not prove real-world correction improvement.

For each acceptance run, identify commit, game/XML patch, exact layout/car/driver/compound and
recording IDs; record what passed and what remains. Keep a concise conclusion with the requirement,
not a permanent per-drive report. Damage/weather learning and automatic recording eviction remain
separate future work; diagnostic deletion is manual.

### Tyre follow-up

Per-wheel learned garage wear and live `mWear` tread are implemented (`70591550`, `5b976287`), with
one-session practice acceptance. Review the next race using
`npx tsx tools/analysis/evaluateTyreWear.ts`: preserve per-wheel/cohort isolation, the Portimao
regression within 0.02 of actual flag tread and comparison against the old rule. Check no condition
request at plain lap crossings and native/live per-wheel agreement within 0.001 per lap. Incident
wear is already in current tread; do not extrapolate a spin as ordinary lap wear. Wet wear,
fresh-tyre pace and two-tyre changes are not part of this delivered scope.

### Agreed next direction, not fresh delivery claims

Prioritize deterministic saving targets (finish reserve versus avoiding a stop), fuel-ratio guidance
for VE cars, tyre/set coverage and MFD-versus-intended service checks, including early/emergency
stops and penalties. Retain insufficient-confidence states. Post-qualifying, pre-race and post-race
screen refinements remain proposals: qualifying results may be provisional, garage settings should
be checked against targets, and official XML owns final results. Multi-stint comparison and duplicate
nearby-car traffic views are deferred. Strategy speech remains a demo-only experiment; do not
silently enable it in the real dashboard.

### Offline preview

Open Settings -> Live Dashboard -> Open demo, or `#/live?demo=1` after the URL hash. It uses production
components with labeled sample data; it checks presentation, not ingestion or strategy validity.
Inspect normal, pit, damage, unavailable, session-transition and finish states through the scenario
selector. Keep cockpit feedback authoritative over screenshot approval.

Hypercar deployment advice is built live (2026-10-27): in race, practice and qualifying, for a hybrid car, never in the garage
(`strategy.deployment`, `shared/domain/live/energy/`). In a race it replaces the mid-stint fuel-ratio column of the plan with a
signed adjustment, the current → target setting, battery charge and the time until it reaches the range edge; the ratio then rides
with the next stop's MFD values (`MFD · RATIO 0.95`). In practice and qualifying the timing row takes the race plan's columns: estimated lap, then delta, session best (laps left in qualifying) and the same deployment cell side by side, each on the race cell's lines; without a battery the two timing blocks are centred (driver, 2026-10-27). As
the pit approaches, refuel/ratio, tyres and stop time take over the race columns. In the demo, the Hypercar class adds the advice to race, practice and qualifying scenarios on track: sample laps
shaped on the Spa practice (map 2 of 0..10, charging) run through the same controller and the real views.

**Controller.** `DeploymentGuidance` reads every scoring reading (about 5 Hz, with the car reading of the last 0.5 s), over
an explicit ascending list of allowed settings, and picks the adjacent one (non-uniform steps included, endpoints
respected). Inside a lap the charge swings far more than it changes over one (Spa practice 2026-10-27: 52% at the line,
6% before the next one), so trend and level always span exactly one lap of track: the rate is the charge now against the
same track point one lap ago, the level is the time-weighted average over that lap. Its goal is a long edge-to-edge cycle,
not holding 50%: deplete on one setting until the lap average nears the 20% edge, charge on the next lower one up to the
80% edge, then switch back (8-30 laps between changes in simulation). The advice comes the moment the lap average is one
lap from an edge at the current rate, anywhere on the lap, and latches one adjacent target until a change is observed;
ignored advice withdraws once the lap average is back inside 30-70% with the edge more than two laps away. The detail line
shows the time until the edge (`BATT 62% · 80% IN 7:00`), and the note counts down to the next change (`60 kW IN 5:00`, `MAP 3 IN 5:00` without a plugin list,
the time until it is advised) in the last 3 laps before it (driver chose the clock over laps, 2026-10-27). A changed setting clears the measurement and waits one full lap of track on the new setting.
Readings that do not move forward (lap distance dips below zero just after the line) are skipped; a jump of half a lap
and the pit lane start the measurement again. These margins are tuning, not calibrated vehicle limits (driver confirmed
20-80%, 2026-10-27, and asked for the faster continuous reaction the same day). Replayed over the Spa practice recording
it advised map 2 → 3 at 647 s, mid-lap, where the lap-boundary version only counted down at the 685 s line.

**Feeding it.** `LiveStrategyTracker` passes `DeploymentTracker` every scoring reading (session clock, distance driven,
lap length, pit lane) with the battery charge and the current setting of the latest car reading. Only the pit lane breaks
the measurement; yellow, safety-car and invalid laps count, unlike fuel/VE use (`lapExcluded`). The settings are the data plugin's `deploymentKw` for the car
([plugin setup](../PLUGINS.md)) when its length is `motorMapMax + 1` (index i is `deploymentKw[i]`), shown in kW; otherwise
the game's map positions 0..`motorMapMax`, shown as `MAP 6 → 5`. Never treat a map index as kW without the list. A new
session or car starts a fresh controller. Measuring or missing data shows no adjustment; a car with no battery charge (no hybrid system, even a Hypercar such as the Valkyrie, Glickenhaus or Vanwall) gets no deployment section at all.

**Mapping (confirmed in the Spa practice, 2026-10-27, Peugeot 9x8).** The decode (`rf2Decode.ts`) reads rFactor 2's
telemetry fields: `motorMap` is the setting, 0..`motorMapMax` (10 on the 9x8, higher deploys more); `batteryChargeFraction`
(0..1) and `soc` (percent) carry the same charge; `electricBoostMotorState` reads 1 inactive, 2 propulsion, 3 regen (4 once
at the start). Raw values stay recorded (capture channels `battery_charge_fraction`, `soc_raw`, `motor_map`,
`motor_map_max`, `electric_motor_state`, `regen_raw` from recording version 4, [format](../LIVE_CAPTURE_FORMAT.md);
the `hybrid` diagnostics record served the Spa check and is removed). Still open:

1. That map i shows `deploymentKw[i]` on the MFD. The lists come from the game's motor files since plugin personal-v18
   (9x8: map 2 is 40 kW, map 3 60 kW); the next hybrid session should read kW on the dashboard and match the MFD. The
   negative `regen` minimum shrinks with the map (map 2 about -39, map 3 -59, higher -137): possibly the motor's kW at
   the moment, unconfirmed.
2. A GT3 gets no `hybrid` and no deployment cell (not driven since).
3. The advice over a long stint: switch timing near the 20/80% edges. The in-lap low can sit far below the lap average
   (Spa: 6% with a 30% average), which the 20% edge on the average does not guard.

The voice call ("Set deployment 40.") is planned in [Live voice calls](proposed/LIVE_VOICE_CALLS.md), not built.

VE remains measured independently. The [official energy guide](https://guide.lemansultimate.com/hc/en-gb/articles/13152376674191-What-is-Virtual-Energy-NRG)
describes VE as a combined allowance and hybrid power as replacing combustion power while reducing
fuel use. Do not infer a fixed VE saving/penalty from a deployment-map change. Compare observed VE
and fuel per clean lap after settling, controlling layout, car, conditions and pace; only then use
that evidence in the next-stop load and fuel-ratio estimates. The deployment advice makes no VE effect claim.

## Peripheral acceptance

The optional Simagic integration is implemented; [plugin setup](../PLUGINS.md) owns operation.
The remaining hardware gate is one real LMU + SimPro event: the mapped wheel switches at most once
in its first garage, only if different; qualifying, race, garage returns and reconnects do not cause
another automatic switch. No track/replay/demo writes; no wheelbase switching. Suggest never touches
hardware. Confirm absent/disconnected devices, rejected/unknown readback and missing/renamed presets
are visible without automatic selection retries or blocking recording. Apply remains an explicit
Settings action, refused on track. Existing fake-plugin tests do not replace this hardware event.

## Analysis backlog

- Reconcile class/overall ranking, sorting and gain in session standings; test differing class and
  overall gains and unknowns. Review canonical class identity through `shared/domain/lapPlaces.ts`.
- Verify keyboard/focus/Escape layering in session detail and fullscreen replay with real recordings.
  The user deferred 200% zoom acceptance on 2026-10-10. The removed turn selector is not a pending task.
- Profile broad count/special-best work in `server/core/sessionSummaries/comparisonQueries.ts` with
  paired query plans and matching datasets; preserve condition/eligibility distinctions and bounded hydration.
- Measure cold/warm startup, track-package validation and telemetry preparation before changing
  cache retention. Keep work guards that prevent duplicate I/O or protect source ownership.
- Do not replace `sameCar` in leaderboard/reference-lap logic with equality until all relevant model
  producers demonstrably share canonical exact identity; resolve differences at source boundaries.
- Pit repair benefit remains an inference limitation pending trustworthy recorded evidence.

## Unstarted proposals

- [Simplified 3D replay](proposed/REPLAY_3D_PLAN.md): validate one exported scene and replay pose first.
- [Live voice calls](proposed/LIVE_VOICE_CALLS.md): call catalogue, anti-distraction rules and iterations;
  driver decisions first (Crew Chief overlap, voice, naming).
- [Wet/dry tyre crossover](proposed/LIVE_TYRE_CROSSOVER.md): when to box for wets or slicks, on the
  dashboard and as a call; needs one wet session to calibrate.
- [Further replay preparation](proposed/REPLAY_STORAGE_DESIGN.md): storage size takes priority; measure
  before revisiting prepared views or grouped columns.
