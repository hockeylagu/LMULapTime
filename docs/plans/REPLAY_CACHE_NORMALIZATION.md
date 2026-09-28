# Replay cache normalization — migration plan

Status: **done: stage A (steps 0-5) and stage B (steps 6-8); the real cache is migrated** (written 2026-09-27). Work on a new branch off `main`
(suggested name `replay-cache-normalization`), in a branch. One step per commit.

Stage A as built:

- D1: the flag packet is a slot-255 broadcast, so `flag_state`, `sector_mask` and `driver_flag`
  live in `replay_conditions`.
- D2: every lap blob holds every driver's pit, contact and penalty events, so one row per replay
  fills `replay_driver_events`.
- D3: `start_sec` / `end_sec` are the first and last sample of the lap's stored row (nullable
  when the lap has no stored points); the start and end frames are kept too.
- Replay-wide facts carry their version in a `replay_facts` table (one row per replay).
- Step 5: stored trajectories get their lap list from `replay_laps` (`dbReplayTrajectoryStore.ts`),
  falling back to the blob's copy until the replay is backfilled. The traffic signature still
  counts `replay_trajectories` rows: the race positions are built from those blobs, and
  `replay_laps` also holds listed laps without stored points. The client reads none of the
  event arrays of a trajectory. The server reads one: each lap's own `pitEvents`, to recompute
  the garage state (`withGarageState` on every read, `readLapSamples` in the race-positions
  worker), so stripped rows keep the driver's own pit events.

Stage A validated on a copy of the real cache (5.04 GB, 325 replays, 41,847 lap rows; 2026-09-27):

- D1: all 17,361 flag events are `driverSlot` 255. 24 of 17,285 flag times hold two differing
  packets; the later one is kept.
- D2: in 25 sampled replays (v3 and v7, up to 59 cars), the pit, contact, penalty, flag, weather,
  standings and running-order arrays are identical in every lap row.
- D3: in 25 linked sessions, `start_sec` sits at a constant offset of 0.0-0.23 s after the XML
  `et` (p90 deviation ≤ 0.16 s), and each lap starts where the previous one ended (median gap 0).
- Backfill: 325 replays and 41,847 laps in 296 s. The event-loop delay reached 330 ms at most
  (p99 58 ms). This is a one-off pass, so the decompression stays on the main thread. Listing the
  backlog takes 12-38 ms, and a re-run does nothing.
- Rows: 41,847 laps (41,778 with a span), 138,054 conditions, 27,000 driver events and 40,994
  running-order rows. 95% of the condition rows are `sector_mask` changes: it toggles between 1
  and 17 (and 33) during green-flag running, so it is not a plain yellow-sector bitmask. Decode
  it before section 6 uses it for local yellows.
- `replay_lap_conditions` gives the same rain and FCY per lap as the blob arrays (87 laps
  sampled, 0 mismatches). A lower bound on the join takes Daytona R1 7 (6,385 condition rows,
  1,348 laps) from 674 ms to 146 ms.

Read `AGENTS.md` first. The rules that matter most here:

- **Deleted replays**: rows of replays LMU has deleted are the only copy. Never drop data from
  them. A blob may only be rewritten once everything it holds has been copied and verified.
- Zero `any`, zero warnings. `.ts` files ≤ 1000 lines. **≤ 20 files per folder**:
  `server/core/` already has exactly 20, so step 0 is needed first.
- Tests go under `test/server/<domain>/`, mirroring `server/`.

---

## 1. Why

### 1.1 How the replay cache stores data today

`replay_trajectories` has one row per `(filename, driver_slot, lap_key)`, holding a brotli JSON
blob (`trajectory_br`) of `ReplayTrajectoryData`. Each lap blob holds its points, and it also
holds replay-wide data that is copied into every lap row:

