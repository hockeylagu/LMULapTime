# App live capture: channels, storage and learning

Current implementation reference, reviewed 2026-10-18.
For LMU's own exporter see [native telemetry](TELEMETRY_FORMAT.md): its DuckDB schema differs
from the app's supplemental capture schema described here.

## Recording and ownership

The app records player evidence while the backend and LMU are running with a loaded session,
independent of an open dashboard. Recording is gated by live lifecycle/replay state.
Files default to ignored `server/live-captures/`; `LMU_LIVE_CAPTURE_DIR` overrides that directory.
Each recording attempt owns one `*.live.duckdb` file with a unique recording ID.
An attempt opens only once the player is in the car (`inRealtime`): garage menus and a finished
session's last frames produce no motion samples, so they create no file. A started attempt stays open
through garage visits. Garage-only REST reads (event schedule, garage data) made before the first drive
are therefore not in the recording; the live dashboard still uses them.
Recording starts immediately even when the exact layout is pending, using an `unresolved_` filename.
Once a completed attempt has a known layout, its worker checkpoints and closes the recording handle,
then replaces that prefix with the sanitized layout key. It updates the file's manifest and filename
metadata before acknowledging the new name to the SQLite index; recording ID and XML links stay intact.
If that rename fails (for example a locked file), the completed attempt keeps its `unresolved_` name.
Idle catalog discovery applies the same repair to existing completed files and recovers a process exit
between the physical rename and metadata update. Unknown layouts and resumable interrupted attempts
keep their existing filenames. Compressed diagnostic sidecars follow the completed name (see below).
An interrupted attempt resumes only with unambiguous continuity proof. If the exact layout is
temporarily unknown, recovery waits up to 10 s for it, then records a new file; samples during that
wait remain a coverage gap.

Raw samples live in DuckDB. SQLite stores attachment/availability metadata and compact learning
examples, rather than a duplicate stream of motion samples. There is no automatic disk cap or
eviction. Close a recording before manually deleting its raw file or diagnostic sidecar.
Native telemetry, XML and replay files retain their existing ownership.

Settings Overview reports **Live telemetry files** separately from native **Telemetry files**.
The live count uses available SQLite capture-index entries, including active and unlinked recordings;
missing files stop counting after reconciliation. It does not open raw DuckDB files on status requests.
All four source summaries use `[SQLite Cache] Synced <total> <source> (<new> new, <updated> updated) from <directory>`:
XML sessions, replays, telemetry DuckDB files and live telemetry DuckDB files. A nonzero rejected/deferred
file count adds `, <count> skipped`; unchanged cached files are not called skipped. The first live directory discovery
prints a summary, including `0 new, 0 updated` at startup. Overlapping startup/scan triggers suppress
repeated unchanged live summaries; new/updated files or a changed total still print. Startup discovery is
triggered after the XML/replay/native scan pass completes; the first reader answer only releases
that pass and does not independently scan the live directory. First writer acknowledgement of a new
or restored recording also prints the live summary; repeated recording checkpoints do not. Live discovery
compares persisted manifests and byte counts so unchanged rediscovery does not count as an update.

## Live dashboard and save pipeline

1. `server/index.ts` starts `LiveService` and its capture controller with the backend. Windows
   process checks run every 500 ms; the reader worker opens the rF2 scoring/telemetry mappings,
   reads at about 50 Hz in realtime and 1 Hz otherwise, and probes navigation every two seconds.
   Navigation confirmation gates recording; replay playback cannot supply live capture samples.
2. `LiveService` feeds deterministic session, timing, results and strategy trackers. Existing REST
   requests supply pit, garage, weather and resource context through a bounded, replay-aware poller.
   Process-query unavailability, network retries and game estimates remain supported degraded operation.
3. `/api/live/stream` sends snapshots, timing, pedal batches and heartbeats to the dashboard.
   Disconnects clear live timing/pedal buffers and reconnect. SSE client backpressure never blocks capture.
4. `capture/controller.ts` records independently of dashboard subscribers. It sends 50-sample batches
   or flushes once a second to `recordingWorker.ts`; sparse observations share the same bounded queue.
   DuckDB transactions commit samples, observations, manifest and the batch sequence together.
