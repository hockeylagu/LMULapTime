# 🏎️ Le Mans Ultimate Lap Time Analyzer - Agent Guidelines (AGENTS.md)

This document provides architectural standards, domain rules, coding conventions, and operational workflows for AI agents working in this repository.

---

## 1. Project Overview & Domain Context

**LMU Lap Time Analyzer** is a telemetry analytics, lap comparison, and race intelligence hub for **Le Mans Ultimate (LMU)** (Studio 397 / Motorsport Games, rFactor 2 engine lineage).

### Key Capabilities:
- **Dual Telemetry Ingestion (100 Hz DuckDB & Binary VCR)**:
  - Ingests high-fidelity native 100 Hz columnar DuckDB telemetry (`UserData/Telemetry/*.duckdb`) with microsecond timestamp precision.
  - Reverse-engineers native `gMb1.002f` binary replay files (`UserData/Replays/*.Vcr`) using worker-thread decoding for 2D trajectories and multi-driver telemetry.
  - Slices continuous session logs into clean flying laps with sector boundary tags and fused spatial coordinates.
- **XML Session Log Parsing & Stewards Ledger**: Extracts timing, lap splits (S1/S2/S3), sector speeds, tire degradation, fuel consumption, multiclass driver classifications, contact collisions, track limit cuts, and steward penalties from LMU's `UserData/LOG/Results/*.xml`.
- **Physical Track Boundaries & Limit Corridors**: Pre-aligned physical road boundaries (`leftBoundary`, `rightBoundary`, `centerline`) in exact 1:1 LMU local Cartesian coordinates ($x, z$) across all 32 driven layouts.
- **Unified Circuit Specifications & Layout Disambiguation**: Centralized single source of truth in `shared/domain/circuitSpecs.ts` and `shared/domain/circuitDefinitions.ts` (`CIRCUIT_SPECIFICATIONS`, `LMU_SCENE_DESC_MAP`, `getCircuitSpecification`). Directly maps all 32 layouts to their canonical `circuitId`, `layoutId`, `isDefaultLayout`, `sceneDescs`, and official `benchmarkName` targets without intermediate shims.
- **Three-Phase Corner Analysis & Consistency**: Deconstructs every turn on circuit into **Entry Phase** (braking point, peak hit, trail brake decay), **Rotation Phase** (apex minimum speed, yaw rotation rate, apex clipping proximity), and **Exit Phase** (throttle pick-up timing, ramp rate, traction), paired with corner consistency scoring.
- **Synchronized Multi-Channel Telemetry Studio**: Full spectrum of telemetry traces including speed, lap delta, pedals (throttle/brake with ABS/TC indicators), steering angle with real-time understeer/oversteer detection overlay, G-forces (Lat/Lon/Total Accel), yaw rate, body slip angle, 4-corner damper deflection, 4-wheel rotational speeds & slip, dynamic tire pressures & temps, stint tire wear degradation, 4-corner brake rotor thermals, and Hypercar hybrid powertrain (SoC, Virtual Energy, Regen).
- **G-G Traction Circle (Friction Diagram)**: Visualizes tire grip limits, combined braking/cornering forces, and traction envelopes.
- **Community Benchmark Tracking**: Synchronizes alien reference targets from Google Sheets with automated diff calculation (new, updated, and deprecated targets with patch version tracking).
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
- **Routing**: Client-side hash routing (`#session/:id`, `#track/:trackName`, `#compare`, `#settings`, etc.) implemented in `src/utils/urlParams.ts`.

### Backend
- **Node.js** + **Express 5** (`server/index.ts`) running on port `3001` (dev proxy configured in `vite.config.ts`)
- **Better-SQLite3** with **WAL Mode** (`server/lmu_cache.db` schema and columnar storage managed in `server/core/db.ts` and `server/core/dbSchema.ts`)
- **DuckDB Node.js Reader** (`server/telemetry/duckdbReader.ts`) for high-throughput 100 Hz columnar querying
- **Fast-XML-Parser** (`server/sessions/parser.ts`, `server/sessions/sessionXmlStream.ts`) for high-throughput XML ingestion
- **Custom Binary VCR Parser & Worker** (`server/replay/replayParser.ts`, `server/replay/replayTrajectoryWorker.ts`) for non-blocking replay decoding
- **Google Gen AI SDK** (`@google/genai` in `server/ai/aiReport.ts`)

### Tooling & Native Utilities
- **C# .NET 8 Telemetry Recorder**: `tools/telemetry-recorder/` (probes and records live memory-mapped telemetry).
- **TSX Scripts & Boundary Pipeline**: `tools/analysis/` (`buildAllTrackBoundaries.ts`, offline correlation and reverse engineering).

