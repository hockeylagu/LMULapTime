# Normalized session storage

Status: phases 0, 1, 2, and 3a implemented 2026-10-10 (`server/core/sessionRows/`, `server/core/sessionSummaries/cards.ts`); phase 3a done (targeted updates in `sessionRows/targeted.ts`), phase 3b (conversion) and 3c planned. Follows [PERSISTED_SESSION_SUMMARIES.md](PERSISTED_SESSION_SUMMARIES.md), which
computes per-session facts at ingestion but still keeps the session itself, its card and a second copy
as JSON on the `sessions` row.


## Why

Every session is stored three times as JSON on one row:

| Column | Holds | Problem |
|---|---|---|
| `data_json` | the whole `DetailedSession` | large; every column added after it (`summary_json`, revisions, layout) is read by walking its overflow pages |
| `metadata_json` | the session without `drivers`, the player's laps included | a second copy that every link, telemetry and rename update must rewrite in step |
| `summary_json` | the card | duplicates columns; search, sort and progression read it with `json_extract` |

Measured read-only on the local cache (992 sessions): `data_json` averages 149 KB, the largest is 2.3 MB,
149 MB of session JSON in all. In the largest session (54 drivers, 1,517 laps) lap traffic is 28% of
the JSON and driver/lap event lists 27%. Across the library, 99.7% of a driver's events are also stored
on their lap; no lap event is missing from its driver's list; 2,360 driver events have no lap number.

Current JSON access (inventory, 2026-10-10): 9 `json_extract` calls (`$.weatherInfo`, `$.settings`,
`$.playerDriver.name/.position/.bestLapTime` on `summary_json`; `$.matchingReplayFile`, `$.duckdbFilename`
on `metadata_json`), and about 15 functions that parse a whole column to change or read one field
(`dbSessionStore`, `dbSessionConditions`, `dbReplayIdentity`, `dbReplayLinkStore`, `dbReconciliationStore`,
`sessionSummaries/*`).

## Goal

The session is stored as rows and columns, once. No session JSON remains: reads select the columns they
need, updates change the rows they concern, and the session page assembles one `DetailedSession` from
its rows. Out of scope: `replay_metadata.metadata_br`, `telemetry_metadata.metadata_json` and
`reference_laptimes.data_json` (separate subsystems, separate decision).

## Schema

Source facts (written by the parser and the ingestion steps) are kept apart from derived facts (rebuilt
when a rule version changes). Keys are ordinals, never names or lap numbers (neither is unique).

| Table | Key | Columns |
|---|---|---|
| `sessions` | `id` | file, path, mtime, size, timestamp, venue, course, event, length, time string, type, name, weather info/condition/time of day/string, game version, drivers count, total laps count, `settings_*` (one column per `SessionSettings` field), best session lap (driver, car, time, string), `player_driver_ordinal`, `duckdb_filename`, layout key, session kind, empty flag, revisions |
| `session_recordings` | `session_id` | the replay link (0 or 1 per session): `recording_name`, path, size, event title, split, event type, duration, rain, max rain, weather, ambient/track temperature |
| `drivers` | `driver_id` | the exact driver name (UNIQUE) and its normalized form; a name is a key, never a person |
| `vehicles` | `vehicle_id` | the raw XML car type and car class (UNIQUE pair; a NULL part is an absent value) |
| `teams` | `team_id` | the team name (UNIQUE) |
| `session_drivers` | `(session_id, driver_ordinal)` | `driver_id`, `vehicle_id`, `team_id` and every other `DriverData` scalar: car number, positions, best lap and sectors, theoretical best, averages, fuel/VE estimates, grid and gains, finish status, DNF reason, counts, strings; plus the derived columns of the projection (`is_human`, `is_player_driver`, `driver_class`, completed/clean laps, driving time, pit count, max speed, best lap ordinal/number, clean average, top-three average, consistency, `best_lap_is_wet`) |
| `session_laps` | `(session_id, driver_ordinal, lap_ordinal)` | the derived eligibility columns of the projection (`condition_group`, `is_clean`, `is_representative`, `is_human`, `leaderboard_eligible`, with their partial indexes) and every `LapData` scalar: number, position, time, sectors, top speed, four compounds, tyre wear (5 columns), fuel and VE, elapsed, pit duration, gap, flags (pit, out-lap, valid, inferred), non-representative reason, conditions (wet tyres, rain), traffic gaps (ahead/behind car, class, same class, gap) and flags (following, pressured), counts, strings |
| `session_lap_passes` | `(session_id, driver_ordinal, lap_ordinal, direction, seq)` | traffic `passed` / `passedBy` cars: name, class, same class |
| `session_events` | `(session_id, driver_ordinal, seq)` | incidents, track limits and penalties once: kind, `lap_ordinal` (null for the 2,360 without a lap), and every field of `LapIncident` / `LapTrackLimit` / `LapPenalty` |

