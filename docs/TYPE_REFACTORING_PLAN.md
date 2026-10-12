# 🏎️ TypeScript Type Refactoring & Simplification Plan

This plan outlines the systematic cleanup of TypeScript types across the **Le Mans Ultimate Lap Time Analyzer** codebase. It targets redundant duplicate models, unnecessary 1:1 type indirections, confusing name collisions, and disparate property names that represent identical domain concepts.

---

## Executive Summary & Architecture Goals

1. **Single Source of Truth**: Every domain model and entity has one canonical TypeScript contract in `shared/types/`.
2. **Zero Unnecessary Indirection**: Remove trivial `type A = B` aliases, redundant pass-through barrels, and duplicate model subsets.
3. **Consistent Domain Taxonomy**: Unify divergent property names across Session, Replay, Projection, and Telemetry layers (`lapNum` vs `lapNumber`, `isOutLap` vs `isOutlap`, `carType` vs `carName`, etc.).
4. **Zero Warnings & Zero Regressions**: Every phase must verify with `npm test` and `npm run build` with zero errors and zero warnings.

```mermaid
flowchart TD
    subgraph P1["Phase 1: Quick Wins"]
        A1["Drop Dead / 1:1 Aliases<br/>TrackSummaryData, GpsTrackMapSceneProps, SceneCornerMarker"]
        A2["Unify ReplayTelemetryPoint → ReplayTrajectoryPoint"]
        A3["Decommission server/core/types.ts Barrel"]
    end

    subgraph P2["Phase 2: Deduplicate Exact Types & Shared Enums"]
        B1["Deduplicate TimingGateGeometry & TrackTimingGates"]
        B2["Define Canonical WeatherCondition Type"]
        B3["Resolve SessionProgressionPoint Shadowing"]
        B4["Relocate ReplayCacheSummary to shared/types/replay.ts"]
    end

    subgraph P3["Phase 3: Clean Field Duplication & Ambiguities"]
        C1["Remove DriverData.driverName (keep DriverData.name)"]
        C2["Clean Up ReplaySummary Dual Metric Fields (sizeBytes/mtime)"]
        C3["Clarify TrafficSpell.carName → driverName"]
    end

    subgraph P4["Phase 4: Session Summary Consolidation"]
        D1["Unify SessionSummary, SessionListItem, SessionMeta into SessionCard"]
        D2["Eliminate Ad-Hoc Union Helpers (DashboardSessionItem, CompareLapsSessionItem)"]
    end

    subgraph P5["Phase 5: Domain Property Alignment & Elimination of Mapping Glue"]
        E1["Standardize isOutLap (eliminate isOutlap)"]
        E2["Standardize isPitStop (eliminate isPitLap in projections)"]
        E3["Align top3Average, drivingTime, pitStopsCount across projections & cards"]
        E4["Align carType across dashboard trends (eliminate carName glue)"]
    end

    P1 --> P2 --> P3 --> P4 --> P5
```

---

## Phase 1: Quick Wins — Trivial Aliases & Re-exports

Eliminate 1:1 type aliases that add zero abstraction and cause split imports across the codebase.

### 1.1 Remove Unused & Redundant Component Aliases
- [x] **Remove `TrackSummaryData`**:
  - File: [`src/components/track-summaries/TrackSummaries.tsx`](../src/components/track-summaries/TrackSummaries.tsx)
  - Action: Delete `export type TrackSummaryData = TrackSummary;` (completely unused in repo).
- [x] **Remove `GpsTrackMapSceneProps`**:
  - File: [`src/components/replay/map/gpsTrackMapTypes.ts`](../src/components/replay/map/gpsTrackMapTypes.ts)
  - Action: Delete `export type GpsTrackMapSceneProps = GpsTrackMapProps;`.
  - In [`src/components/replay/map/scene/GpsTrackMapScene.tsx`](../src/components/replay/map/scene/GpsTrackMapScene.tsx), import and use `GpsTrackMapProps`.
- [x] **Remove `SceneCornerMarker`**:
  - File: [`src/components/replay/map/scene/GpsSceneMarkers.tsx`](../src/components/replay/map/scene/GpsSceneMarkers.tsx)
  - Action: Delete `export type SceneCornerMarker = CornerMarkerPoint;`.
  - Use `CornerMarkerPoint` for `markers?: CornerMarkerPoint[]`.