---

## 3. Directory Layout

```
LMULapTime/
├── docs/                           # Reverse-engineered formats, specs & setup guides
│   ├── LMU_SETUP_AND_TELEMETRY_GUIDE.md # Methodical setup development workflow
│   ├── TELEMETRY_FORMAT.md         # DuckDB 100 Hz table schema & telemetry channels
│   ├── XML_FORMAT.md               # LMU XML Results log schema specification
│   ├── VCR_FORMAT.md               # Binary VCR header and stream packet layout
│   ├── VCR_ANALYSIS.md             # Technical deep-dive on binary decoding
│   ├── TRACK_BOUNDARIES_PIPELINE.md# Track boundary synthesis and addition guide
│   └── LMU_REST_API.md             # Embedded REST API (:6397) & Swagger reference
├── server/                         # Modular Express backend & ingestion pipeline
│   ├── ai/                         # Gemini AI race engineer analysis (aiReport.ts)
│   ├── benchmarks/                 # Google Sheets benchmark scraper & diff engine
│   ├── core/                       # Database abstraction, columnar store, context & types
│   │   ├── db.ts                   # SQLite instance, transactions, columnar telemetry tables
│   │   ├── dbSchema.ts             # DDL definitions and index setup
│   │   ├── dbReplaySync.ts         # Replay sync queries and transaction wrappers
│   │   ├── dbReplayTrajectoryStore.ts # Trajectory compression and columnar persistence
│   │   ├── replayTrajectoryCodec.ts # Trajectory encoding / decoding
│   │   ├── serverContext.ts        # Background scanner lifecycle and state coordinator
│   │   └── types.ts                # Core shared domain interfaces and telemetry models
│   ├── data/tracks/                # Pre-aligned 2D track boundary geometries & index.json
│   ├── replay/                     # Binary .Vcr parser, downsampler & worker thread decoder
│   │   ├── replayParser.ts         # Header, driver index & slice packet decoder
│   │   ├── replayTrajectory.ts     # Spatial coordinate extraction & downsampling
│   │   ├── replayLapBuilder.ts     # Timing loop detection & lap slicing
│   │   ├── replayCacheService.ts   # Replay cache inspection & management
│   │   ├── replayProgress.ts       # Progress reporting event emitter
│   │   ├── replayTrajectoryWorker.ts # Node worker thread implementation
│   │   └── replayTrajectoryWorkerClient.ts # Worker thread client pool
│   ├── routes/                     # Domain-scoped Express routers
│   │   ├── aiRoutes.ts             # /api/ai/* endpoints
│   │   ├── referenceRoutes.ts      # /api/reference-laptimes/* endpoints
│   │   ├── replayRoutes.ts         # /api/replays/* endpoints
│   │   ├── sessionRoutes.ts        # /api/sessions/* endpoints
│   │   └── systemRoutes.ts         # /api/system/* health and config endpoints
│   ├── sessions/                   # XML session results parsing & analytics
│   │   ├── parser.ts               # LmuParser class and driver profile detector
│   │   ├── sessionAnalytics.ts     # True Pace, sector averages, fuel/tire curves
│   │   ├── sessionXmlStream.ts     # Streaming XML parser
│   │   └── sessionXmlTypes.ts      # Raw XML schema interfaces
│   ├── telemetry/                  # 100 Hz DuckDB telemetry processing
│   │   ├── duckdbReader.ts         # Direct DuckDB columnar reader
│   │   ├── telemetryCatalog.ts     # File indexing and metadata extractor
│   │   ├── telemetryFusion.ts      # Merges DuckDB channels with VCR coordinates
│   │   └── telemetryMatcher.ts     # Matches session XMLs with telemetry files
│   │   ├── serverTrackSync.ts      # Disk to DB track geometry sync
│   │   └── trackProjection.ts      # Local coordinate transform utilities
│   └── index.ts                    # Express application entry point & router mounting
├── shared/                         # Pure domain logic & shared TypeScript types
│   ├── types/                      # Canonical domain models (DetailedSession, LapData, etc.)
│   └── domain/                     # Pure mathematical, formatting & circuit resolution engines
│       ├── circuitDefinitions.ts   # Canonical specs for all 32 circuits & layouts
│       ├── circuitSpecs.ts         # Single source of truth circuit resolution engine
│       ├── formatters.ts           # Lap time formatters & math
│       ├── lapComparison.ts        # Delta interpolation & sector calculations
│       ├── paceCategory.ts         # Pace percentages & vehicle class matching
│       ├── trackSummaryUtils.ts    # Multi-session track aggregation helpers
│       └── vehicleMapping.ts       # Car class categorization & model identification
├── public/tracks/                  # Mirrored track boundary JSON files for client map
├── src/                            # React 19 frontend
│   ├── App.tsx                     # Root component, tabs, hash routing & global state
│   ├── components/                 # Modular UI feature packages (<= 300 lines per file)
│   │   ├── common/                 # Badges, modals, pills, grids, selectors
│   │   ├── compare-laps/           # Lap-to-lap comparison studio & micro-sector tables
│   │   ├── dashboard/              # Cockpit hero, driving overview, sparklines, car/track summaries
│   │   ├── navbar/                 # Navigation header & background scan badge
│   │   ├── replay/                 # Replay studio, track map & telemetry strip
│   │   │   ├── analysis/           # Corner phase cards (Entry/Rotation/Exit), speed tables, AI tab
│   │   │   ├── inspector/          # Replay layout header, sidebar, lap picker, timeline footer
│   │   │   ├── map/                # 2D GPS track map scene, ribbons, friction circle, pan/zoom
│   │   │   └── telemetry/          # Multi-channel strip charts, presets modal, resolution popover
│   │   ├── session-detail/         # Multiclass standings, multi-metric charts, stewards log
│   │   ├── session-list/           # Filterable & searchable session history
│   │   ├── settings/               # Path configuration, rescan triggers, cache stats
│   │   ├── track-detail/           # Circuit layout telemetry, progression, benchmarks
│   │   └── track-summaries/        # Multi-track summary grid
│   ├── utils/                      # Frontend math, physics, graphics & telemetry utilities
│   │   ├── aiReportPayload.ts      # Telemetry evidence builder for AI Race Engineer
│   │   ├── computedTelemetry.ts    # Dynamic channel derivation (G-forces, slip, balance)
│   │   ├── cornerAnalysis.ts       # Turn detection, 3-phase corner metrics & deficit scoring
│   │   ├── cornerConsistency.ts    # Corner-by-corner repeatability scoring
│   │   ├── handlingBalanceDetection.ts # Real-time understeer / oversteer gradient calculation
│   │   ├── lapConsistency.ts       # Flying lap standard deviation & consistency rating
│   │   ├── replayComparison.ts     # Replay trajectory alignment & deltas
│   │   ├── telemetryPostProcessing.ts # Waveform smoothing and decimation
│   │   ├── themeColors.ts          # Centralized motorsport color palette tokens
│   │   ├── trackLimits.ts          # Boundary collision and lateral offset evaluation
│   │   └── urlParams.ts            # Hash-based navigation and query string persistence
│   └── index.css                   # Tailwind CSS imports & theme utilities
├── test/                           # Automated test suite (1,060+ tests across 128 files)
│   ├── components/                 # React component tests (@testing-library/react)
│   ├── fixtures/                   # Mock XML logs, binary VCR samples, telemetry files
│   ├── server/                     # Express routes, parser, DB, and DuckDB tests
│   ├── utils/                      # Unit tests for algorithms, math, and formatters
│   └── setup.ts                    # Vitest environment setup
├── tools/                          # C# recorder and standalone TSX utilities
├── package.json                    # Node scripts and dependencies
├── tsconfig.json                   # TypeScript configuration
└── vitest.config.ts                # Test runner & coverage configuration
```

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