5. Session transitions finalize the owning recording before starting another. Shutdown requests an
   interrupted finalization; abrupt termination can leave only previously committed batches.
   Resuming an interrupted file requires exact identity, layout and lap-clock continuity proof; the
   file's stored sample/drop counters and end time win over a lagging SQLite index manifest.
6. After the loaded session ends, catalog discovery and XML reconciliation validate ownership using
   player, car, layout, session kind, timestamps and at least one matching completed-lap anchor (no timed lap may disagree).
   SQLite retains attachments/availability and compact learning facts. Off-track workers build and
   validate learning projections; lap-evidence readers recheck ownership before serving saved data.

The explicitly selected `?demo` dashboard and isolated performance harness remain development tools;
neither supplies substitute data to a connected dashboard.

### Shared-memory allocation and snapshot ownership

`sharedMemory.ts` keeps one private Koffi external view per open mapping. Counter reads retain native
uint32 loads; `readInto` copies into caller-owned buffers, and `read` still returns an independent
snapshot. Bounds and closed-handle checks run before accessing the view. No mapped view escapes to
consumers or crosses a worker boundary.

`rf2Decode.ts` reuses scoring and player-slot scratch buffers per mapping. The begin/end counters
must match before and after each copy; only an accepted copy is decoded. Scoring copies include
the header and declared vehicles without concatenating intermediate buffers. Player lookup tries
the remembered slot before scanning the other IDs without constructing a candidate array.
Decoded readings retain their own data across subsequent polls.

Car-condition objects are decoded at their existing 500 ms publication cadence. Capture rows wait
for navigation confirmation; pedals and tyre temperatures keep their existing cadence.

The reader writes capture rows straight into one packed buffer (`LiveCaptureRows`,
`capture/decode.ts`) instead of an object and array per sample. The 50 Hz dashboard frame no longer
carries capture data: the rows go to the main thread as a separate `capture` message whose buffer is
transferred, not copied, once the scoring changes (about 5 Hz), before any other reader notice, or at 25
rows. Each row therefore arrives before the scoring or navigation that follows it, and the main thread
gates it in the state it was read in. Terrain names and the last impact are compared on their raw
source bytes/values and decoded only for a row where they change, or on the car-rate checkpoint.
The controller still observes a row's sparse changes before validating its time. The writer's bounded batching and exclusive DuckDB ownership
are unchanged. See `tools/benchmarks/livePerformance/README.md` for the isolated allocation benchmark.

### Allocations during a loaded game session

The driving path also includes the recording worker, SQLite checkpoints, REST and SSE. These paths
retain bounded queues and independent message ownership; pooling never exposes an in-flight batch
to the producer. The following allocation controls apply:

| Stage | Allocation control |
|---|---|
| Controller → recording worker | Transfer the filled buffer directly, with a view describing the used rows. After a successful commit the worker transfers its storage back in the acknowledgement. The controller accepts storage only for an outstanding sequence, checks its size and caps the spare pool at six buffers. Pending batches cannot be overwritten; duplicate acknowledgements cannot return active storage to the pool. Sparse-only batches do not take a full sample buffer. |
| DuckDB numeric inserts | A single bounded workspace caches the last insert shape, its SQL string and fixed-size parameter array. Every parameter is overwritten before use; the serialized worker waits for the database call before reusing it. Row count or normalization-width changes replace the workspace. Transactions, NULL handling and sample indices remain authoritative. |
| SQLite capture index | Cache the checkpoint SELECT and UPSERT statements per database with a WeakMap. Each acknowledgement still reads current XML ownership and persists the full current manifest; it never trusts a cached ownership decision. |
| REST poller | Keep one request in flight and the existing replay safety checks, cadence and failure pauses. Compare parsed pit-menu state directly instead of creating JSON strings for change detection. Discard stale replies before domain parsing when no diagnostic sink needs them. HTTP failure excerpts stop concatenating after reaching their 8 KiB limit. |
| HTTP SSE | Serialize each broadcast once and share its string among writable clients. Skip serialization when no client can receive it. Blocked clients retain the existing drop-until-drain behavior and receive the newest snapshot on drain. |

