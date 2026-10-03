# 🏎️ Le Mans Ultimate Lap Time Analyzer - Agent Guidelines (AGENTS.md)

This document provides architectural standards, domain rules, coding conventions, and operational workflows for AI agents working in this repository.

---

## 1. Project Overview & Domain Context

**LMU Lap Time Analyzer** is a telemetry analytics, lap comparison, and race intelligence hub for **Le Mans Ultimate (LMU)** (Studio 397 / Motorsport Games, rFactor 2 engine lineage).

### Key Capabilities:
- **Dual Telemetry Ingestion (100 Hz DuckDB & Binary VCR)**:
  - Ingests high-fidelity native 100 Hz columnar DuckDB telemetry (`UserData/Telemetry/*.duckdb`) with microsecond timestamp precision.
  - Multi-file DuckDB session ownership: Tracks all DuckDB telemetry files written across multi-stint sessions with persistent caching (`telemetryLinks.ts`).
  - Timing line continuity: Smoothly interpolates telemetry samples across start/finish timing loops (`lapLineCut.ts`) while repairing station distance glitches (`stationGlitches.ts`) and preserving 4-corner channels without data loss.
  - Reverse-engineers native `gMb1.002f` binary replay files (`UserData/Replays/*.Vcr`) using worker-thread decoding for 2D trajectories and multi-driver telemetry.
  - Slices continuous session logs into clean flying laps with sector boundary tags and fused spatial coordinates.
- **Replay & Ingestion Integrity**:
  - Deterministic session-to-replay matching with automated validation and link withdrawal for invalid pairings (`replayMatching.ts`, `dbReplayLinkStore.ts`).
  - Archived replay identity tracking preventing filename collisions when LMU reuses replay filenames (`dbReplayIdentity.ts`).
  - Background replay upgrade runner re-parsing legacy replay formats with live progress reporting in Settings (`replayUpgradeRunner.ts`, `dbReplayUpgrade.ts`).
- **Spatial Lap Alignment & Trajectory Downsampling**:
  - Station and distance-based lap trajectory alignment with pedal onset synchronization and live comparison accuracy indicators (`lapAlignment.ts`).
  - Feature-preserving trajectory downsampling keeping apex minimums, braking initiation points, and straight speed maximums intact (`trajectoryDownsampler.ts`).
- **XML Session Log Parsing & Stewards Ledger**: Extracts timing, lap splits (S1/S2/S3), sector speeds, tire degradation, fuel consumption, multiclass driver classifications, contact collisions, track limit cuts, and steward penalties from LMU's `UserData/LOG/Results/*.xml`.
- **Physical Track Boundaries & Limit Corridors**: Physical road boundaries (`leftBoundary`, `rightBoundary`, `centerline`) in local x/z meters for each supported layout.
- **Unified Circuit Specifications & Layout Disambiguation**: Centralized single source of truth in `shared/domain/circuitSpecs.ts` and `shared/domain/circuitDefinitions.ts` (`CIRCUIT_SPECIFICATIONS`, `LMU_SCENE_DESC_MAP`, `getCircuitSpecification`). Directly maps all 32 layouts to their canonical `circuitId`, `layoutId`, `isDefaultLayout`, `sceneDescs`, and official `benchmarkName` targets without intermediate shims.
- **Three-Phase Corner Analysis & Consistency**: Deconstructs every turn on circuit into **Entry Phase** (braking point, peak hit, trail brake decay), **Rotation Phase** (apex minimum speed, yaw rotation rate, apex clipping proximity), and **Exit Phase** (throttle pick-up timing, ramp rate, traction), paired with corner consistency scoring.
- **Synchronized Multi-Channel Telemetry Studio**: Full spectrum of telemetry traces including speed, lap delta, pedals (throttle/brake with ABS/TC indicators), steering angle with real-time understeer/oversteer detection overlay, G-forces (Lat/Lon/Total Accel), yaw rate, body slip angle, 4-corner damper deflection, 4-wheel rotational speeds & slip, dynamic tire pressures & temps, stint tire wear degradation, 4-corner brake rotor thermals, and Hypercar hybrid powertrain (SoC, Virtual Energy, Regen).
- **G-G Traction Circle (Friction Diagram)**: Visualizes tire grip limits, combined braking/cornering forces, and traction envelopes.
- **Community Benchmark Tracking**: Synchronizes alien reference targets from Google Sheets with automated diff calculation (new, updated, and deprecated targets with patch version tracking).
- **Leaderboard & Rivals**: Ranks the real drivers met on each layout per car class (dry representative laps only, AI of offline sessions left out), and keeps a rival per board about 0.3 s ahead (or a ghost time) until it is beaten, with where the time is against it.
- **Deterministic Coaching Engine**: Ranks driving technique deficits (braking points, trail braking release, throttle application, apex speeds) using deterministic evidence (`priority = estimatedTimeLoss * repeatability * confidence`).
- **AI Race Engineer Reports**: Natural language coaching analysis and garage setup recommendations powered by Google Gemini (`@google/genai`).