### C. Deterministic Logic First (AI Is Secondary)
- Calculations of deltas, telemetry traces, sector rankings, tire wear, pace categories, handling balance (understeer/oversteer), and coaching deficits **must be 100% deterministic**.
- Gemini / AI integration in `server/ai/aiReport.ts` is strictly for **natural language explanation and coaching narrative**. The AI must never be used to calculate raw metrics, detect laps, or assign priority scores.

### D. Replay Binary Stream Safety & Offloading
- Replay files (`.Vcr`) can exceed 300MB–1GB.
- Always use worker-thread decoding (`server/replay/replayTrajectoryWorker.ts`) for CPU-heavy slice decoding to prevent blocking the Node.js event loop.
- Streaming and downsampling functions (`downsampleReplayTrajectory`) must preserve apex minimum speeds, maximum straight speeds, and braking initiation points while preventing frontend memory exhaustion.
- Cache processed trajectories and columnar channel data in SQLite (`server/core/db.ts`) with appropriate hash/timestamp invalidation.

### E. Physical Track Boundaries & Metric Integrity
- All track boundaries (`leftBoundary`, `rightBoundary`, `centerline`) stored in `server/data/tracks/` and `public/tracks/` **must be strictly expressed in LMU local Cartesian coordinates** (`x, z` in meters).
- Alignment scale factors ($s$) relative to real LMU replay telemetry must adhere to $0.99 < s < 1.01$ (exact 1:1 metric modeling).
- Never cross-pollinate track geometries across distinct layout variants of the same facility.
- When a new track or layout is driven, follow the procedure in `docs/TRACK_BOUNDARIES_PIPELINE.md` using `tools/analysis/buildAllTrackBoundaries.ts`.

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