Remaining allocations are intentional: worker message envelopes (the 50 Hz dashboard frame and
its pedal sample), one capture row buffer per reader batch,
manifest/observation serialization for durable provenance, native database bindings, REST body/JSON
parsing, and one JSON string per delivered SSE event. Recording diagnostics add bounded serialization
when enabled. Capture batching is still 50 samples or one second; no cadence was reduced to obtain
these savings. Startup, off-track catalog discovery and learning projection refresh are separate from
this driving path. The reader benchmark above does not quantify these additional changes; their
regressions cover storage ownership, multi-chunk writes, XML link withdrawal and SSE backpressure.

On the dashboard, stream messages update a last-received timestamp; one silence watchdog rechecks
the remaining deadline instead of replacing a timer per event. The interpolated lap clock checks
its published tenth before calling the React state setter. Pedal samples remain outside React state.

## Channels and clocks

The recorder keeps only the channels the app reads, 11 dynamics channels plus six raw hybrid values (below): ISO forward and left velocity (m/s) and yaw
rate (rad/s) for body slip, plus FL/FR/RL/RR patch and ground longitudinal velocity (m/s) for wheel slip.
The producer's left-handed local axes are left/up/back: forward velocity is `-z`, left velocity is `x`
and yaw rate is the axial `-y`. Wheel longitudinal is back-positive in the source and negated to
forward-positive. Patch velocity is not relabelled as wheel speed; the slip ratio is derived on read
(below). Nonfinite input becomes SQL NULL; valid finite zero remains zero. Batch rows have three
clocks/counters followed by the 17 values (20 float64 entries; 14 entries and 11 values in recordings of version 3 and older).

Version 1 had incorrect lateral/yaw signs: evidence reads correct those signs once without rewriting
the source and disclose `sourceNormalizationVersion: 1` alongside response normalization version 3.
Its wheel catalog stays unverified and its wheel columns unavailable. Versions 2 and 3 share the
verified catalog. Older versions remain readable; new attempts use version 4 and do not resume an
older-version file. On 2026-10-21 every existing recording was rewritten offline to the version 3 catalog.