---

## 2. Technology Stack & Architecture

### Frontend
- **React 19** with **TypeScript** (Strict mode)
- **Vite 8** (`vite.config.ts`) with custom manual chunking for optimal performance
- **Tailwind CSS v4** (`@tailwindcss/postcss` with dark motorsport UI theme)
- **Recharts** (Pace progression, multi-metric telemetry charts, speed/delta traces, corner speed graphs)
- **Lucide React** (Iconography)
- **Routing**: Client-side hash routing (`#session/:id`, `#track/:trackName`, `#leaderboard`, `#settings`, etc.) implemented in `src/utils/urlParams.ts`.

### Backend
- **Node.js** + **Express 5** (`server/index.ts`) running on port `3001` (dev proxy configured in `vite.config.ts`)
- **Better-SQLite3** with **WAL Mode** (`server/lmu_cache.db` schema and columnar storage managed in `server/core/db.ts` and `server/core/dbSchema.ts`)
- **DuckDB Node.js Reader** (`server/telemetry/duckdbReader.ts`) for high-throughput 100 Hz columnar querying
- **Fast-XML-Parser** (`server/sessions/parser.ts`, `server/sessions/sessionXmlStream.ts`) for high-throughput XML ingestion
- **Custom Binary VCR Parser & Worker** (`server/replay/decode/replayParser.ts`, `server/replay/worker/replayTrajectoryWorker.ts`) for non-blocking replay decoding
- **Google Gen AI SDK** (`@google/genai` in `server/ai/aiReport.ts`)

### Tooling & Native Utilities
- **C# .NET 8 Telemetry Recorder**: `tools/telemetry-recorder/` (probes and records live memory-mapped telemetry).
- **TSX Scripts & Offline Correlation**: `tools/analysis/` (offline correlation and reverse engineering).

---

## 3. Directory Layout

> **File-level map: [`docs/CODE_MAP.md`](docs/CODE_MAP.md).** It traces how data flows from each source to the screen, names
> the entry file of each feature, lists which cache version to bump, gives recipes for common changes, and keeps the list of
> known smells. Read it before searching the code, and update it in the same commit when you add or move a module,
> endpoint, table, route or cache version, or find or fix a smell.