| Array in each lap blob | What it really belongs to | Daytona R1, per row |
|---|---|---|
| `weatherEvents` | the replay (weather is global, slot 255) | 1,592 |
| `flagEvents` | per driver: each event has `driverSlot` and `driverFlag` (see D1) | 6,649 |
| `pitEvents` | per driver | 456 |
| `contacts` | per driver | 503 |
| `penalties` | per driver | 24 |
| `standingsHistory` and `sessionRunningOrder` | the replay (running order over time) | 1,918 |
| `laps` (`ReplayLapSummary[]`) | the driver: their whole lap list | 37 |
| `tireCompounds`, `weatherCondition`, `maxRainIntensity`, `ambientTemp` | the replay or the driver | — |

Daytona R1 has 1,348 lap rows (61 drivers), and each of them carries all of the arrays above.

### 1.2 Measured on the real cache (2026-09-27)

- `server/lmu_cache.db`:
  - 325 replays, 41,847 lap rows, 4.85 GB of `trajectory_br`;
  - about 22.8 drivers per replay on average.
- The duplicated arrays above make up about **490 MB** in total: about 10% overall and about
  12% of v7 rows.
- By cache version (one row per replay):
  - **v7: 213 replays, all on disk.** They have weather and flags. 8 of them have rain.
  - **v5: 16 replays on disk.** They have no weather events yet; the background upgrade will
    re-decode them.
  - **v3: 96 replays, all deleted by LMU.** They have no weather, and only 27 have flags. They
    can never be decoded again.
- Unpacking one lap blob takes about 23 ms, so one row per replay takes about 7.5 s for all 325.
- **Nothing outside the decoder reads the event arrays today.**
  - The server does not read `contacts`, `penalties`, `pitEvents`, `flagEvents`,
    `standingsHistory` or `weatherEvents` from a trajectory. The codec only rescales old
    weather values on read.
  - The client only reads `weatherCondition`, `maxRainIntensity` and `ambientTemp`
    (`ReplayInspectorTitle.tsx`).
  - The lap list (`trajectory.laps`) is read by `replayTransforms.ts`,
    `replayTelemetryService.ts`, `replayMetadataService.ts` (as a fallback) and
    `replayRoutes.ts`.

### 1.3 Goal

Store each fact once, at its own level:
**replay → driver → lap → trajectory**, with replay-wide conditions keyed by **time**, not by
lap. Laps join conditions and events by time. This enables:

- lap conditions (rain, yellows) in the lap status, which is the next feature (§6);
- the phase 4 stint view (pit stops, compound, energy per lap) without unpacking blobs;
- about 0.45 GB reclaimed after stage B and a `VACUUM` (§5).

---

## 2. Target schema

```
replay_metadata (existing, unchanged in stage A)
 ├─< replay_conditions      time-keyed, replay-wide (weather; flags if D1 says global)
 ├─< replay_running_order   time-keyed, replay-wide (only the snapshots where the order changes)
 ├─< replay_driver_events   per driver, time-keyed (contact, penalty, pit, compound, flag)
 └─< replay_laps            per driver per lap: timing facts
        └─o| replay_trajectories   0..1 per lap: the points blob (stripped in stage B)

view replay_lap_conditions = replay_laps ⋈ replay_conditions on overlapping time
```

### 2.1 DDL (to go in `server/core/dbSchema.ts`, `initDbSchema`)

