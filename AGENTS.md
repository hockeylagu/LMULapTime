# 🏎️ Le Mans Ultimate Lap Time Analyzer — Agent Guidelines (AGENTS.md)

Architectural standards, domain rules, and coding conventions for AI agents.
> **Detailed code map & smells backlog**: [`docs/CODE_MAP.md`](docs/CODE_MAP.md). Format specs: `docs/XML_FORMAT.md`, `docs/VCR_FORMAT.md`, `docs/TELEMETRY_FORMAT.md`, `docs/LIVE_CAPTURE_FORMAT.md`, `docs/LMU_REST_API.md`.

---

## 1. Project Overview & Tech Stack

Telemetry analytics, lap comparison, and race intelligence hub for **Le Mans Ultimate (LMU)** (rFactor 2 engine lineage). Ingests 100 Hz DuckDB telemetry, binary `.Vcr` replays, XML session logs, and live app capture streams (`*.live.duckdb`).

- **Frontend**: React 19, TypeScript (strict), Vite 8, Tailwind CSS v4, Recharts, Lucide React, Hash routing (`HashRouter`).
- **Backend**: Node.js + Express 5 (port 3001), Better-SQLite3 (WAL mode), DuckDB Node reader, Fast-XML-Parser, Koffi (rFactor 2 shared memory FFI), worker threads (VCR decoding, live recording, learning), Server-Sent Events (SSE), Google Gen AI SDK (`@google/genai`).
- **Tools**: TSX telemetry recorder (`tools/telemetryRecorder.ts`), TSX analysis scripts (`tools/analysis/`), benchmark suites (`tools/benchmarks/`), data guard scripts (`tools/release/checkLocalData.mjs`).

---

## 2. Directory Layout

| Folder | Contents |
|---|---|
| `docs/` | Reverse-engineered specs, API docs, plans, and [`CODE_MAP.md`](docs/CODE_MAP.md) |
| `server/core/` | SQLite coordinator (`db.ts`), schema (`dbSchema.ts`), modular stores (`ingest/`, `live/`, `replay/`, `sessionRows/`, `sessionSummaries/`) |
| `server/live/` | Live capture controller, RF2 shared memory reader, LMU REST poller, SSE streamer, learning runtime (`capture/`, `learning/`) |
| `server/sessions/` | XML parser (`parser.ts`), lap classification, replay matching, pit stops, analytics |
| `server/replay/` | Trajectory/telemetry services, upgrade runner, `decode/` (.Vcr decoding), `worker/` (worker thread) |
| `server/telemetry/` | DuckDB 100 Hz reader, catalog, session links, coordinate fusion |
| `server/traffic/` | Replay 5 Hz track position index and traffic spells |
| `server/tracks/` | Track geometry, centerline projection, timing line cuts, station glitch repair |
| `server/routes/` | Express domain routers (`ai`, `leaderboard`, `live`, `liveEvidence`, `reference`, `replay`, `session`, `system`, `dataPlugin`), readiness gates |
| `server/ai/`, `server/benchmarks/` | Gemini race engineer; Google Sheets alien benchmarks scraper and diff |
| `server/plugins/` | Local package loaders for detailed track geometry and manufacturer assets |
| `public/track-outlines/` | Bundled basic SVG illustrations (metric data stays in external local packages) |
| `shared/domain/` | Deterministic domain engines (circuits, vehicles, laps, conditions, pace, pit stops, traffic, rivals, `learning/`, `live/`, `sessionSummaries/`) |
| `shared/types/` | Canonical TypeScript contracts (`index.ts` barrel, plus domain-specific type files) |
| `src/api/` | Frontend API client and domain fetchers (sole bridge to server) |
| `src/components/<feature>/` | UI features: `dashboard`, `track-summaries`, `session-list`, `session-detail`, `track-detail`, `leaderboard`, `replay`, `live`, `settings`, `navbar`, `vehicle`, `common` |
| `src/utils/` | Client algorithms (corners, alignment, debrief, computed telemetry, theme tokens) |
| `test/` | Mirrors source tree: `test/server/`, `test/components/`, `test/domain/`, `test/utils/`, `test/fixtures/` |
| `tools/` | TSX recorder (`telemetryRecorder.ts`), TSX analysis scripts, performance benchmarks (`benchmarks/`), and data guards (`release/`) |

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

### G. Live Capture, Evidence & Online Learning Invariants
- **Worker-Owned DuckDB Recording**: Active `.live.duckdb` capture files are exclusively owned and written by worker threads (`recordingWorker.ts`). The main thread and HTTP evidence readers must never write to active recordings; read operations use read-only handles or queue evidence reads to eliminate DuckDB file lock contention.
- **Strict XML Reconciliation & Ownership**: Completed live captures are reconciled against official XML session logs (`reconcile.ts`, `dbLiveCaptureStore.ts`). Live evidence supplements and enriches telemetry data without overwriting official XML lap times or timing line definitions.
- **Deterministic Online Learning & Acceptance Gates**: Learned model corrections (`shared/domain/learning/`, `server/live/learning/`) must pass acceptance calibration gates (`calibration.ts`, `evaluate.ts`) before being applied or committed to SQLite (`dbLiveLearningStore.ts`, `dbLearningModelStore.ts`). If a projection refresh fails or is discarded, existing committed models must continue serving without interruption.