| Folder | Holds |
|---|---|
| `docs/` | Reverse-engineered formats (`XML_FORMAT`, `VCR_FORMAT`, `VCR_ANALYSIS`, `TELEMETRY_FORMAT`), `LMU_REST_API`, `CODE_MAP`, `plans/` |
| `server/core/` | SQLite coordinator (`db.ts`), DDL (`dbSchema.ts`), one store module per table group, `ServerContext` (scans, enrichment) |
| `server/core/replay/` | Replay cache stores: metadata, trajectories, normalized facts, links, identity, upgrade, race positions |
| `server/sessions/` | XML parsing (`parser.ts`), lap classification, replay matching and links, pit stops, session analytics |
| `server/replay/` | Trajectory/telemetry services and upgrade runner; `decode/` (`.Vcr` decoding, lap slicing, facts, downsampling) and `worker/` (worker thread, its client and bootstrap) |
| `server/telemetry/` | DuckDB 100 Hz reader, catalog, session links, fusion with replay coordinates |
| `server/traffic/` | Every car's 5 Hz track position per replay (worker-built index) and traffic spells |
| `server/tracks/` | Track geometry, centerline projection, timing line cut, station glitch repair, outlines |
| `server/routes/` | One Express router per domain (`ai`, `leaderboard`, `reference`, `replay`, `session`, `system`) |
| `server/ai/`, `server/benchmarks/` | Gemini race engineer; Google Sheets benchmark scraper and diff |
| `public/tracks/` | 1:1 track boundary JSON per layout (exempt from the 20-file limit) |
| `shared/domain/` | Pure deterministic engines: circuits, vehicles, lap comparison, conditions, pace, pit stops, traffic, leaderboard, rivals |
| `shared/types/` | Canonical data contracts (`index.ts` for sessions and laps, plus leaderboard, pit stops, traffic, AI) |
| `src/api/` | The only place the client calls the server |
| `src/components/<feature>/` | UI by feature: `dashboard`, `session-list`, `session-detail`, `track-summaries`, `track-detail`, `leaderboard`, `replay`, `settings`, `navbar`, `common` |
| `src/utils/` | Client algorithms: corner analysis, lap alignment, replay comparison, computed telemetry, debrief ranking, text helpers, theme colors |
| `test/` | Mirrors the source tree (`server/<domain>/`, `domain/`, `utils/`, `components/<feature>/`, `api/`) plus `fixtures/` |
| `tools/` | C# live telemetry recorder and TSX analysis scripts (track boundaries, vehicle catalog) |

---

## 4. Non-Negotiable Domain Rules & Invariants

When adding features, fixing bugs, or refactoring code, adhere strictly to these domain invariants:

### A. Strict Circuit Layout Disambiguation & Single Source of Truth
- **Single Source of Truth**: All 32 circuit and layout definitions, benchmark targets, and native engine scene descriptors (`sceneDescs`) are centralized in `shared/domain/circuitDefinitions.ts` and resolved via `shared/domain/circuitSpecs.ts` (`CIRCUIT_SPECIFICATIONS`, `LMU_SCENE_DESC_MAP`, `getCircuitSpecification`).
- **Rule**: Never cross-pollinate benchmarks, records, or lap comparisons across differing layouts of the same facility (e.g. Monza GP vs. Curva Grande; Bahrain GP vs. Outer/Paddock; Sebring Full vs. School; Silverstone GP vs. National; Fuji GP vs. Classic; Paul Ricard 1A-V2 vs. Short).
- **Direct Resolution (No Shims)**: Always call `getCircuitSpecification(venueOrKey, course, sceneDesc, replayName, explicitKey, trackLengthMeters)` directly. Access `.layoutKey`, `.benchmarkName`, `.circuitId`, or `.layoutId` from the returned specification. Do not introduce intermediate wrappers, duplicate lookup tables, or shims.

### B. Lap Classification & Timing Integrity
- Laps are categorized into:
  - **Clean Flying Laps**: Valid laps completed at full racing speed without pit entry/exit.
  - **Start Laps**: Standing/rolling start laps or initial garage exit laps (excluded from flying averages).
  - **In-Laps**: Laps entering the pit lane (excluded from flying averages).
  - **Out-Laps**: Laps exiting the pit box / pit lane (excluded from flying averages).
  - **Incomplete / Partial Laps**: Crashed or disconnected laps (display estimated/partial time where possible; never treat as clean flying laps).