```sql
-- One row per driver per lap of a replay: the lap's timing facts, in columns that can be queried
-- without unpacking a trajectory. A row exists whether or not the lap's points are stored.
CREATE TABLE IF NOT EXISTS replay_laps (
  filename TEXT NOT NULL,
  driver_slot INTEGER NOT NULL,
  lap_number INTEGER NOT NULL,
  start_sec REAL NOT NULL,          -- replay time of the lap's first sample
  end_sec REAL NOT NULL,            -- replay time of the lap's last sample
  lap_time_sec REAL,
  s1_sec REAL, s2_sec REAL, s3_sec REAL,
  lap_dist_m REAL,
  is_outlap INTEGER NOT NULL DEFAULT 0,
  is_valid INTEGER,
  source_version TEXT NOT NULL,     -- parser_version of the decode it came from
  PRIMARY KEY (filename, driver_slot, lap_number)
);
CREATE INDEX IF NOT EXISTS idx_replay_laps_time ON replay_laps(filename, start_sec);

-- Replay-wide conditions over time: one row per change, never per sample.
CREATE TABLE IF NOT EXISTS replay_conditions (
  filename TEXT NOT NULL,
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,            -- start of the next row, or the replay's end
  rain INTEGER NOT NULL,            -- 0-255, as decoded (rainPercent = rain / 255)
  ambient_c REAL,
  -- Only if D1 finds flags are global:
  flag_state INTEGER,               -- 0 green, 1 local yellow, 2 double yellow, 3 FCY, 4-6 SC/VSC, 7 red, 8 chequered
  yellow_sectors INTEGER,           -- sector bit mask of the local yellow
  PRIMARY KEY (filename, start_sec)
);

-- Events that belong to one car at one moment.
CREATE TABLE IF NOT EXISTS replay_driver_events (
  filename TEXT NOT NULL,
  driver_slot INTEGER NOT NULL,
  time_sec REAL NOT NULL,
  kind TEXT NOT NULL,               -- 'contact' | 'penalty_given' | 'penalty_served' | 'pit' | 'compound' | 'flag'
  seq INTEGER NOT NULL,             -- order within (filename, driver_slot, time_sec, kind)
  code INTEGER,                     -- pit code / penalty type code / flag state
  value REAL,                       -- impact N, penalty seconds, fuel litres, duration s
  other_slot INTEGER,               -- contact: the other car (null = object)
  detail TEXT,                      -- JSON of the remaining fields (penaltyText, action, compound array, …)
  PRIMARY KEY (filename, driver_slot, time_sec, kind, seq)
);

-- Running order changes over the replay (standingsHistory), deduplicated.
CREATE TABLE IF NOT EXISTS replay_running_order (
  filename TEXT NOT NULL,
  time_sec REAL NOT NULL,
  order_json TEXT NOT NULL,         -- JSON array of driver slots, P1 first
  PRIMARY KEY (filename, time_sec)
);

CREATE VIEW IF NOT EXISTS replay_lap_conditions AS
SELECT l.filename, l.driver_slot, l.lap_number,
       MAX(c.rain) AS max_rain,
       (SELECT c2.rain FROM replay_conditions c2
         WHERE c2.filename = l.filename AND c2.start_sec <= l.start_sec
         ORDER BY c2.start_sec DESC LIMIT 1) AS rain_at_start,
       MIN(c.ambient_c) AS min_ambient_c,
       MAX(CASE WHEN c.flag_state IN (3,4,5,6) THEN 1 ELSE 0 END) AS full_course_yellow
FROM replay_laps l
JOIN replay_conditions c
  ON c.filename = l.filename AND c.start_sec < l.end_sec AND c.end_sec > l.start_sec
GROUP BY l.filename, l.driver_slot, l.lap_number;
```

Local yellows can't be decided in SQL alone. They need the sector the car was in when the
yellow was out, so compute them in TypeScript with the lap's sector times: S1 runs from
`start_sec` to `start_sec + s1_sec`, and so on. If D1 finds flags are per driver, use that
driver's `flag` events instead.

### 2.2 Things deliberately left out

- **Validation fields** (`validatedTimeSec`, `timeDiffSec`, `nonRepresentativeReason`) are
  derived from the linked session on read, as today. They are never stored.
- **`isBest`** is derived: the minimum `lap_time_sec` over the driver's valid laps.
- **Car and class** stay resolved on read from the vehicle id (`resolveRosterVehicles`). They
  are never stored, so that corrected mappings reach deleted replays.
- **Replay summary weather** for the list (`MAX(rain)` over `replay_conditions`) could replace
  `metadata.weatherCondition` and `maxRainIntensity` later. Not in this plan: the header scan
  also fills them for replays with no stored laps.
