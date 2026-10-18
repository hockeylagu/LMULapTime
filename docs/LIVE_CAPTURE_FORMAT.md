# App live capture: channels, storage and learning

Implementation reference, reviewed 2026-10-18 on `codex/live-session-evidence`.
For LMU's own exporter see [native telemetry](TELEMETRY_FORMAT.md): its DuckDB schema differs
from the app's supplemental capture schema described here.

## Recording and ownership

The app records player evidence while the backend and LMU are running with a loaded session,
independent of an open dashboard. Recording is gated by live lifecycle/replay state.
Files default to ignored `server/live-captures/`; `LMU_LIVE_CAPTURE_DIR` overrides that directory.
Each recording attempt owns one `*.live.duckdb` file with a unique recording ID.
An interrupted attempt resumes only with unambiguous continuity proof. If the exact layout is
temporarily unknown, recovery waits for it; samples during that wait remain a coverage gap.

Raw samples live in DuckDB. SQLite stores attachment/availability metadata and compact learning
examples, rather than a duplicate stream of motion samples. There is no automatic disk cap or
eviction. Close a recording before manually deleting its raw file or diagnostic sidecar.
Native telemetry, XML and replay files retain their existing ownership.

## Channels and clocks

Six verified vehicle-vector channels are normalized once to ISO 8855: longitudinal, lateral and
vertical velocity, plus roll, pitch and yaw angular velocity. The native-to-ISO vector rotation is
`(-z, -x, y)`. Channel definitions carry units and normalization provenance. Twenty-four reserved
wheel-channel columns remain NULL until verified; unavailable values never become measured zero.

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
| `capture_batches` | Persisted batch sequence/signatures for reliable writes |

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
read-only worker off track, and rechecks XML/link ownership and the exact requested lap after the read.
Reclassification or changed ordinal ownership invalidates the response.

Chart fusion matches verified samples to explicit trajectory clocks within 25 ms, without interpolating
across missing samples. Measured yaw and body slip use the capture; computed fallbacks retain the
`COMPUTED` label. Coverage is disclosed separately. Supplied native telemetry G values, including zero,
are preserved; replay-derived G remains a computed fallback.

## Disposable race diagnostics

Adjacent `*.diagnostics.jsonl` sidecars record existing REST requests/responses and errors, reader
failures, lifecycle, writer health and strategy context. Successful unchanged responses are deduplicated
with periodic checkpoints; response bodies and asynchronous buffering are bounded. Player filtering
avoids retaining the full opponent standings payload. Diagnostics add no REST requests.

A two-minute post-session tail supports transient-error investigation. Gzip is deferred until after
the session; a new active session defers pending compression. An already-running compression is not
cancelled. Crash leftovers remain available for investigation. Set `LMU_LIVE_DIAGNOSTICS=0` to disable.
Delete closed `*.diagnostics.jsonl.gz` files manually after the relevant race weekends; doing so leaves
DuckDB evidence and compact learning facts intact. No retention cleanup or cleanup UI is implemented.
The legacy `C:\Documents\lmu-live-captures` directory belongs to manual capture scripts and is unchanged.

## Consolidated strategy audit

Full estimate/selection/outcome checkpoints use recorder observations of kind
`strategy-audit-v1` inside the owning session DuckDB. They run without dashboard subscribers and
replace the older periodic `strategy-prediction` observation. Start, settings/estimate changes,
laps, measurements, finish and end retain the existing audit semantics, plus ten-second checkpoints.
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

No audit JSON/CSV endpoints, export UI, export workers or legacy fallback remain. The old SQLite
`live_strategy_audit` table/data was removed locally after approval of its inventory, and its store
and compatibility tests are removed. Fresh databases do not create that table; no automatic deletion
migration is shipped. Neither the learning pipeline nor live predictions depends on an export.

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
Training needs at least three sessions and 30 examples; held-out evaluation needs two later sessions
and 20 examples. A candidate must improve MAE by at least 5%, with no increase in p95 absolute error,
underprediction count or mean shortfall. Fuel and VE retain their separate units.

Report version 2 adds `calibration`: fitted candidate parameters, baseline/candidate errors, evidence
counts, exclusion gates and a per-cohort screening result. These fixed version-1 policy thresholds
are conservative engineering defaults, not a validated accuracy guarantee. Reusing a holdout to
select candidates makes it unsuitable as final independent acceptance evidence; validate on fresh
sessions before any activation. No parameters are persisted or applied to live advice.

Automatic learning runs after reconciliation/projection refresh, outside loaded sessions and open
writer handles. A read-only worker screens candidates, then persists fixed parameters, their exact
cohort and supporting-data signature in `live_learning_models`. Screening never activates a model.
Acceptance requires at least two sessions and 20 examples that started **after candidate creation**,
passing the same error gates. Backfilled historical sessions cannot serve as fresh acceptance.
The candidate is not refitted on acceptance data. Further off-track evaluations withdraw it if support
changes, acceptance evidence disappears or prospective error gates regress; replacements start validation again.

The live planner uses eligible active corrections, bounded to ±10%, over its rolling estimator/game
fallback. Lap-start training events still freeze the uncorrected baseline (version 3), preventing
recursive bias fitting; corrected advice/audits use model version 4. Resource/garage plans disclose
the baseline and applied adjustment, and dashboard source text identifies learned advice.
Exact layout, car, driver, XML patch, weather, compound and baseline source/version must match.
Because shared memory has no verified patch, runtime patch trust requires a verified completed capture
started during this observed continuous game run. Closing LMU clears trust; until a new result is
matched after restart, ordinary estimation applies. No last-known patch is guessed across game runs.

Worker work is cancelled at session load, bounded to 15 seconds, and discarded if SQLite changed
while it ran. Training failures clear the in-memory corrections. Unchanged data skips repeated
evaluation. All per-frame use is an in-memory lookup with no database reads. Set
`LMU_LIVE_LEARNING=0` before starting the server to disable automatic promotion/use; recording continues.
These implementation gates are engineering defaults; actual improvement and overhead still require
real-game acceptance. Audit checkpoints remain in the consolidated recording source;
real-game validation remains in the
[active plan](plans/LIVE_SESSION_EVIDENCE.md). The delivered foundation and original design are in the
[archived implementation record](plans/archive/LIVE_SESSION_EVIDENCE_FOUNDATION.md).

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
