# 🏎️ Le Mans Ultimate Lap Time Analyzer — Agent Guidelines (AGENTS.md)

Architectural standards, domain rules, and coding conventions for AI agents.
> **Detailed code map & smells backlog**: [`docs/CODE_MAP.md`](docs/CODE_MAP.md). Format specs: `docs/XML_FORMAT.md`, `docs/VCR_FORMAT.md`, `docs/TELEMETRY_FORMAT.md`.

---

## 1. Project Overview & Tech Stack

Telemetry analytics, lap comparison, and race intelligence hub for **Le Mans Ultimate (LMU)** (rFactor 2 engine lineage). Ingests 100 Hz DuckDB telemetry, binary `.Vcr` replays, and XML session logs.

- **Frontend**: React 19, TypeScript (strict), Vite 8, Tailwind CSS v4, Recharts, Lucide React, Hash routing (`HashRouter`).
- **Backend**: Node.js + Express 5 (port 3001), Better-SQLite3 (WAL mode), DuckDB Node reader, Fast-XML-Parser, worker-thread VCR decoder, Google Gen AI SDK (`@google/genai`).
- **Tools**: TSX telemetry recorder (`tools/telemetryRecorder.ts`), TSX analysis scripts (`tools/analysis/`).

---

## 2. Directory Layout

| Folder | Contents |
|---|---|
| `docs/` | Reverse-engineered specs, API docs, plans, and [`CODE_MAP.md`](docs/CODE_MAP.md) |
| `server/core/` | SQLite coordinator (`db.ts`), schema (`dbSchema.ts`), modular stores (`db*Store.ts`), context |
| `server/core/replay/` | Replay cache stores (metadata, trajectories, links, identity, upgrades, positions) |
| `server/sessions/` | XML parser (`parser.ts`), lap classification, replay matching, pit stops, analytics |
| `server/replay/` | Trajectory/telemetry services, upgrade runner, `decode/` (.Vcr decoding), `worker/` (worker thread) |
| `server/telemetry/` | DuckDB 100 Hz reader, catalog, session links, coordinate fusion |
| `server/traffic/` | Replay 5 Hz track position index and traffic spells |
| `server/tracks/` | Track geometry, centerline projection, timing line cuts, station glitch repair |
| `server/routes/` | Express domain routers (`ai`, `leaderboard`, `reference`, `replay`, `session`, `system`, `dataPlugin`) |
| `server/ai/`, `server/benchmarks/` | Gemini race engineer; Google Sheets alien benchmarks scraper and diff |
| `server/plugins/` | Local package loaders for detailed track geometry and manufacturer assets |
| `public/track-outlines/` | Bundled basic SVG illustrations (metric data stays in external local packages) |
| `shared/domain/` | Deterministic domain engines (circuits, vehicles, laps, conditions, pace, pit stops, traffic, rivals) |
| `shared/types/` | Canonical TypeScript contracts (`index.ts` barrel, plus domain-specific type files) |
| `src/api/` | Frontend API client and domain fetchers (sole bridge to server) |
| `src/components/<feature>/` | UI features: `dashboard`, `session-list`, `session-detail`, `track-detail`, `leaderboard`, `replay`, `settings`, `common` |
| `src/utils/` | Client algorithms (corners, alignment, debrief, computed telemetry, theme tokens) |
| `test/` | Mirrors source tree: `test/server/`, `test/components/`, `test/domain/`, `test/utils/`, `test/fixtures/` |
| `tools/` | C# recorder and TSX correlation utilities |

---

## 3. Non-Negotiable Domain Rules & Invariants

### A. Circuit Layout Disambiguation (Single Source of Truth)
- **Central Definition**: All 32 layouts, benchmark targets, and engine `sceneDescs` are defined in `shared/domain/circuitDefinitions.ts` and resolved via `shared/domain/circuitSpecs.ts` (`getCircuitSpecification`).
- **Never Cross-Pollinate**: Never mix records, benchmarks, or trajectories across different layouts of the same facility (e.g. Monza GP vs. Curva Grande; Bahrain GP vs. Outer; Sebring Full vs. School; Silverstone GP vs. National; Paul Ricard 1A-V2 vs. Short).
- **Direct Resolution (No Shims)**: Call `getCircuitSpecification(...)` directly. Never add lookup tables, wrappers, or shims.

### B. Lap Classification & Timing Integrity
- **Categories**: Clean Flying, Start, In-Lap, Out-Lap, Incomplete/Partial.
- **True Pace & Consistency**: Must **only** include valid, clean flying laps.
- **Single Classification Source**: The parser (`server/sessions/parser.ts`) sets flags (`isInferred`, `isOutLap`, `isCompletedPitStop`) once. Views and analytics consume them (`isRacingLap`, `selectCleanLapCandidates`); never re-derive from adjacent laps. Changing rules requires bumping `DB_PARSER_VERSION`.
- **Lap Conditions**: Dry by default. Wet tyres or replay rain (`RAIN_WET_MIN`) set `conditions` via `classifySessionLaps` (`server/sessions/sessionLapClassification.ts`). Compare pace/consistency against laps in matching conditions; clean lap average covers all clean laps.

### C. Deterministic Logic First (AI Is Secondary)
- Deltas, telemetry traces, sector rankings, tire wear, pace categories, handling balance, and coaching deficits must be **100% deterministic** (`priority = estimatedTimeLoss * repeatability * confidence`).
- AI (`server/ai/aiReport.ts`) is strictly for natural language explanation and coaching narrative. Never use AI to compute metrics or scores.