- **Fuel.** VCR 0/51 is **Virtual Energy, not fuel** (corrected on main in `91e92f5`). The VCR
  has no fuel level; fuel comes from DuckDB or the XML only. Pit service `fuelAddedLiters` goes
  in `replay_driver_events.value`. Per-lap energy/compound summary columns are left for phase 4
  (stints) to add when it needs them.
- **`replay_drivers`** (roster plus ingest state, merging `replay_ingest_drivers`) is optional
  and out of scope. Keep `replay_ingest_drivers` as it is.

---

## 3. Decisions to settle first

- **D1 — are flags global or per driver?** Each flag event carries `driverSlot` (`drv`) and
  `driverFlag`.
  - Check on real replays: at the same `timeSec`, are `flagState` and `sectorMask` identical for
    every driver? Write a `scratch-*.mts` script in the repo root, run it with `npx tsx`, and
    delete it afterwards.
  - If they are identical, `flag_state` and `yellow_sectors` go in `replay_conditions`, and
    `driverFlag` (probably blue flags) becomes a per-driver `flag` event carrying only the driver
    part.
  - If they differ, flags are per-driver `flag` events only, and the view drops the flag columns.
  - Record the result in `docs/VCR_FORMAT.md`.
- **D2 — which events in a lap blob belong to which driver?**
  - Check whether `pitEvents`, `contacts` and `penalties` in one lap row cover **all** drivers
    (by their `driverSlot`) or only the decoded driver. The counts (456 pit events in a player
    row) suggest all drivers.
  - If they cover all drivers, one row per replay is enough to fill `replay_driver_events`.
  - If not, read one row per driver: about 7,400 rows, about 3 min.
- **D3 — lap start and end times.** `ReplayLapSummary` has frames, not times.
  - Use the first and last point's `timeSec` of each lap row. `readLapSamples` in
    `server/traffic/lapSamples.ts` already reads `timeSec` from columnar and legacy blobs.
  - Check against `lineCut` whether the line-cut time is better. Compare on a few laps with the
    XML `et`, which is the lap **start**.
  - Laps without a stored row can't get a `replay_laps` row from a backfill. That's fine: new
    decodes write them all.
- **D4 — the `-1` keys.**
  - `lap_key = -1` rows are the "default lap" when no numbered row covers it, and
    `driver_slot = -1` rows come from a decode that couldn't name the slot. See
    `cacheAllLapsForDriver` in `dbReplaySync.ts` and `replaceReplayDriverLaps` in `db.ts`.
  - `replay_laps` only takes `lap_key > 0`. Take `driver_slot = -1` only when that replay has no
    concrete slot for the same laps.

---

## 4. Stage A — add the normalized tables (additive, nothing removed)

### Step 0 — make room in `server/core/` (refactor only)

`server/core/` has 20 files. Move the replay stores into `server/core/replay/`:

- `dbReplayIdentity.ts`
- `dbReplayIngestStore.ts`
- `dbReplayLinkStore.ts`
- `dbReplayMetadataStore.ts`
- `dbReplaySync.ts`
- `dbReplayTrajectoryStore.ts`
- `dbReplayUpgrade.ts`
- `replayTrajectoryCodec.ts`
- `dbRacePositionStore.ts`

Then fix the imports and mirror the move in `test/server/core/` (→ `test/server/core/replay/`).
Also update the AGENTS.md directory layout. `npm test` and `npm run build` must be green, with
no behaviour change.

### Step 1 — schema and store module

- Add the DDL of §2.1 to `initDbSchema` (all `IF NOT EXISTS`, so no migration is needed on
  existing DBs).