### 1.2 Unify `ReplayTelemetryPoint` → `ReplayTrajectoryPoint`
- [x] In [`shared/types/replay.ts`](../shared/types/replay.ts), remove the `ReplayTelemetryPoint` alias.
- [x] Update consumers across `src/components/replay/telemetry/channels/*`, `test/components/replay/*`, and related map utilities to import `ReplayTrajectoryPoint` directly.
- [x] Fix [`TelemetrySteerChannel.tsx`](../src/components/replay/telemetry/channels/inputs/TelemetrySteerChannel.tsx) to import the canonical type once.

### 1.3 Decommission `server/core/types.ts` Pass-Through Barrel
Per `AGENTS.md` (*"Do not import and re-export symbols without an architectural reason. Import directly from defining modules; do not leave pass-through barrels or re-export shims. The sole approved barrel is shared/types/index.ts"*):
- [x] Update callers across `server/`, `test/`, and analysis tools importing from `server/core/types.js` to import directly from `shared/types/index.js` or `server/telemetry/duckdbTypes.js`.
- [x] Remove [`server/core/types.ts`](../server/core/types.ts).

**Verification Gate 1**: Run `npm test` and `npm run build`. Verify zero errors and zero warnings.

---

## Phase 2: Deduplicate Exact Duplicate Types & Canonical Enums

Eliminate exact type duplications and establish canonical definitions for repeated inline unions.

### 2.1 Deduplicate `TimingGateGeometry` & Inlined `timingGates`
- [x] In [`shared/types/trackGeometry.ts`](../shared/types/trackGeometry.ts):
  - Retain `TimingGateGeometry`.
  - Add `TrackTimingGates`:
    ```ts
    export interface TrackTimingGates {
      startFinish: TimingGateGeometry;
      sector1?: TimingGateGeometry;
      sector2?: TimingGateGeometry;
    }
    ```
  - Update `TrackBoundaryGeometry` to use `timingGates?: TrackTimingGates;` instead of inlining the anonymous shape.
- [x] In [`shared/types/replay.ts`](../shared/types/replay.ts):
  - Remove duplicate `TimingGateGeometry` and `TrackTimingGates` definitions.
  - Import `TimingGateGeometry` and `TrackTimingGates` from `./trackGeometry.js`.

### 2.2 Canonical `WeatherCondition` Type
The union `'Dry' | 'Wet' | 'Dynamic Weather'` is duplicated inline in 6 locations.
- [x] In [`shared/types/session.ts`](../shared/types/session.ts), export:
  ```ts
  export type WeatherCondition = 'Dry' | 'Wet' | 'Dynamic Weather';
  ```
- [x] Replace inline union in:
  - `SessionMetadata.matchingReplayFile.weatherCondition`
  - `ReplayMetadata.weatherCondition`
  - `ReplayTrajectoryData.weatherCondition`
  - `ReplaySummary.weatherCondition`
  - `ComparableLap.weatherCondition`
  - `ReplayFileEntry.weatherCondition`