### D. Replay Binary Stream Safety
- Replay files (`.Vcr`, 300MB–1GB+) must be decoded in worker threads (`replayTrajectoryWorker.ts`) to avoid blocking the event loop.
- Downsampling (`downsampleReplayTrajectory`) must preserve apex speed minimums, straight maximums, and braking onset points. Cache results in SQLite.

### E. Physical Track Boundaries
- Boundaries (`leftBoundary`, `rightBoundary`, `centerline`) must use LMU local Cartesian coordinates (`x, z` in meters). Never cross-pollinate between layouts.

### F. Telemetry & Ingestion Integrity
- **Write-Once Results XMLs**: Completed results XMLs are immutable. Standard scans skip already stored paths without stat/fingerprint checks. Reparse only on parser version bump, explicit force reparse, or prior read failure.
- **Multi-File DuckDB Sessions**: Sessions can span multiple DuckDB files (`telemetryLinks.ts`). Every lap resolves to the file covering its timestamps.
- **Session-Replay Matching**: Match strictly on layout, driver, and timestamp constraints (`replayMatching.ts`). Withdraw invalid links (`dbReplayLinkStore.ts`); never guess. Protect against reused replay filenames with collision versioning (`dbReplayIdentity.ts`).
- **Timing Line Continuity**: Interpolate start/finish line crossings smoothly (`lapLineCut.ts`) without losing 4-corner channels or injecting zeroed samples. Repair station glitches (`stationGlitches.ts`).

---

## 4. Coding & Architecture Conventions

### TypeScript & Modules
- **ESM**: Module type `"type": "module"`. Include `.js` extensions on relative imports in Node/ESM contexts (`server/`, `shared/`, `test/`).
- **Zero-`any`**: Forbidden everywhere (`src/`, `server/`, `test/`). Use canonical models from `shared/types/`, telemetry reader contracts from `server/telemetry/duckdbTypes.ts`, strict interfaces, or `unknown` with type narrowing.
- **Zero Warnings Standard**: Production builds (`npm run build`) and test runs (`npm test`) must finish with **zero warnings and zero errors** (no rollup chunk warnings, unhandled React `act(...)` warnings, or unused variables).
- **Strict File Size Limits**:
  - Max **1,000 lines** for any `.ts` / `.tsx` source or test file.
  - Max **300 lines** for frontend components (`src/components/**/*.tsx`).
  - Max **20 files** per directory (excluding `public/track-outlines/`). Split into semantically focused subdirectories when approaching limit.
- **No Unnecessary Re-exports / Direct Imports**: Do not import and re-export symbols without an architectural reason. Import directly from defining modules; do not leave pass-through barrels or re-export shims. (The sole approved barrel is `shared/types/index.ts`).
- **No Shim Methods / Trivial Forwarders**: Do not write wrapper functions that merely forward calls to another function without added logic or abstraction. Call canonical implementations directly; update all call sites during refactors.

### Database Patterns (`server/core/db.ts` & Modular Stores)
- Use **Better-SQLite3** with synchronous prepared statements and mandatory **WAL mode** (`PRAGMA journal_mode = WAL;`).
- **Modular Stores**: One store module per table group in `server/core/` (`db<Name>Store.ts`) and `server/core/replay/`. Schema DDL in `dbSchema.ts`.
- **Data Repairs**: Keep domain data rewrites out of schema initialization. Use versioned reparses or projection rebuilds with canonical domain logic; preserve sessions whose source files were deleted. Remove obsolete one-off migration scripts when the versioned path supersedes them, and review migration code whenever its schema changes.
- Use columnar tables for high-frequency telemetry. Parameterize all queries (`stmt.run(arg)`). Wrap bulk operations in `db.transaction(...)`.

### UI & Styling
- Sim-racing dark theme: slate/zinc backgrounds (`bg-slate-900`, `bg-slate-950`), subtle borders (`border-slate-700`), motorsport accents (`text-sky-400`, `text-emerald-400`, `text-amber-400`, `text-rose-400`). Reference `src/utils/themeColors.ts`.
- Monospace font (`font-mono`) for lap times, deltas, and telemetry values. Provide empty, loading, and error states.
- Detailed geometry is loaded from external packages via `server/plugins/`; never commit detailed geometry under `public/`.

### API & Routing
- Call backend through `src/api/apiClient.ts` (`fetchJson`, `postJson`) or domain API modules—never raw `fetch`. Use relative `/api/...` paths.
- Handle `ApiError` by displaying its message; ignore `isAbortError`.
- Navigation uses `HashRouter`. Manage query parameters with React Router's `useSearchParams` and `updateSearchParams` from `src/utils/urlParams.ts`.

---

## 5. Testing & Quality Assurance

- **Run all tests**: `npm test`
- **Watch mode**: `npm run test:watch`
- **Coverage report**: `npm run test:coverage` (enforces thresholds in `vitest.config.ts`; never lower thresholds).
- **Typecheck & Build**: `npm run build`
- **Test Placement**: Mirrors source tree (`test/server/`, `test/components/`, `test/domain/`, `test/utils/`). Use in-memory SQLite (`:memory:`) or isolated test fixtures.
- **Endpoint Performance**: Run `npm run benchmark:endpoints` before and after changes affecting API performance; review rankings in `docs/ENDPOINT_BENCHMARKS.md`.

---

## 6. Development Workflow

1. Identify affected layers (session parsing, replay decoding, telemetry, track geometry, SQLite store, UI).
2. Maintain documentation and formulas (`docs/`).
3. Adhere to track layout disambiguation via `shared/domain/circuitSpecs.ts`.
4. Keep all test suites and builds passing with **zero warnings and zero errors**.