- **Rule**: True Pace (e.g. Top 3 Clean Lap Average) and Consistency Ratings **must only** include valid, clean flying laps.
- **One classification**: the session parser (`server/sessions/parser.ts`) infers missing lap times (`isInferred`) and marks out-laps (`isOutLap`) once. Views and analytics read those flags (`isRacingLap`, `selectCleanLapCandidates` in `shared/domain/lapComparison.ts`); never re-derive them from neighbouring laps (`isCompletedPitStop` is the parser's rule). Changing a rule means bumping `DB_PARSER_VERSION` so stored sessions are re-parsed.
- **Lap conditions**: dry is the default. A lap on wet tyres or in rain from the linked replay (`RAIN_WET_MIN`) carries `conditions` (`shared/domain/lapConditions.ts`), and off pace and consistency judge it against the driver's laps in the same conditions; the average stays the average of every clean lap. `classifySessionLaps` (`server/sessions/sessionLapClassification.ts`) is the one entry point: the parser runs it with the tyres, and `server/core/dbSessionConditions.ts` runs it again with the replay's rain when the session gets its replay or the replay's conditions are stored.

### C. Deterministic Logic First (AI Is Secondary)
- Calculations of deltas, telemetry traces, sector rankings, tire wear, pace categories, handling balance (understeer/oversteer), and coaching deficits **must be 100% deterministic**.
- Gemini / AI integration in `server/ai/aiReport.ts` is strictly for **natural language explanation and coaching narrative**. The AI must never be used to calculate raw metrics, detect laps, or assign priority scores.

### D. Replay Binary Stream Safety & Offloading
- Replay files (`.Vcr`) can exceed 300MB–1GB.
- Always use worker-thread decoding (`server/replay/worker/replayTrajectoryWorker.ts`) for CPU-heavy slice decoding to prevent blocking the Node.js event loop.
- Streaming and downsampling functions (`downsampleReplayTrajectory`) must preserve apex minimum speeds, maximum straight speeds, and braking initiation points while preventing frontend memory exhaustion.
- Cache processed trajectories and columnar channel data in SQLite (`server/core/db.ts`) with appropriate hash/timestamp invalidation.

### E. Physical Track Boundaries & Metric Integrity
- All track boundaries (`leftBoundary`, `rightBoundary`, `centerline`) stored in `public/tracks/` **must be strictly expressed in LMU local Cartesian coordinates** (`x, z` in meters).
- Never cross-pollinate track geometries across distinct layout variants of the same facility.

### F. Telemetry & Replay Ingestion Integrity
- **Multi-File Session Ownership**: Sessions may generate multiple DuckDB telemetry files over long multi-stint sessions. A session owns all corresponding DuckDB files (`telemetryLinks.ts`), and every lap must resolve directly to the specific file containing its timestamp range.
- **Strict Session-to-Replay Matching & Link Withdrawal**: Replays must be matched strictly against session metadata (layout, driver, timestamp constraints). Any invalid or mismatched link must be withdrawn (`replayMatching.ts` rules, applied by `sessionReplayLinks.ts`, recorded by `dbReplayLinkStore.ts`), never guessed.
- **Replay Identity Collision Protection**: Reused replay filenames must never overwrite existing cached sessions. Name collisions must be detected and archived with versioned timestamps (`dbReplayIdentity.ts`).
- **Timing Line-Crossing Continuity**: Laps cut at the start/finish line must be smoothly interpolated across boundary crossing points without losing 4-corner channels (tires, brakes, dampers) or inserting zeroed points (`lapLineCut.ts`).
- **Asynchronous Worker Decoding & Upgrades**: CPU-heavy replay decoding—both on-demand for uncached laps and in the background for legacy replay upgrades (`replayUpgradeRunner.ts`)—must execute in worker threads to prevent blocking the Node.js event loop.

---

## 5. Coding & Architecture Conventions

### TypeScript & Modules
- The repository is configured with `"type": "module"`. When writing relative imports in files processed under Node/ESM (such as `server/` or when importing local TS modules in certain test files), include `.js` extension where necessary (e.g., `import ... from './types.js'`).
- **Zero-`any` Policy**: The use of `any` is strictly forbidden anywhere in the repository (`src/`, `server/`, `test/`). Always use explicit domain models from `server/core/types.ts`, targeted TypeScript interfaces, union types, or `unknown` with runtime type narrowing / type guards.
- **Zero Warnings Standard**: Both production builds (`npm run build`) and test suites (`npm test`) must run with **zero warnings and zero errors**:
  - No chunk-size or rollup warnings (keep manual chunking configured in `vite.config.ts`).
  - No unhandled React test warnings (e.g., `act(...)` or uncaught async state updates; ensure components fetching geometry or data support optional injected props for deterministic testing or are cleanly awaited via `waitFor`).
  - No unused variables or parameters (`noUnusedLocals` and `noUnusedParameters` strictly enforced in `tsconfig.json`).
- **Strict File Size Limit**: All `.ts` and `.tsx` source and test files (`src/`, `server/`, `tools/`, `test/`) **must not exceed 1,000 lines**. If any module or test suite approaches or exceeds this limit, decompose it into focused submodules, dedicated data/definition files, cohesive helpers, or separate domain test suites.

### Database Patterns (`server/core/db.ts` & Modular Stores)
- Use **Better-SQLite3** with synchronous prepared statements (`db.prepare(...)`).
- WAL mode is mandatory: `PRAGMA journal_mode = WAL;`.
- **Modular Store Architecture**: one store module per table group under `server/core/` (`db<Name>Store.ts`: functions taking the better-sqlite3 `Database`), with the replay cache stores in `server/core/replay/`. `db.ts` is the instance coordinator, pragma configurator and transaction runner; DDL lives in `dbSchema.ts`. The table list is in `docs/CODE_MAP.md`.
- Use columnar tables for high-frequency telemetry data to maintain sub-millisecond query performance and compact storage.
- Always use parameterized queries (`stmt.run(arg1, arg2)`) to guard against SQL injection and handle player/track names containing special characters or apostrophes.
- Wrap bulk operations (e.g., scanning hundreds of XML files or saving hundreds of benchmark rows) in transactions: `db.transaction(...)`.

### UI & Component Architecture
- **Strict Component Size Limit**: Frontend components (`.tsx` files under `src/components/`) **must not exceed 300 lines**. If a component approaches or exceeds this limit, decompose it into focused sub-components, custom hooks, or utility functions in a feature subfolder.
- **Strict Folder File Limit (Max 20 Files per Directory)**:
  - Every directory in the codebase (`src/`, `server/`, `shared/`, `test/`) **must contain a maximum of 20 files**.
  - **Explicit Exception for Track Geometry Folder (`public/tracks/`)**:
    - `public/tracks/` is **explicitly exempt** from the 20-file limit. This directory stores the complete set of 1:1 local Cartesian boundary geometries across all 32 supported LMU layouts (`*.json` and `index.json`) and must remain flat for direct runtime spatial lookups.
  - When any non-exempt folder approaches or reaches 20 files, decompose it into focused subdirectories organized by **strict semantic boundaries** rather than arbitrary splits or flat catch-alls.
  - **Enforce Semantic Boundaries**:
    - **Frontend Components (`src/components/`)**: Group by feature domain (e.g., `dashboard/`, `session-detail/`, `track-detail/`, `replay/`). In complex subdomains (such as `replay/telemetry/`), group channel renderers by physical car subsystem semantics (e.g., chassis & dynamics, powertrain & hybrid energy, tires & brakes, driver inputs).
    - **Backend Pipeline (`server/`)**: Structure by clear pipeline and subsystem responsibilities (`ai/`, `benchmarks/`, `core/`, `replay/`, `routes/`, `sessions/`, `telemetry/`, `tracks/`).
    - **Domain Layer (`shared/`)**: Clean boundary between pure domain engines (`shared/domain/`) and canonical data contracts (`shared/types/`).
    - **Test Suites (`test/`)**: Mirror the exact semantic directory hierarchy of the application under test (e.g., `test/components/<feature>/`, `test/server/<domain>/`, `test/utils/`, `test/domain/`) instead of flat, monolithic test folders.
- Follow the established **sim-racing dark theme**:
  - Backgrounds: Dark slate/zinc (`bg-slate-900`, `bg-slate-950`, `bg-black/40`) with subtle borders (`border-slate-700`, `border-slate-800`).
  - Motorsport accents: Cyan/Sky (`text-sky-400`), Emerald (`text-emerald-400` for gains/personal bests), Amber/Orange (`text-amber-400` for warnings/moderate deltas), Rose/Red (`text-rose-400` for time loss/penalties).
  - Centralized Color Tokens: Reference `src/utils/themeColors.ts` for uniform visual styling.
  - Badges & Tables: Monospaced numbers (`font-mono`) for lap times, delta times, and telemetry units (km/h, °C, %, sec).
- Responsive & clean: Provide clear empty states, error fallbacks, and skeleton/loading indicators for async operations.

### API Requests (`src/api/`)
- Components and hooks call the server through `src/api/apiClient.ts` (`fetchJson`, `postJson`) or a domain loader built on it (`replayApi.ts`, `referenceApi.ts`, `leaderboardApi.ts`), never raw `fetch`.
- Paths are relative (`/api/...`); never hardcode the server origin or port.
- A non-2xx response rejects with `ApiError` (the server's `{ error }` message, status, body): show the message to the user rather than treating the failure as empty data. Ignore `isAbortError` rejections.
- Data that only changes on an explicit refresh (the benchmark table) is shared through its loader and invalidated after the refresh.

### Hash-Based Navigation
- The client uses React Router's `HashRouter` in `src/main.tsx` and route components in `src/App.tsx`.
- Read and update query parameters with React Router's `useSearchParams`; use `updateSearchParams` from `src/utils/urlParams.ts` when applying partial query updates so unrelated parameters are preserved.
- Do not add a competing hash parser or direct history manipulation that bypasses React Router.

---

## 6. Testing & Quality Assurance

The repository keeps an extensive automated test suite (counts in `docs/CODE_MAP.md`). Any change must preserve this coverage and run with zero warnings.

### Key Test Commands
- **Run all tests**: `npm test`
- **Watch mode**: `npm run test:watch`
- **Coverage report**: `npm run test:coverage` (fails below the thresholds in `vitest.config.ts`, set just under the measured coverage: raise them when coverage grows, never lower them to land a change)
- **TypeScript build check**: `npm run build`

### Testing Best Practices
- **Server API & DB Tests**: Located in `test/server/`. Use in-memory SQLite instances or isolated test database fixtures (`:memory:` or temporary test DB paths).
- **Component Tests**: Located in `test/components/`. Use `@testing-library/react` and Vitest jsdom environment.
- **Domain & Utils Tests**: `shared/domain/` engines in `test/domain/`; `src/utils/` algorithms (track limits, corner analysis, lap alignment) in `test/utils/`.
- **Route Tests**: Each router in `server/routes/` is tested in `test/server/routes/` by mounting it on its own Express app with supertest; `test/server/core/api.test.ts` only checks that `server/index.ts` wires the routers together.
- **Lap Alignment & Telemetry Golden Tests**: Located in `test/utils/lapAlignment/`. Validates station monotonic progression, boundary line-cut interpolation, downsampling fidelity, and golden invariant regressions.
- **Replay Parser Tests**: When testing `.Vcr` decoding, use fixtures from `test/fixtures/` or synthetic buffers constructed via `test/utils/mockVcr.ts`.

---

## 7. Recommended Development Workflow

1. **Understand Requirements**: Before making modifications, check whether changes touch session parsing (`server/sessions/`), replay decoding (`server/replay/`), telemetry ingestion (`server/telemetry/`), track geometry & timing loops (`server/tracks/`), database cache (`server/core/`), track boundaries, or UI views (`src/components/`).
2. **Preserve Documentation**: Retain all existing JSDoc comments, formulas, and format specifications in `docs/`.
3. **Execute & Verify**:
   - Run `npm test` to verify no regressions across the full suite.
   - Run `npm run build` to verify clean TypeScript compilation and bundle generation.
4. **Never bypass layout matching**: Any function dealing with tracks, laps, or reference times must account for track layout variants via `shared/domain/circuitSpecs.ts`.