`session_driver_condition_summaries` stays (a different key). Phase 2 merged `session_driver_summaries` into `session_drivers` and `session_lap_index` into `session_laps`
and dropped both tables; the projection builder is still a pure function in `shared/domain/sessionSummaries/`, only its persistence changed.

Assembly rules:

- `playerDriver` is `drivers[player_driver_ordinal]`, not a stored copy.
- A driver's event lists are its `session_events` in `seq` order; a lap's are those with its `lap_ordinal`.
- The replay link's `hasDuckDbTelemetry` / `duckdbFilename` come from `sessions.has_duckdb_telemetry` / `duckdb_filename`; `session_recordings` has no copy.
  Rows stored before the session carried the file (116 in the local cache) hold it on the link only: the writer and the canonical form lift the link's
  values onto the session when the session has none (`sessionTelemetry`).
- A driver's name, car type, car class and team come from the dictionaries; the driver row keeps the ids.
- A NULL column is an absent property, except fields typed `T | null` without `?`, which read as null.
- Never stored, filled at read time as today: pace ratings (`paceCategory`, `pacePercentage`, `target100Sec`,
  `bestLapPace*`) and `pitService`. The writer drops them.
- Formatted strings (`lapTimeString`, `bestLapTimeString`, gaps, elapsed) stay as columns in this plan:
  the first goal is a lossless round trip. Deriving them at read is a later, separately tested change.

## Write and read paths

- One writer, `writeSessionRows(db, session)`: replaces a session's rows in one transaction. Used by
  ingestion and reparse. Targeted updates replace the whole-JSON rewrites: a link change writes
  `session_recordings`, a replay rename updates `recording_name`, telemetry ownership updates
  `duckdb_filename`, reclassification updates the lap condition and reason columns.
- One reader, `readSession(db, id)`: assembles the `DetailedSession` from the tables above (about six
  indexed range reads). Used by the session page, reclassification and reconciliation.
- Cards and history queries select columns directly; `summary_json` and every `json_extract` go.

## Phases

Each phase lands green (`npm test`, `npm run build`, zero warnings) and can stop there.

0. **Round-trip harness.** A canonical form of `DetailedSession` (read-time fields removed, absent/null
   rules above), and a test that `readSession(writeSessionRows(x))` equals it for every fixture and parser
   case (multiclass, traffic, events without lap, wet, inferred laps, duplicate driver names). A read-only
   script under `tools/analysis/` runs the same check over a copy of a real cache and lists unmodeled
   fields. Any unmodeled field gets a column before phase 1 ends.
1. **Additive schema and dual write.** New tables; the writer runs next to today's JSON writes in the same
   transaction. A bounded backfill (ten sessions per batch, yielding) fills them from `data_json` and sets
   `normalized_version` only when the round trip matches; a mismatch keeps the row on JSON and is reported.
   JSON stays the source of truth.
2. **Reads switch.** `getSessionById`, reconciliation, reclassification and every card/history query read
   the tables. The 503 readiness gate also waits for `normalized_version`. JSON is still written, so rolling
   back is a code revert.