- New `server/core/replay/dbReplayLapStore.ts` with typed row interfaces (no `any`):
  - `replaceReplayDriverLapFacts(db, filename, driverSlot, laps)` — delete and insert in the
    caller's transaction.
  - `replaceReplayWideFacts(db, filename, { conditions, runningOrder, driverEvents })`.
  - `getReplayLaps(db, filename, driverSlot?)`, `getLapConditions(db, filename)` (the view),
    `getDriverEvents(db, filename, driverSlot, fromSec?, toSec?)`.
- New pure module `server/replay/replayFacts.ts` that turns a decoded `ReplayTrajectoryData` into
  rows:
  - `lapFactsFrom(trajectory)` → `replay_laps` rows (from `laps` plus each lap's first and last
    point, per D3);
  - `conditionsFrom(weatherEvents, flagEvents?)` → change-only rows. Collapse consecutive
    samples with the same rain, ambient and flag state; `end_sec` is the next row's
    `start_sec`, or the last point's time;
  - `driverEventsFrom(trajectory)` and `runningOrderFrom(standingsHistory)` (changes only).
- Tests:
  - `test/server/replay/replayFacts.test.ts` — collapse, ordering, ties (`seq`), empty inputs,
    legacy v3 values going through `upgradeStoredTrajectory` first;
  - `test/server/core/replay/dbReplayLapStore.test.ts` — in-memory DB, round trip, and the view
    on overlapping and non-overlapping laps.

### Step 2 — new decodes write the facts

In `DbManager.replaceReplayDriverLaps` (`server/core/db.ts`), inside the existing transaction:

- write `replay_laps` for that driver;
- write the replay-wide facts when the replay has none yet, or when this decode's parser version
  is newer than the stored facts (keep a `source_version` per replay: a
  `cache_metadata` key `replay_facts:<filename>`, or a small `replay_facts_state` table).

The upgrade runner (`dbReplayUpgrade.ts`) goes through `replaceReplayDriverLaps` already, so it
gets this for free. Add a test that the upgrade refreshes the facts.

### Step 3 — keep the new tables in step with the existing ones

Every place that renames or deletes replay rows must do the same to the new tables, in the same
transaction:

- `dbReplayIdentity.ts` (the rename on a filename collision, lines ~62-65): add `UPDATE … SET
  filename = ?` for the four new tables.
- `dbReplayIngestStore.ts` `deleteReplayDriverLaps`: delete that driver's `replay_laps` and
  `replay_driver_events`.
- The cache clear / replay removal in `replayCacheService.ts` and `db.ts` (search for
  `DELETE FROM replay_`): delete all rows of the replay in the new tables.
- Tests: extend `dbReplayIdentity.test.ts` and `dbReplayIngest.test.ts`.

### Step 4 — backfill existing replays (no VCR decode)

- A background job like `replayUpgradeRunner.ts`: yield between replays, report progress, and be
  resumable. New `server/replay/replayFactsBackfill.ts`:
  - for each replay in `replay_metadata` without facts at its row's parser version:
    - read its rows through `readTrajectoryRow` so legacy values are corrected on read
      (`upgradeStoredTrajectory`);
    - per D2, take the replay-wide arrays from one row, or one row per driver;
    - take each lap's times from its own row, per D3;
  - write one transaction per replay;
  - mark done per replay, so an interrupted backfill resumes.
- Cost:
  - about 7.5 s for the replay-wide facts;
  - about 16 min if every one of the 41,847 rows is unpacked for lap times. To go faster,
    decompress with the `readLapSamples`-style column read (only `timeSec`) instead of full
    point objects.
  - Run it after the replay sync and the upgrade runner, in the same scheduler (see
    `serverContext.ts`).
- Show its progress next to the replay upgrade progress in Settings.
- Deleted replays (the v3 ones) are included: this only reads their rows.
- Tests: `test/server/replay/replayFactsBackfill.test.ts` with mock rows (see
  `test/utils/mockVcr.ts` and the existing codec tests for building blobs): resume after
  interruption, v3/v5/v7 rows, `-1` rows skipped.

### Step 5 — readers move to the tables