### Database Patterns (`server/core/db.ts`)
- Use **Better-SQLite3** with synchronous prepared statements (`db.prepare(...)`).
- WAL mode is mandatory: `PRAGMA journal_mode = WAL;`.
- Use columnar tables for high-frequency telemetry data to maintain sub-millisecond query performance and compact storage.
- Always use parameterized queries (`stmt.run(arg1, arg2)`) to guard against SQL injection and handle player/track names containing special characters or apostrophes.
- Wrap bulk operations (e.g., scanning hundreds of XML files or saving hundreds of benchmark rows) in transactions: `db.transaction(...)`.

### UI & Component Architecture
- **Strict Component Size Limit**: Frontend components (`.tsx` files under `src/components/`) **must not exceed 300 lines**. If a component approaches or exceeds this limit, decompose it into focused sub-components, custom hooks, or utility functions in a feature subfolder.
- Follow the established **sim-racing dark theme**:
  - Backgrounds: Dark slate/zinc (`bg-slate-900`, `bg-slate-950`, `bg-black/40`) with subtle borders (`border-slate-700`, `border-slate-800`).
  - Motorsport accents: Cyan/Sky (`text-sky-400`), Emerald (`text-emerald-400` for gains/personal bests), Amber/Orange (`text-amber-400` for warnings/moderate deltas), Rose/Red (`text-rose-400` for time loss/penalties).
  - Centralized Color Tokens: Reference `src/utils/themeColors.ts` for uniform visual styling.
  - Badges & Tables: Monospaced numbers (`font-mono`) for lap times, delta times, and telemetry units (km/h, °C, %, sec).
- Responsive & clean: Provide clear empty states, error fallbacks, and skeleton/loading indicators for async operations.

### Hash-Based Navigation
- The client uses React Router's `HashRouter` in `src/main.tsx` and route components in `src/App.tsx`.
- Read and update query parameters with React Router's `useSearchParams`; use `updateSearchParams` from `src/utils/urlParams.ts` when applying partial query updates so unrelated parameters are preserved.
- Do not add a competing hash parser or direct history manipulation that bypasses React Router.

---

## 6. Testing & Quality Assurance

The repository maintains an extensive automated test suite with **over 1,060 tests across 128 test files**. Any change must preserve this coverage and run with zero warnings.

### Key Test Commands
- **Run all tests**: `npm test`
- **Watch mode**: `npm run test:watch`
- **Coverage report**: `npm run test:coverage`
- **TypeScript build check**: `npm run build`

### Testing Best Practices
- **Server API & DB Tests**: Located in `test/server/`. Use in-memory SQLite instances or isolated test database fixtures (`:memory:` or temporary test DB paths).
- **Component Tests**: Located in `test/components/`. Use `@testing-library/react` and Vitest jsdom environment.
- **Utils Tests**: Pure functions for math, formatting, track limits, and pace categorization in `test/utils/`.
- **Replay Parser Tests**: When testing `.Vcr` decoding, use fixtures from `test/fixtures/` or synthetic buffers constructed via `test/utils/mockVcr.ts`.

---

## 7. Recommended Development Workflow

1. **Understand Requirements**: Before making modifications, check whether changes touch session parsing (`server/sessions/`), replay decoding (`server/replay/`), telemetry ingestion (`server/telemetry/`), database cache (`server/core/db.ts`), track boundaries (`tools/analysis/buildAllTrackBoundaries.ts`), or UI views (`src/components/`).
2. **Preserve Documentation**: Retain all existing JSDoc comments, formulas, and format specifications in `docs/`.
3. **Execute & Verify**:
   - Run `npm test` to verify no regressions across the 1,060+ unit/integration tests.
   - Run `npm run build` to verify clean TypeScript compilation and bundle generation.
4. **Never bypass layout matching**: Any function dealing with tracks, laps, or reference times must account for track layout variants via `src/utils/circuitSpecs.ts`.