Version 4 (2026-10-27) appends six raw hybrid channels, kept for validating the live deployment advice
(`strategy.deployment`, [checklist](plans/README.md#live-dashboard-and-learning)). They are stored as the
game reports them, in this order, with frame `raw` (no ISO frame, no sign convention); a car without a hybrid
system records zeros (non-finite floats are NULL):

| Channel | Source field | Meaning (rFactor 2, UNVERIFIED in LMU) |
|---|---|---|
| `battery_charge_fraction` | `mBatteryChargeFraction` (double) | Battery charge, expected 0..1 |
| `soc_raw` | `mSoc` (float) | State of charge, 0..1 or 0..100: which is unknown |
| `motor_map` | `mMotorMap` (u8) | Current deployment setting, an index 0..`motor_map_max` |
| `motor_map_max` | `mMotorMapMax` (u8) | Highest setting index; 0 on a car without a motor map |
| `electric_motor_state` | `mElectricBoostMotorState` (u8) | 0 unavailable, 1 inactive, 2 propulsion, 3 regen |
| `regen_raw` | `mRegen` (float) | Regenerated power; unit unknown |

The live app maps them best effort (hybrid when `motor_map_max > 0` or the motor state is not 0; charge percent
is `battery_charge_fraction * 100` when finite and in (0, 1], else `soc_raw`, x100 when at most 1). Raw hybrid channels are not part of the evidence reads:
the evidence contract stays at normalization version 3 (the app's `readRecording` keeps its own constant), so it
lists only the ISO channels. Version 1 to 3 catalogs are unchanged.

### Dropped channels (available for future analysis or coaching)

The shared-memory telemetry slot (`server/live/rf2Layout.ts`) still exposes these fields; they were
recorded until 2026-10-21 and removed because nothing read them. Re-adding one means a catalog entry in
`capture/channels.ts`, a decode line in `capture/decode.ts` and its sign convention below.

| Channel | Source field | ISO convention and caveat | Possible use |
|---|---|---|---|
| `velocity_up_mps` | `localVel.y` | Up-positive, unchanged | Jumps, compressions |
| `roll_rate_radps`, `pitch_rate_radps` | `localRot.z`, `localRot.x` | Roll `z`, pitch `-x` (axial vector, handedness change) | Kerb strikes, bumps, weight transfer |
| `{fl,fr,rl,rr}_patch_lateral_mps`, `_ground_lateral_mps` | `lateralPatchVel`, `lateralGroundVel` | Already left-positive | Measured under/oversteer per axle (front vs rear lateral slip) |
| `{fl,fr,rl,rr}_tyre_vertical_deflection_m` | `verticalTireDeflection` | Metres, a scalar compression distance (not suspension travel), no sign transform | Tyre load, kerb strikes, bottoming |
| `{fl,fr,rl,rr}_camber_rad` | `camber` | Outward-positive on both sides (ISO camber, not a signed roll angle) | Dynamic camber under load |
| `{fl,fr,rl,rr}_toe_rad` | `toe` | Toe-in positive: keep the source on left wheels, negate on right; includes steering, not the garage setting | Steering/toe analysis |

Measured on the 2026-10-21 recordings, each dropped channel cost about 3.5 MB per driving hour after
DuckDB compression; a recording now takes about 77 MB per driving hour, observations included.
Producer definitions: [rF2 shared-memory wheel contract](https://github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin/blob/master/Monitor/rF2SMMonitor/rF2SMMonitor/rF2Data.cs).
Saved-frame decoder/writer tests verify persistence, not independent physical calibration. Historical
C# JSONL rounded values and replaced nonfinite input with zero, so a recorded zero alone is not proof
of a valid physical zero. Current live normalization preserves the distinction above. Controlled
wheel-frame/setup comparisons remain in the [work queue](plans/README.md#live-dashboard-and-learning).

Additional shared-memory evidence is sparse:

| Observation kind | Stored data and meaning |
|---|---|
| `impact` | `impactElapsedSeconds` and native `magnitude`; observation elapsed time is the source impact time, receipt time is retained separately. Repeated state is suppressed; equal magnitudes at different impact times remain distinct. Nonfinite/negative magnitude is NULL, not a fabricated zero. Magnitude units are not assigned without evidence. |
| `upgrade-pack` | Player scoring's exact 16-byte `rawHex`, including zero bytes; initial state and configuration changes. Contents remain opaque. |
| `terrain-material` | Session-file dictionary definition `{materialId, rawName}`, untimed and recorder scoped. Raw names preserve all 16 source bytes up to NUL using Latin-1, including commas/truncation. |
| `car-condition` | `{fuelCapacityLitres, dents, detached, lastImpactEt, compound}`: eight body-zone dent severities (0-2), detached parts, last contact time and tyre compound. Recorded at the start and on change only; fuel level is not repeated here (the learning events hold it). |
| `terrain-change` | Initial state and changes `{corner, materialId}` at the sampled game elapsed time, with FL/FR/RL/RR indexing. An empty source name becomes a NULL material reference. |

The reader worker sends sparse-state changes at capture cadence and small car-rate checkpoints
(about 2 Hz) so new recordings recover initial state. The controller suppresses duplicate persisted
events. Terrain interning runs in the DuckDB writer transaction, reuses definitions after restart and
stores each name once per recording. Last-impact memory is state, not an impact history queue:
multiple impacts between observed source updates cannot be reconstructed.

Sparse observations retain source semantics: shared-memory condition/state, existing REST responses
and recorder events. This supports damage/repair estimates, weather, pit/garage context and learning
events without claiming that every observation is an independently verified measurement.
REST estimates do not prove that a repair was actually completed.

Motion uses game elapsed seconds and lap-start anchors, following native telemetry alignment.
REST observations retain request/receipt wall-clock bounds; untimed responses stay session scoped.
The aligned reader does not fabricate timing or fill capture gaps.

## DuckDB schema and bounded capture

Schema and normalization versions are stored explicitly. The tables are:

| Table | Purpose |
|---|---|
| `capture_metadata` | Schema, source and normalization metadata |
| `capture_manifest` | Recording identity, lifecycle, anchors and verified XML ownership |
| `capture_channels` | Channel order, units and provenance |
| `capture_samples` | Typed columnar motion samples and game/lap clocks |
| `capture_observations` | Sparse source observations and versioned learning events |
| `capture_batches` | Committed batch sequence and sample count (a repeated or older sequence is rejected) |

The controller batches samples for a worker-owned writer. Four normal pending batches plus two
reserved initialization/finalization slots share the same six-batch FIFO, including batches containing
only observations. Link/catalog commands have a separate bounded maintenance queue.
Backpressure is reported through health and dropped-sample counters; capture never waits synchronously
for disk writes on the live sampling path. Memory bounds are not disk-retention quotas.

## XML attachment and app consumption

Reconciliation requires unique compatible layout/session/player/car identity and completed-lap timing
anchors. A verified attachment inherits `GameVersion` from the results XML; it is unknown before then.
Existing immutable XML ingestion rules are unchanged. Ambiguous or stale links cannot supply evidence.

`GET /api/live/capture` exposes capture health/channel metadata. Session detail exposes `liveCaptures`.
`GET /api/session/:sessionId/live-evidence` selects exact driver/lap ordinals, reads through a bounded
read-only worker off track (two at once, two more queued), and rechecks XML/link ownership and the exact
requested lap after the read. While the recorder still has a file open it answers `busy` without reading.
Reclassification or changed ordinal ownership invalidates the response.

Chart fusion gives each trajectory point the nearest verified sample within 50 ms (half the 100 ms gap
rule, so it holds at any capture rate; replay and live clock anchors must still agree within 25 ms), without interpolating
across missing samples. Measured yaw and body slip use the capture; computed fallbacks retain the
`COMPUTED` label. Coverage/provenance remains in response metadata; the telemetry header has no capture-coverage indicator. Supplied native telemetry G values, including zero,
are preserved; replay-derived G remains a computed fallback.

Wheel slip (`shared/domain/live/wheelSlip.ts`) is the longitudinal slip ratio `-patch / ground` per
wheel, SAE sign: negative braking/lockup, positive wheelspin. It is NULL below 5 m/s ground velocity
(airborne, slow or reversing wheel). Lockup and wheelspin events are spans beyond ±15 % lasting at
least 40 ms (two or more samples at the 25–50 Hz capture rate), detected on every live sample of the lap, merged across measured
dips under 100 ms (one dipped sample at the slowest 40 ms interval) and never across a missing sample or capture gap. The threshold comes from the
2026-10-20 COTA GT3 race: while native ABS was active, front slip was 6 % median, 8.7 % p90 and
10.7 % p99. On the 2026-10-22 Portimão LMP3 race (no ABS) hard-braking front slip stayed within
-5.6 % at p1 and real lockups jumped straight past -18 %, so the cutoff holds without ABS too; `tools/analysis/listWheelSlipEvents.ts`
reruns the detection over the saved recordings. Native `Wheel Speed` cannot replace this: it tracks
ground speed within ±4 % even under braking. Where a chart point has measured slip, its lockup flag
follows the measured events instead of the G-based inference. The Wheel Slip chart channel has no
computed fallback.

## Disposable race diagnostics (opt-in)

Adjacent `*.diagnostics.jsonl` sidecars record existing REST requests/responses and errors, reader
failures, lifecycle, writer health and strategy context. Successful unchanged responses are deduplicated
with periodic checkpoints; response bodies and asynchronous buffering are bounded. Player filtering
avoids retaining the full opponent standings payload. Diagnostics add no REST requests. Nothing kept elsewhere
is repeated: the player's standings row drops `carPosition`/`carVelocity`/`carAcceleration` (100 Hz in the
recording), the tyre screen drops its copy of the pit menu (logged from its own read), the reader's game-state
probe keeps its body only for an error or unreadable reply (the pit poller logs the same reply), `strategy`
records omit the MFD fuel ratio choices, and `capture-health` is written when the writer's state, error, drops
or backlog change (plus the 60 s checkpoint), not for the growing sample count. Recordings of 2026-10-27 may hold `hybrid`
records (the raw hybrid fields on change), since removed once the Spa practice confirmed the decode; the capture
channels keep the same values.
Recordings of 2026-10-25 may hold three validation records, since removed: `standings-check` (each standings
reply beside shared memory VE, fuel, pit state and penalties), `lmu-fields` (the other raw LMU fields of
`InternalsPlugin.hpp`) and `tyre-check` (condition reply tread beside `mWear`). They settled the shared-memory reads
the app now uses instead of the standings call: `mVirtualEnergy` is the standings' `veFraction`, `mNumPenalties` its
`penalties`, `mWear` the tread left, and `mPitState` reads 4 in the box and 0 down the pit lane (`rf2Decode.ts`).
Older recordings also hold `standings` REST observations; new ones do not.
`lap-timing` records producer output at most once per second: timing fields, the atomic
`lapEstimate` (seconds, reference seconds, delta seconds and distance/sector source), subscriber
count and source session/lap clocks and distance. This does not confirm browser receipt. The
estimate is delivered in the timing event; clients do not rebuild it from snapshot session best.
The timer and distance-reference timestamps use `currentEt - lapStartEt`, not the engine's
estimated `timeIntoLap` (retained only as raw diagnostic evidence). Initial out-laps use elapsed
game time since observed movement away from the departure position, never a learning/reference lap.

A two-minute post-session tail supports transient-error investigation. Gzip is deferred until after
the session; a new active session defers pending compression. The compressed sidecar takes the
completed recording's layout filename; an uncompressed leftover keeps its `unresolved_` name. An already-running compression is not
cancelled. Crash leftovers remain available for investigation. Sidecars are opt-in: turn on
*Write a diagnostic file with each recording* in Settings → Live dashboard (from the next session;
failures are always saved in the recording, see below).
Delete closed `*.diagnostics.jsonl.gz` files manually after the relevant race weekends; doing so leaves
DuckDB evidence and compact learning facts intact. Automatic cleanup is deferred until real-race
stability is established; no retention cleanup or cleanup UI is implemented.
Active-session reader failures go to the sidecar without a duplicate console warning; reader failures
before a session sink exists and failures of the diagnostic writer itself remain operational console errors.
Failed game REST reads and reader restarts are also saved in the recording itself as `failure`
observations (path and outcome), so a race can be analysed later from DuckDB alone. If the recording
itself stops, the dashboard status slot shows **NO REC** (demo scenario *Recording stopped*).
Recording, learning and diagnostics steps run under one guard in the live service: if one throws, the
recording for that session stops (one console warning, NO REC) and the dashboard keeps updating.

## Consolidated strategy audit

Full estimate/selection/outcome checkpoints use recorder observations of kind
`strategy-audit-v1` inside the owning session DuckDB. They run without dashboard subscribers and
replace the older periodic `strategy-prediction` observation. Start, settings/estimate changes,
laps, measurements, finish and end retain the existing audit semantics. There are no periodic
checkpoints.
The controller ends the old audit before switching files. A recovered recording keeps its recording
UUID; use `observation_id` to distinguish checkpoints across tracker restarts because the tracker’s
local `data.sequence` counter can restart.

Inspect a closed recording directly with a read-only DuckDB connection:

```sql
SELECT observation_id, elapsed_seconds, received_at,
       json_extract_string(data, '$.reason') AS reason, data
FROM capture_observations
WHERE source = 'recorder' AND kind = 'strategy-audit-v1'
ORDER BY observation_id;
```

The JSON payload contains the captured snapshot, usage observations and any forecast/actual
comparison. It is diagnostic context; permanent frozen learning events and compact examples remain
separate. Disposable REST/error sidecars can be deleted without removing these checkpoints.
Deleting a closed DuckDB recording removes its audit history; eligible compact learning facts can
survive separately under the normal invalidation rules.

No audit JSON/CSV endpoints, export UI, export workers or SQLite audit compatibility layer remain.
Fresh databases do not create `live_strategy_audit`; no automatic deletion migration is shipped.

## Learning: implemented scope and remaining gates

Versioned events freeze fuel/VE forecasts at lap start and pair them with independently measured
outcomes, without requiring a dashboard client. An off-track worker validates events; the coordinator
rechecks canonical XML/link state before building deduplicated compact SQLite examples.
Eligibility excludes stale/ambiguous ownership, unsuitable lap classification, incompatible source
versions and missing predictions. Deleted raw recordings do not automatically delete valid compact
facts; subsequent canonical changes can invalidate them. Old recordings without forecast events
cannot retroactively supply a valid frozen prediction.

`npm run learning:evaluate -- <sqlite-path> <holdout-fraction>` reads an existing SQLite snapshot.
With no arguments it uses `server/lmu_cache.db` and a 0.25 holdout. Start the updated backend first if
learning storage is not initialized. Evaluation keeps whole sessions in chronological partitions,
separates fuel/VE metrics and exact compatible layout/car/driver/patch/condition/compound/model cohorts,
and compares frozen predictions to measured consumption. Bias is predicted minus actual.

The CLI also fits an offline correction candidate using earlier sessions only. For each exact cohort
and resource, it takes the median of each training session's `actual - predicted` residuals, then
the median across sessions. Equal session weight prevents one endurance race from dominating.
The adjustment is shrunk by `trainSessions / (trainSessions + 3)` and capped to ±10% of each forecast.
Training needs at least three sessions and 15 examples; held-out evaluation needs two later sessions
and 10 examples (policy version 2; version 1 asked for 30 and 20). A candidate must improve MAE by at least 5%, with no increase in p95 absolute error,
underprediction count or mean shortfall. Fuel and VE retain their separate units.

Report version 3 includes calibration parameters, baseline/candidate errors, evidence counts,
exclusion gates and automatic model status. These fixed version-1 policy thresholds are engineering
defaults, not a validated accuracy guarantee. The CLI is read-only; the automatic lifecycle below
owns persistence and activation, with fresh sessions required for acceptance.

Automatic learning runs after reconciliation/projection refresh, outside loaded sessions and open
writer handles. A read-only worker screens candidates, then persists fixed parameters, their exact
cohort and supporting-data signature in `live_learning_models`. Screening never activates a model.
Acceptance requires at least two sessions and 10 examples that started **after candidate creation**,
passing the same error gates. Backfilled historical sessions cannot serve as fresh acceptance.
The candidate is not refitted on acceptance data. Further off-track evaluations withdraw it if support
changes, acceptance evidence disappears or prospective error gates regress; replacements start validation again.

The live planner uses eligible active corrections, bounded to ±10%, over its rolling estimator/game
fallback. Lap-start training events still freeze the uncorrected baseline (version 3), preventing
recursive bias fitting; corrected advice/audits use model version 5 (4 before 2026-10-22: reserve kept at
the finish, laps left at the class leader's pace without the planned stop, the pit timer for a stop made now). Resource/garage plans disclose
the baseline and applied adjustment, and dashboard source text identifies learned advice.
Exact layout, car, driver, XML patch, weather, compound and baseline source/version must match; weather
uses the training rule (wet from `RAIN_WET_MIN`), not the planner's drying hysteresis.
Because shared memory has no verified patch, runtime patch trust requires a verified completed capture
started during this observed continuous game run. Closing LMU clears trust; until a new result is
matched after restart, ordinary estimation applies. No last-known patch is guessed across game runs.

Worker work is cancelled at session load, bounded to 15 seconds, and discarded if SQLite changed
while it ran. Live lookups always serve the corrections last committed to SQLite, so a discarded or
failed refresh keeps them; a learning failure never stops capture link synchronization. Unchanged data skips repeated
evaluation. All per-frame use is an in-memory lookup with no database reads. Set
`LMU_LIVE_LEARNING=0` before starting the server to disable automatic promotion/use; recording continues.
These implementation gates are engineering defaults; actual improvement and overhead still require
real-game acceptance. Audit checkpoints remain in the consolidated recording source;
real-game validation remains in the
[active plan](plans/README.md#live-dashboard-and-learning). Current module ownership is described in the
[current implementation map](CODE_MAP.md).

## Learning readiness in Settings

Settings → **Learning** runs only when **Check evidence** is pressed.
It shows automatic learning configuration and active/validating correction counts, usable measurements,
verified recording counts, failed/pending processing, unavailable raw
files, separate fuel/VE earlier/later counts, offline matching-group results and readable exclusion
reasons. Expand the minimum-evidence section for policy requirements and unmet checks. The checked
time identifies the snapshot; refresh manually after ingestion completes. Passing offline checks
alone never enables corrections. Recording, fitting, prospective acceptance and withdrawal run
automatically without this button; it only refreshes the displayed status. Available corrections
still require current-run patch trust and an exact live match before use.

`GET /api/live/learning` supplies this compact status from the same canonical evaluation as the CLI.
It returns aggregate counts and reasons. The audit checkpoints remain available directly in DuckDB.
The server defers work while a game session is loaded or capture writer handles remain open. A new
session or client disconnect cancels an in-flight check. Evaluation uses one independent read-only
SQLite worker, a consistent transaction, the existing 100,000-example bound and a 15-second timeout;
no recording file is opened, and no report is persisted. Busy/time-out errors offer manual retry.
Opening Settings does not start a check or recurring requests. All live predictions stay unchanged.