- [x] Remove ad-hoc type lookups:
  - Delete `type WeatherCondition = NonNullable<ComparableLap['weatherCondition']>;` in [`ReplayCompareLapPicker.tsx`](../src/components/replay/inspector/compare/ReplayCompareLapPicker.tsx#L10).
  - Delete `export type LapCondition = NonNullable<ComparableLap['weatherCondition']>;` in [`lapPickerModel.ts`](../src/components/leaderboard/picker/lapPickerModel.ts#L5) and import `WeatherCondition`.

### 2.3 Resolve `SessionProgressionPoint` Shadowing
- [x] In [`shared/types/session.ts`](../shared/types/session.ts):
  - Add optional `bestLapWet?: boolean`, `benchmarkCategory?: PaceCategory | null`, and `benchmarkPercentage?: number | null` directly to the canonical `SessionProgressionPoint`.
- [x] In [`src/components/track-detail/improvement-chart/improvementChartTypes.ts`](../src/components/track-detail/improvement-chart/improvementChartTypes.ts):
  - Remove the shadowed local `SessionProgressionPoint` interface.
  - Re-export or directly use `SessionProgressionPoint` from `shared/types/session.js`.

### 2.4 Relocate `ReplayCacheSummary`
- [x] Move `ReplayCacheSummary` from `shared/types/session.ts` into `shared/types/replay.ts` and update imports through the approved shared types barrel.

**Verification Gate 2**: Run `npm test` and `npm run build`.

---

## Phase 3: Clean Field Duplication & Ambiguities

Eliminate redundant properties on core models that force defensive runtime fallback code.

### 3.1 Clean Up `DriverData.name` vs `DriverData.driverName`
- [x] In [`shared/types/session.ts`](../shared/types/session.ts#L124-L174):
  - Remove `driverName?: string` from `DriverData` (keeping canonical `name: string`).
- [x] In [`server/sessions/parser.ts`](../server/sessions/parser.ts#L529):
  - Remove redundant `driverName: d.name` assignment.
- [x] In `server/replay/decode/replayTransforms.ts`, `server/replay/replayTrajectoryService.ts`, and `server/routes/replayRoutes.ts`:
  - Simplify `matchedDriver.driverName || matchedDriver.name` to `matchedDriver.name`.

### 3.2 Clean Up `ReplaySummary` Dual Fields
[`ReplaySummary`](../shared/types/replay.ts#L348-L354) currently carries both `sizeBytes` AND `fileSizeBytes?`, plus `mtime` AND `mtimeMs?`.
- [x] Standardize `ReplaySummary` on:
  - `fileSizeBytes: number` (matching `ReplayMetadata` and `ReplayCacheSummary`) or strictly `sizeBytes: number`.
  - `mtimeMs: number` (matching `ReplayMetadata` and `ReplayCacheSummary`).
- [x] Update call sites and remove the secondary optional fields.

### 3.3 Clarify `TrafficSpell.carName`
- [x] In [`shared/types/raceTraffic.ts`](../shared/types/raceTraffic.ts#L30):
  - Document or rename `carName` to `driverName` (since it contains `other.info?.name`, the driver's name, or `"Car <slot>"`).

**Verification Gate 3**: Run `npm test` and `npm run build`.

The old nullable `session_drivers.driver_name` SQLite column remains in the schema for compatibility with existing databases, but the runtime model no longer reads or writes it. Legacy JSON driver objects are canonicalized by dropping `driverName` while retaining `name`. Replay summary and traffic spell fields are API/runtime payloads; they are rebuilt per request and do not require a stored-cache version bump.

---

## Phase 4: Session Summary Model Consolidation

Consolidate the 8 diverging session summary variants down to the canonical projection [`SessionCard`](../shared/types/sessionSummaries.ts#L51).

### 4.1 Unify Frontend Session Types
- [x] Replace `SessionListItem` in [`src/components/session-list/sessionListTypes.ts`](../src/components/session-list/sessionListTypes.ts) with `SessionCard`.
- [x] Replace `SessionSummary` in [`src/components/dashboard/dashboardTypes.ts`](../src/components/dashboard/dashboardTypes.ts) with `SessionCard`; remove the local dashboard-only model.
- [x] Replace `SessionMeta` in [`src/components/track-detail/trackDetailHelpers.ts`](../src/components/track-detail/trackDetailHelpers.ts) with `SessionCard`.
- [x] In [`shared/domain/trackSummaryUtils.ts`](../shared/domain/trackSummaryUtils.ts), derive the minimal aggregation input from canonical `SessionMetadata` and `DriverData` fields while retaining its detailed-driver fallback.

### 4.2 Remove Ad-Hoc Union Helpers
- [x] Delete `DashboardSessionItem = SessionSummary | DetailedSession` in [`src/components/dashboard/useDashboardMetrics.ts`](../src/components/dashboard/useDashboardMetrics.ts#L11) (use `SessionCard | DetailedSession`).
- [x] Remove `CompareLapsSessionItem` in [`src/components/leaderboard/useCompareLapsData.ts`](../src/components/leaderboard/useCompareLapsData.ts#L30) and use `SessionCard | DetailedSession` directly.

The dashboard and shared session-list surface retain a meaningful `SessionCard | DetailedSession` input where callers supply detailed sessions; neither type is coerced into the other. Tests now construct full canonical fixtures rather than weakening session contracts.

**Verification Gate 4**: `npm run build` passed with no warnings or errors. The final sequential `npm test` gate will cover Phases 4–5 together.

---

## Phase 5: Domain Property Alignment & Elimination of Mapping Glue

Eliminate mapping glue functions that translate between synonymous property names across domain boundaries.

### 5.1 Standardize `isOutLap` (Deprecate `isOutlap`)
- [x] In [`shared/types/replay.ts`](../shared/types/replay.ts#L218) (`ReplayLapSummary`), rename `isOutlap` to `isOutLap`.
- [x] In [`shared/types/aiReport.ts`](../shared/types/aiReport.ts#L85) (`AiLapEvidence`), rename `isOutlap` to `isOutLap`.
- [x] In `server/replay/decode/replayLapBuilder.ts` and `replayLapClassification.ts`:
  - Rename internal `isOutlap` to `isOutLap`.
- [x] Remove translation glue:
  - In [`server/replay/decode/replayTransforms.ts`](../server/replay/decode/replayTransforms.ts): use the canonical `isOutLap` key while retaining boolean normalization of optional match data.
  - In [`server/replay/replayMetadataService.ts`](../server/replay/replayMetadataService.ts): assign the canonical field directly.

### 5.2 Standardize `isPitStop` (Deprecate `isPitLap`)
- [x] In [`shared/types/sessionSummaries.ts#L9`](../shared/types/sessionSummaries.ts#L9) (`SessionLapProjection`), rename `isPitLap` to `isPitStop` (matching `LapData`, `ReplayLapSummary`, and `ComparableLap`).

### 5.3 Align Metrics across Projections & Cards
In [`server/core/sessionSummaries/cards.ts`](../server/core/sessionSummaries/cards.ts#L23-L35), eliminate rename glue:
- [x] Standardize `maxSpeed` vs `maxTopSpeed`: use `maxTopSpeed` in `SessionDriverProjection` or `SessionCard`.
- [x] Standardize `drivingTimeSum` vs `drivingTimeSeconds`: use `drivingTimeSeconds` consistently.
- [x] Standardize `pitCount` vs `pitStopsCount`: use `pitStopsCount` consistently across projection and card.
- [x] Standardize `topThreeAverage`: use `top3Average` across `SessionDriverProjection`, `SessionCard`, and `LeaderboardEntry`.

### 5.4 Align `carType` vs `carName`
- [x] In [`DashboardLatestOuting`](../shared/types/dashboard.ts#L24) and [`DashboardRecentPacePoint`](../shared/types/dashboard.ts#L18), rename `carName` to `carType`.
- [x] In [`server/core/sessionSummaries/dashboardQueries.ts`](../server/core/sessionSummaries/dashboardQueries.ts#L49), eliminate rename glue (`carName: player.carType`).

### 5.5 Align `dateString` vs `timeString`
- [x] In [`src/components/track-detail/trackDetailHelpers.ts#L75`](../src/components/track-detail/trackDetailHelpers.ts#L75):
  Eliminate `dateString: s.timeString` glue by accepting `timeString` consistently across progression points.

Stored replay metadata and trajectory JSON can outlive their source `.Vcr` files, so their read boundary normalizes the legacy `isOutlap` spelling (including nested `allLapsData`) before version-specific early returns. A canonical `isOutLap: false` takes precedence, and reads do not rewrite compressed blobs. The SQLite `replay_laps.is_outlap` column remains unchanged. Other renamed fields are runtime projections and require no persistence version bump. `LapConditionGroup` and `WeatherCondition`, replay `carModel` and display `carType`, and ordinal and lap-number fields remain distinct because they encode different concepts.

**Verification Gate 5**: Final sequential `npm run test:coverage` passed (298 test files and 2,587 tests passed; 5 files and 56 tests skipped; coverage thresholds met: 92.41% statements, 83.77% branches, 92.64% functions, and 94.68% lines). `npm run build` passed afterward: TypeScript, local-data guards, and Vite production build completed with zero warnings or errors. Vitest ran with one worker and the required elevated validation permissions for its temporary SSR cache and localhost route tests.

---

## Execution Risk Matrix & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Persisted replay JSON compatibility | High (cached metadata and trajectories survive source-file deletion) | Normalize the old `isOutlap` JSON key at the read boundary before parser-version early returns; preserve canonical false, recurse nested laps, and leave stored blobs and SQL columns unchanged. |
| Runtime projection / API contract regressions | High | Update producers and consumers together, preserve meaningful `SessionCard | DetailedSession` inputs, and verify with the final sequential test and build gates. |
| Build and test resource contention | Medium | Run `npm test`, `npm run build`, and `npm run test:coverage` sequentially; require zero warnings and all coverage thresholds. |