3. **JSON removed.** Stop writing `metadata_json` and `summary_json`, then `data_json`. Rebuild `sessions`
   without them only when every row is verified (SQLite drops columns by copying the table; a one-time
   step logged in Settings). Sessions whose XML LMU deleted
   only survive in these rows, so no row is dropped unverified.
   Detailed steps: "Phase 3 in detail" below.

## Risks

- **Field drift.** A parser field added later needs a column and a migration, not just a key. The
  round-trip test fails until it has one.
- **Old parser versions.** Rows parsed by older versions may hold fields or shapes current code no longer
  writes; the real-cache check in phase 0 finds them before anything is dropped.
- **Write volume.** Reclassifying the largest session rewrites about 1,500 lap rows instead of one JSON
  value; still one transaction, measured in phase 1.
- **Tests that insert JSON fixtures directly** (`scaleQueries`, `comparisonQueries`, `db`, `store`) move to
  the writer.

## Status of phases 0 and 1

- Phase 0 done: round trip verified for all 992 sessions of the local cache (16,856 drivers, 81,524 laps, 181,023 events), zero
  mismatches, with `tools/analysis/checkNormalizedRoundTrip.ts` (read-only). Findings that refine the rules above: an optional
  `null` reads back as absent (517k explicit nulls in the cache); the game version was a number in old rows and is read as text;
  empty event arrays need a presence mask (32,729 in the cache); the replay link keeps its own DuckDB flag and file, because all 116
  linked-to-DuckDB sessions in the cache have them on the link and not yet on the session; no lap event lacks a driver entry.
- Phase 1 done: `persistSessionProjection` writes and verifies the rows in its transaction (all JSON write paths reach it; the link
  withdrawal calls the writer itself); `backfillNormalizedSessions` fills stale sessions ten at a time after the summary backfill.
  Measured on the whole cache copy: median 99 ms per batch of ten, worst 402 ms; rows take 56 MB against 148 MB of JSON.

## Status of phase 2

- Done 2026-10-10. **Schema**: dictionaries `drivers` (5,121 exact names in the local cache, none merged), `vehicles` (32 pairs), `teams` (1,107); the two summary tables are merged
  into `session_drivers` / `session_laps`; the DuckDB location is `sessions` only. `NORMALIZED_SESSION_VERSION` 2 and `SESSION_SUMMARY_PROJECTION_VERSION` 4; a database with the
  version-one layout loses the old tables at start (they only held rebuilt rows) and the backfills write the new ones. Real-cache round trip (read-only): 992 of 992 sessions,
  16,856 drivers, 81,524 laps, 181,023 events; cards from columns equal `summary_json` for 992 of 992 (`tools/analysis/checkNormalizedCards.ts`).
- **Reads**: `getSessionById`, `getSessionsByIds`, `getSessionsStartingBetween`, `getSessionsLinkedToRecording`, `iterateStoredSessions`, the projection backfill, reclassification, the replay rename
  and withdrawal, `restoreStoredSessionLinks` and the telemetry attach go through `loadSession` / `readStoredLinkState` (`sessionRows/access.ts`): rows when `normalized_version` is current,
  the JSON otherwise. `getTelemetryOwnersWithoutFile` is a column read. Cards, the dashboard, history pages, search, sort, progression and context read columns only: no `json_extract`,
  no `summary_json`, no `metadata_json`. The readiness gate also waits for `normalized_version` (negative counts as attempted) and stays a covering-index read (`idx_sessions_ready`).
- **Updates stay whole-session**: a link change, rename, telemetry attach and reclassification load the session from the rows, change it, rewrite the JSON copies and run the projection (which rewrites the
  rows). A column-only update would leave the JSON stale and break the promise that rolling back is a code revert; it comes with phase 3. The no-op checks (same link, same file) are column reads.