- **Traffic:** `dbRacePositionStore.getReplayLapSignature` can count `replay_laps` instead of
  blob rows. `lapSamples.ts` still needs the points blob for x/z, so it keeps reading
  `replay_trajectories`.
- **Lap list:** `replayTransforms.ts`, `replayTelemetryService.ts`, `replayMetadataService.ts`
  and `replayRoutes.ts` read `trajectory.laps`. Serve `laps` from `replay_laps`, assembled into
  the same `ReplayLapSummary[]` shape at the store boundary, so the API response is unchanged.
- **Trajectory API response:** keep `ReplayTrajectoryData` unchanged for the client. When a row
  lacks an array (stage B), rebuild it from the tables in `readTrajectoryRow` only if something
  still reads it; per §1.2 nothing does. So decide per field: drop it from the type, or rebuild
  it.

Stage A ends here: every fact exists in the new tables, and every new decode writes them.

---

## 5. Stage B — stop duplicating, then reclaim space (separate commits, after stage A has run for a while)

### Step 6 — new rows stop carrying the duplicated arrays

- In `cacheAllLapsForDriver`, strip `weatherEvents`, `flagEvents`, `pitEvents`, `contacts`,
  `penalties`, `standingsHistory`, `sessionRunningOrder` and `laps` before
  `upsertReplayTrajectoryCache`.
- Add a column `replay_trajectories.blob_format INTEGER NOT NULL DEFAULT 1` (added via
  `PRAGMA table_info` + `ALTER TABLE`, like `source_path` at the end of `initDbSchema`). `2`
  means stripped.
- **No `REPLAY_CACHE_VERSION` bump.** Stripped rows still read correctly, so a bump would only
  force needless re-decodes (see the comment on `REPLAY_CACHE_VERSION`).

As built: `withoutReplayFacts` (`replayFacts.ts`) drops the weather, flags, contacts,
penalties, standings, running order and other drivers' pit events. It keeps the driver's own pit
events (the garage state is recomputed from them), and the lap list when the decode could not
name its driver (no lap facts filed). The `blob_format` column was used during the migration
only and has since been dropped (see step 8).

### Step 7 — strip existing rows, only after verification

For each replay whose facts are backfilled:

1. Rebuild the arrays from the tables and deep-compare them with the arrays in the blobs, after
   `upgradeStoredTrajectory`. Compare rows, times and values; allow a tolerance only for float
   formatting.
2. If they match, rewrite that replay's rows with `blob_format = 2` in one transaction. If
   anything differs, leave the replay untouched and log it (`ingest_errors`).

Deleted replays are included only because their data now lives in the tables and was verified.
This is the only place a deleted replay's blob is rewritten; state that in the code comment.

Behind a Settings action ("Compact replay cache"), not automatic, with progress.

### Step 8 — `VACUUM`

SQLite only reuses freed pages; the file only shrinks after `VACUUM`.

- It needs about the DB's size in free disk space and takes a few minutes on 5 GB.
- Add a Settings button: check free space first, stop the background jobs, then run it.
- Expected result: 4.85 GB → about 4.4 GB of replay data.

### Stage B as built (steps 7-8, one-time, server stopped)

Steps 7 and 8 ran once as a script on a copy of the real cache (`db.backup()`), not as Settings
actions:

- Compaction applied the step 6 rule to every stored row. Before rewriting a replay, it checked
  that each row's lists (after `upgradeStoredTrajectory`) equalled the tables. It also checked that
  each new blob read back to exactly the intended content. One transaction per replay.
- Result: 325 replays, 41,847 rows, 0 kept whole, no errors. Blob bytes went from 5,094,166,651
  to 4,584,007,168 in 2,056 s.
- Then `ALTER TABLE replay_trajectories DROP COLUMN blob_format` (118 s) and `VACUUM INTO`
  (48 s). `quick_check` ok; counts unchanged (929 sessions, 325 replay facts, 41,847 rows and
  laps). The file went from 5.46 GB to 4.94 GB.