---

## 4. Coding & Architecture Conventions

### TypeScript & Modules
- **`npm run lint`** enforces type safety and promise handling; its errors say how to fix them. Design rules it also enforces: `src/` and `shared/` never import `server/`, no import cycles, exhaustive switches over unions, max 1,000 lines per file and 300 per `src/components/**/*.tsx`.
- **Types**: Use canonical models from `shared/types/`, telemetry reader contracts from `server/telemetry/duckdbTypes.ts`, or `unknown` with narrowing.
- **Zero Warnings**: `npm run build`, `npm run lint` and `npm test` finish with zero warnings and zero errors (incl. rollup chunk and React `act(...)` warnings).
- **Max 20 files per directory** (excluding the repository root and `public/track-outlines/`); split into focused subdirectories when approaching it.
- **No re-exports or trivial forwarders**: import from the defining module (sole barrel: `shared/types/index.ts`); call canonical implementations directly and update all call sites during refactors.

### Database Patterns (`server/core/db.ts` & Modular Stores)
- Use **Better-SQLite3** with synchronous prepared statements and mandatory **WAL mode** (`PRAGMA journal_mode = WAL;`).
- **Modular Stores**: Modular stores organized by table group in `server/core/` (`dbSessionStore.ts`, `dbSessionSync.ts`), `server/core/replay/`, `server/core/live/`, `server/core/sessionRows/`, and `server/core/sessionSummaries/`. Schema DDL in `dbSchema.ts`.
- **Data Repairs**: Keep domain data rewrites out of schema initialization. Use versioned reparses or projection rebuilds with canonical domain logic; preserve sessions whose source files were deleted. Remove obsolete one-off migration scripts when the versioned path supersedes them, and review migration code whenever its schema changes.
- **Summary Readiness Gate**: Return 503 on history endpoints while session summaries rebuild (`summaryReadiness.ts` checking `idx_sessions_ready`).
- Use columnar tables for high-frequency telemetry. Parameterize all queries (`stmt.run(arg)`). Wrap bulk operations in `db.transaction(...)`.

### UI & Styling
- Sim-racing dark theme: slate/zinc backgrounds (`bg-slate-900`, `bg-slate-950`), subtle borders (`border-slate-700`), motorsport accents (`text-sky-400`, `text-emerald-400`, `text-amber-400`, `text-rose-400`). Reference `src/utils/themeColors.ts`.
- Monospace font (`font-mono`) for lap times, deltas, and telemetry values. Provide empty, loading, and error states.
- Detailed geometry is loaded from external packages via `server/plugins/`; never commit detailed geometry under `public/`.

### API & Routing
- Call the backend through `src/api/apiClient.ts` (`fetchJson`, `postJson`) or domain API modules, with relative `/api/...` paths.
- Handle `ApiError` by displaying its message; ignore `isAbortError`.
- Navigation uses `HashRouter`. Manage query parameters with React Router's `useSearchParams` and `updateSearchParams` from `src/utils/urlParams.ts`.

---

## 5. Testing & Quality Assurance

- **Run all tests**: `npm test`
- **Lint**: `npm run lint` (oxlint type-aware, `.oxlintrc.json`). Fix the code before opting out; every opt-out needs a reason (`-- reason` on disable comments, a trailing comment on each `"off"`), checked by `tools/release/checkLintReasons.mjs`.
- **Watch mode**: `npm run test:watch`
- **Coverage report**: `npm run test:coverage` (enforces thresholds in `vitest.config.ts`; never lower thresholds).
- **Typecheck & Build**: `npm run build`
- **Test Placement**: Mirrors source tree (`test/server/`, `test/components/`, `test/domain/`, `test/utils/`). Use in-memory SQLite (`:memory:`) or isolated test fixtures.
- **Endpoint Performance**: Run `npm run benchmark:endpoints` before and after changes affecting API performance; review rankings in `docs/performance/ENDPOINT_BENCHMARKS.md`.

---

## 6. Development Workflow

1. Identify affected layers (session parsing, replay decoding, telemetry, track geometry, SQLite store, UI).
2. Maintain documentation and formulas (`docs/`). Follow [documentation lifecycle](docs/DOCUMENTATION.md); use the repository [doc-keeping skill](.agents/skills/doc-keeping/SKILL.md) for plan/decision reviews, documentation cleanup, and substantial changes to requirements or delivery status. Review and update the owning format spec alongside parser, reader/writer, schema, channel, unit, timing or compatibility changes; specs are the canonical written contracts, with unresolved observations kept in analysis. Keep durable rationale discoverable; delete completed plans and one-off validation reports without continuing purpose after preserving still-needed content and checking Git history; code comments can own local rationale without a duplicate document.
3. Adhere to track layout disambiguation via `shared/domain/circuitSpecs.ts`.
4. Keep all test suites and builds passing with **zero warnings and zero errors**.