- **Mismatch policy changed**: a session whose rows do not verify keeps its rows (their derived columns feed history reads) with a negative version; readers use its JSON. Rows left by a write error are removed.
- A withdrawn link now also clears `sessions.recording_name` (it used to stay until the next projection).
- **Timings** (synthetic 10,000 sessions / 200,000 laps, `scaleQueries.test.ts`; the earlier column is the figure recorded in PERSISTED_SESSION_SUMMARIES.md on the same fixture, the phase-1 tree was not kept
  for a rerun): first 25 cards 7.2 ms then 18 ms cold (0.9 ms warm); dashboard 49.5 then 48.5 ms; leaderboard 74.9 then 88 ms; layouts 26.2 then 23 ms; track summary 162.6 then 162 ms; comparison page 419 then 440-464 ms.
  On the real cache copy (992 sessions, rows built by the backfill: 28.6 s, zero failures): page 34 ms cold, dashboard 33 ms, board 3 ms. The 520 ms board that a `driver_class` index caused was found there and the index removed.
  The layout list, track summaries and progression take 120-240 ms on the real cache because they read `sessions` columns stored after `data_json`; phase 3 removes the cause.
- Query plans checked: cards read driver rows by primary key; comparison walks laps through `idx_session_lap_number` and the key; boards start from `idx_sessions_layout_timestamp`.

## Phase 3 in detail

Not started. This is the only phase that cannot be undone with a code revert, so it is written out before any code.

### What changes for good

After phase 3, the normalized rows are the only copy of a session. That matters most for sessions whose XML LMU has since deleted:
they cannot be parsed again. Three consequences follow, and the steps below are built around them.

- **Verification moves to ingestion.** Today a session whose rows do not verify falls back to its JSON. Afterwards there is no
  fallback. A parsed session whose rows do not read back equal is not stored: the transaction rolls back and the file is recorded as an
  ingest error, retried like any failed read. The XML still exists at that point, so nothing is lost; storing it lossy would be.
- **Row format changes become migrations.** Today a `NORMALIZED_SESSION_VERSION` bump rebuilds rows from `data_json`. Afterwards a
  bump must carry a migration in `sessionRows/migrations.ts` (SQL, or read with the old reader and write with the new writer). Sessions
  whose XML still exists may be re-parsed instead; sessions without XML only ever migrate. A parser field added later needs a column
  and a migration, and the round-trip test fails until it has both (already listed under Risks).
- **Rollback means restoring a copy.** Old code reads `data_json`, so after the rebuild a code revert alone breaks the app. Step 3b keeps
  a copy of the JSON so a rollback stays possible.

### 3a. Targeted updates (reversible, JSON still written)

Done 2026-10-10 (`server/core/sessionRows/targeted.ts`, tested in `test/server/core/sessionRows/targetedUpdates.test.ts`).
Updates stop rewriting the whole session. Each writes the rows and columns it changes, bumps `updated_at`, and runs the projection only
when derived figures depend on the change.

| Update | Status / After 3a |
|---|---|
| Replay link set / withdrawn (`dbReplayLinkStore`, `sessionReplayLinks`, `dbSessionStore`) | upsert or delete the `session_recordings` row, set `sessions.recording_name` via `upsertTargetedReplayLink` / `deleteTargetedReplayLink` |
| Replay rename (`dbReplayIdentity`) | update `session_recordings.recording_name`, `path` and `sessions.recording_name`, incrementing revisions via `renameTargetedReplay` |
| DuckDB file attached (`updateSessionTelemetryFile`) | set `duckdb_filename`, `has_duckdb_telemetry` via `updateTargetedTelemetry` |
| Conditions reclassification (`dbSessionConditions`) | update `session_recordings`, `session_drivers` and `session_laps` condition columns, then update derived projection columns in place via `updateTargetedConditions` / `updateDerivedColumns` |
| Reparse (`upsertSession`) | whole session, unchanged |

The JSON copy is refreshed in 3a by `patchSessionJson` called after each targeted write, so rolling back stays a code revert until 3b removes the columns.
Each targeted update path is tested and verifies that normalized rows read back equal to their canonical form without calling `writeSessionRows`.


### 3b. Conversion (one time, irreversible)