- The live DB had not been written since the copy was taken, so the compacted copy replaced it
  (`server/lmu_cache.db`). The previous file is kept as `lmu_cache.db.backup-pre-stage-b`.
- The migration code was then removed: the facts backfill (`replayFactsBackfill.ts`, its
  Settings progress and its trigger after the replay upgrade), the compaction, and
  `blob_format`. The replay upgrade stays: every new decode writes the facts and a stripped
  row directly, so a `REPLAY_CACHE_VERSION` bump (v8) re-decodes into the normalized layout.

---

## 6. After the migration: lap conditions (the feature this unblocks)

These are separate commits on the same branch (or the next one), in `server/sessions/parser.ts`
territory:

- **Per lap, for every driver of the session:**
  - wet tyres from the XML `fcompound` (e.g. `"1,Wet"`);
  - field pace: the median of every car's laps crossing the line in the same time window,
    compared with the session's dry baseline. A lap counts when the field is more than 2%
    slower;
  - when a replay is linked: rain, FCY and local yellow from `replay_lap_conditions` and the
    sector check.
- **`LapData.conditions`** (new shared type), plus a status icon (Lucide only, never emoji:
  `CloudRain`, `Droplets`, `Flag`) and a "Conditions" section in `lapDetailSections.ts`.
- **Linking a replay after the XML was parsed** must re-tag that session's laps. Hook into
  `sessionReplayLinks.ts`.
- **Bump `DB_PARSER_VERSION`**, since the classification changes.
- **Open decision for the user:** should condition-flagged laps leave the average and
  consistency as a new `nonRepresentativeReason: 'conditions'` (recommended), or only be
  tagged? A fully wet session stays representative: the field's own pace is the baseline, so
  only laps that **differ** from the session's conditions are flagged.

Data coverage, for reference: replay rain exists for the 213 v7 replays, and for the 16 v5 ones
after the upgrade. The 96 deleted v3 replays fall back to wet tyres and field pace.

---

## 7. Verification checklist (every step)

- `npm test` — all green, zero warnings. `npm run build` — zero warnings.
  `npm run test:coverage` — thresholds met; raise them if coverage grew.
- Check the size limits: components ≤ 300 lines, `.ts` ≤ 1000, folders ≤ 20 files.
- On a **copy** of the real DB (better-sqlite3 `db.backup()` into the worktree's
  `server/lmu_cache.db`, which is git-ignored; never junction `node_modules`):
  - the backfill completes, and re-running it is a no-op;
  - row counts: `replay_laps` ≈ 41,847 minus the `-1` rows; `replay_conditions` a few dozen per
    v7 replay;
  - Daytona R1 (`Daytona International Speedway Road Course R1 7.Vcr`): the view gives the same
    rain and flag state as the blob arrays for a sample of laps;
  - the Sebring race (dry then rain): rain rises on the laps where the XML compounds switch to
    Wets;
  - the inspector, the traffic debrief and the lap list behave the same in the browser. Run the
    worktree with `PORT=3001 npm run dev` in the background; `preview_start` runs the main
    checkout, not the worktree.
- Stage B only: the verification report shows 0 mismatches before any strip. Record the DB size
  before and after `VACUUM`.

## 8. Risks

- **Losing a deleted replay's only copy.** Mitigation: stage B only after deep-equality
  verification per replay, one transaction per replay, and no automatic compaction.
- **Stale facts after a re-decode.** Mitigation: facts are written in the same transaction as
  the lap rows (step 2), and renames and deletes cascade (step 3).
- **Backfill blocking the server.** Mitigation: yield between replays (`backgroundScan.ts`
  pattern); move the decompression to a worker if a replay takes more than about 50 ms.
- **The view getting slow on large replays.** Mitigation: `idx_replay_laps_time` and the
  conditions primary key. If it's still slow, materialize it as a derived cache like
  `replay_race_positions`, keyed by a signature.
