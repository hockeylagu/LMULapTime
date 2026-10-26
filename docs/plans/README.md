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
- [Further replay preparation](proposed/REPLAY_STORAGE_DESIGN.md): storage size takes priority; measure
  before revisiting prepared views or grouped columns.