Implemented in `server/core/sessionRows/conversion.ts` and tested in `test/server/core/sessionRows/conversion.test.ts`:
- **Prerequisite validation**: `canConvertSessions(db)` blocks rebuild if any session has `normalized_version !== NORMALIZED_SESSION_VERSION` (unverified or negative).
- **Sidecar JSON safety copy**: `backupSessionsJsonToSidecar(db, sidecarPath)` uses `ATTACH DATABASE` to replicate `(id, data_json, metadata_json)` into `sidecar.sessions_json` (~150 MB), ensuring full rollback capability without whole-database copies.
- **Atomic table rebuild**: `rebuildSessionsTableWithoutJson(db)` creates `sessions_new` placing hot history columns first, drops `metadata_json`, `data_json`, and `summary_json`, copies all 58 retained scalar columns, swaps the table via `ALTER TABLE ... RENAME`, recreates all 9 indexes, and records `session_json_removed_at` in `cache_metadata`.
- **Atomic rollback on failure**: An error before commit cleanly rolls back the transaction, keeping the existing `sessions` table and schema untouched.
- **Rollback tooling**: `restoreSessionsJsonFromSidecar(db, sidecarPath)` restores JSON columns and clears `session_json_removed_at`.
- **Dual-path adapter**: Until 3c removes the legacy JSON paths, writes (`upsertSession`, `insertSessionRow`, `patchSessionJson`, `writeSessionJson`, `persistSessionProjection`, `markProjectionFailed`) and reads/backfills (`loadSession`, `readStoredLinkState`, `backfillNormalizedSessions`) check `isSessionJsonRemoved(db)` so converted and unconverted databases operate seamlessly.
- **No automatic `VACUUM`**: Reused pages are preserved without blocking event loops.

### 3c. Remove the JSON paths (after 3b has run on the local cache)

Done 2026-10-10:
- `loadSession` and `readStoredLinkState` read rows only. The JSON branch, `writeSessionJson`, and `patchSessionJson` are removed.
- `upsertSession` and `stub.ts` stop inserting JSON (`metadata_json` and `data_json` dropped from base `sessions` DDL in `dbSchema.ts`).
- `persistSessionProjection` and `updateTargetedConditions` stop writing `summary_json` (`summary_json` dropped from DDL in `sessionSummaries/schema.ts`).
- `markProjectionFailed` writes only `projection_error` (`cards.ts` already builds failed cards directly from columns).
- `backfillNormalizedSessions` guards against absent `data_json` column and runs safely.
- Offline tools `checkNormalizedRoundTrip.ts` and `checkNormalizedCards.ts` gracefully detect absence of `data_json` on converted caches and exit 0.
- `dualWrite.test.ts` deleted; fallback cases in `rowReads.test.ts` removed; `scaleQueries.test.ts`, `comparisonQueries.test.ts`, `store.test.ts`, and `db.test.ts` updated to operate without JSON columns.
- All test suites (283 files, 2,437 tests) and build typecheck pass with zero errors and zero warnings.

### Checks

- Before 3b on a **copy** of the real cache: the conversion completes, the round trip and card checks still pass from rows, and
  re-running the conversion does nothing.
- After: layouts, track summaries and progression measured again. Today they take 120–240 ms because they walk `data_json`
  pages; the target is under 30 ms. Dashboard, first page and board must not get slower.
- A crash during 3b, simulated by throwing between `INSERT ... SELECT` and `RENAME` in a test, leaves the old table and a
  readable cache.
- Rollback rehearsal: restore `data_json` from the sidecar into a converted copy and start the phase 2 code on it.

### Before running it on the real cache

The user backs up `server/lmu_cache.db` (or at least confirms the sidecar was written). Phase 3 needs an explicit go, and 3b
runs only after 3a and 3c pass review.

## Delivery

Phases 0 and 1 by a Sonnet agent, reviewed here before phase 2; mechanical fixture moves by Haiku.
Update `CODE_MAP.md` (tables, recipes, cache versions) in each phase.
