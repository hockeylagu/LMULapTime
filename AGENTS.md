# 🏎️ Le Mans Ultimate Lap Time Analyzer - Agent Guidelines (AGENTS.md)

This document provides architectural standards, domain rules, coding conventions, and operational workflows for AI agents working in this repository.

---

## 1. Project Overview & Domain Context

**LMU Lap Time Analyzer** is a telemetry analytics, lap comparison, and race intelligence hub for **Le Mans Ultimate (LMU)** (Studio 397 / Motorsport Games, rFactor 2 engine lineage).

### Key Capabilities:
- **XML Session Log Parsing**: Extracts timing, lap splits (S1/S2/S3), sector speeds, tire degradation, fuel consumption, driver classifications, and penalties from LMU's `UserData/LOG/Results/*.xml`.
- **Binary Replay (`.Vcr`) Parsing**: Custom reverse-engineered parser for native `gMb1.002f` binary replay files, extracting high-frequency 2D racing lines, yaw, throttle/brake inputs, steering, gear, and 4-wheel corner telemetry (tire carcass/inner temps, rotor temps, dynamic wear).
- **Track Layout Matching**: Disambiguates circuit variations (e.g. Monza GP vs. Curva Grande, Bahrain GP vs. Outer vs. Paddock, Paul Ricard Full vs. Short, Sebring Full vs. School).
- **Community Benchmark Tracking**: Synchronizes alien reference targets from Google Sheets with automated diff calculation (new, updated, deprecated targets).
- **Deterministic Coaching Engine**: Ranks driving technique deficits (braking points, trail braking release, throttle application, apex speeds) using deterministic evidence (`priority = estimatedTimeLoss * repeatability * confidence`).
- **AI Race Engineer Reports**: Optional natural language coaching analysis powered by Google Gemini (`@google/genai`).

---

## 2. Technology Stack & Architecture

### Frontend
- **React 19** with **TypeScript** (Strict mode)
- **Vite 8** (`vite.config.ts`)
- **Tailwind CSS v4** (`@tailwindcss/postcss` with dark motorsport UI theme)
- **Recharts** (Pace progression, multi-metric telemetry charts, speed/delta traces)
- **Lucide React** (Iconography)
- **Routing**: Client-side hash routing (`#session/:id`, `#track/:trackName`, `#compare`, `#settings`, etc.) implemented in `src/utils/urlParams.ts`.

### Backend
- **Node.js** + **Express 5** (`server/index.ts`) running on port `3001` (dev proxy configured in `vite.config.ts`)
- **Better-SQLite3** with **WAL Mode** (`server/lmu_cache.db` schema managed in `server/db.ts`)
- **fast-xml-parser** (`server/parser.ts`) for high-throughput XML ingestion
- **Custom Binary VCR Parser** (`server/replayParser.ts`)
- **Google Gen AI SDK** (`@google/genai` in `server/aiReport.ts`)

### Tooling & Native Utilities
- **C# .NET 8 Telemetry Recorder**: `tools/telemetry-recorder/` (probes and records live memory-mapped telemetry).
- **TSX Scripts**: `tools/analysis/` for offline correlation and reverse engineering.

---

## 3. Directory Layout

```
LMULapTime/
├── docs/                   # Reverse-engineered formats, specs & coaching plans
│   ├── XML_FORMAT.md       # LMU XML Results log schema specification
│   ├── VCR_FORMAT.md       # Binary VCR header and stream packet layout
│   └── VCR_ANALYSIS.md     # Technical deep-dive on binary decoding
├── server/                 # Express backend & ingestion pipeline
│   ├── index.ts            # API routes and server entry
│   ├── db.ts               # Better-SQLite3 database abstraction & caching
│   ├── parser.ts           # XML session log parser & profile auto-detector
│   ├── replayParser.ts     # Binary .Vcr parser (trajectories, 4-corner telemetry)
│   ├── referenceLaptimes.ts# Google Sheets CSV benchmark scraper & diff engine
│   ├── aiReport.ts         # Gemini AI race engineer analysis
│   └── types.ts            # Shared TypeScript interfaces & types
├── src/                    # React frontend
│   ├── App.tsx             # Root app component, tabs & global state
│   ├── components/         # Modular UI features
│   │   ├── common/         # Badges, modals, loading spinners, metric cards
│   │   ├── compare-laps/   # Head-to-head lap & sector delta analyzer
│   │   ├── dashboard/      # Overview, stats, recent sessions, quick benchmarks
│   │   ├── navbar/         # Navigation header & background scan badge
│   │   ├── replay/         # 2D track map, telemetry traces, 4-wheel gauges
│   │   ├── session-detail/ # Multi-metric charts, lap table, standings, logs
│   │   ├── session-list/   # Filterable & searchable session history
│   │   ├── settings/       # Path configuration, rescan triggers, cache stats
│   │   ├── track-detail/   # Track layout telemetry, progression, benchmarks
│   │   └── track-summaries/# Multi-track summary grid
│   ├── utils/              # Data processing, formatters, math & physics
│   │   ├── cornerAnalysis.ts
│   │   ├── formatters.ts   # Lap time formatters (m:ss.sss, deltas)
│   │   ├── lapComparison.ts# Delta interpolations and sector calculations
│   │   ├── paceCategory.ts # Alien to Offline benchmark classifications
│   │   ├── replayComparison.ts
│   │   ├── telemetryPostProcessing.ts
│   │   └── urlParams.ts    # Hash-based navigation utilities
│   └── index.css           # Tailwind CSS imports & theme utilities
├── test/                   # Vitest automated test suite (530+ tests)
│   ├── components/         # React component tests
│   ├── fixtures/           # Mock XML logs and binary VCR samples
│   ├── server/             # Express routes, parser, and DB tests
│   ├── utils/              # Unit tests for algorithms and formatters
│   └── setup.ts            # Vitest environment setup
├── tools/                  # C# recorder and standalone TSX utilities
├── package.json            # Node scripts and dependencies
├── tsconfig.json           # TypeScript configuration
└── vitest.config.ts        # Test runner & coverage configuration
```

---

## 4. Non-Negotiable Domain Rules & Invariants

When adding features, fixing bugs, or refactoring code, adhere strictly to these domain invariants:

### A. Strict Circuit Layout Disambiguation
- LMU tracks frequently share a venue name but have drastically distinct layouts (e.g. Monza GP vs. Curva Grande; Bahrain GP vs. Outer vs. Paddock; Paul Ricard 1A-V2 vs. Short; Sebring International vs. School).
- **Rule**: Never cross-pollinate benchmarks, records, or lap comparisons across differing layouts of the same facility.
- Use layout normalization helpers (`normalizeTrackName`, `getTrackLayoutKey`) to ensure layout integrity.

### B. Lap Classification & Timing Integrity
- Laps are categorized into:
  - **Clean Flying Laps**: Valid laps completed at full racing speed without pit entry/exit.
  - **Start Laps**: Standing/rolling start laps or initial garage exit laps (excluded from flying averages).
  - **In-Laps**: Laps entering the pit lane (excluded from flying averages).
  - **Out-Laps**: Laps exiting the pit box / pit lane (excluded from flying averages).
  - **Incomplete / Partial Laps**: Crashed or disconnected laps (display estimated/partial time where possible; never treat as clean flying laps).
- **Rule**: True Pace (e.g. Top 3 Clean Lap Average) and Consistency Ratings **must only** include valid, clean flying laps.

### C. Deterministic Logic First (AI Is Secondary)
- Calculations of deltas, telemetry traces, sector rankings, tire wear, pace categories, and coaching deficits **must be 100% deterministic**.
- Gemini / AI integration in `server/aiReport.ts` is strictly for **natural language explanation and coaching narrative**. The AI must never be used to calculate raw metrics, detect laps, or assign priority scores.

### D. Replay Binary Stream Safety
- Replay files (`.Vcr`) can exceed 300MB–1GB.
- Ensure streaming/downsampling functions (`downsampleReplayTrajectory`) preserve apex minimum speeds, maximum straight speeds, and braking initiation points while preventing frontend memory exhaustion.
- Cache processed trajectories and metadata in SQLite (`server/db.ts`) with appropriate hash/timestamp invalidation.

---

## 5. Coding & Architecture Conventions

### TypeScript & Modules
- The repository is configured with `"type": "module"`. When writing relative imports in files processed under Node/ESM (such as `server/` or when importing local TS modules in certain test files), include `.js` extension where necessary (e.g., `import ... from './types.js'`).
- Avoid `any`. Use strict domain models from `server/types.ts` or declare targeted interfaces.

### Database Patterns (`server/db.ts`)
- Use **Better-SQLite3** with synchronous prepared statements (`db.prepare(...)`).
- WAL mode is mandatory: `PRAGMA journal_mode = WAL;`.
- Always use parameterized queries (`stmt.run(arg1, arg2)`) to guard against SQL injection and handle player/track names containing special characters or apostrophes.
- Wrap bulk operations (e.g., scanning hundreds of XML files or saving hundreds of benchmark rows) in transactions: `db.transaction(...)`.

### UI & Component Architecture
- **Strict Component Size Limit**: Frontend components (`.tsx` files under `src/components/`) **must not exceed 300 lines**. If a component approaches or exceeds this limit, decompose it into focused sub-components, custom hooks, or utility functions in a feature subfolder.
- Follow the established **sim-racing dark theme**:
  - Backgrounds: Dark slate/zinc (`bg-slate-900`, `bg-slate-950`, `bg-black/40`) with subtle borders (`border-slate-700`, `border-slate-800`).
  - Motorsport accents: Cyan/Sky (`text-sky-400`), Emerald (`text-emerald-400` for gains/personal bests), Amber/Orange (`text-amber-400` for warnings/moderate deltas), Rose/Red (`text-rose-400` for time loss/penalties).
  - Badges & Tables: Monospaced numbers (`font-mono`) for lap times, delta times, and telemetry units (km/h, °C, %, sec).
- Responsive & clean: Provide clear empty states, error fallbacks, and skeleton/loading indicators for async operations.

### Hash-Based Navigation
- The client uses hash routing without full page reloads to ensure seamless local file and web server compatibility:
  - Read/write routes using `src/utils/urlParams.ts` (`getHashRouteAndParams`, `updateHashParams`, `setHashRoute`).
  - Do not introduce conflicting browser history pushState patterns that break hash route persistence.

---

## 6. Testing & Quality Assurance

The repository maintains an extensive automated test suite with over 530 tests. Any change must preserve this coverage.

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

1. **Understand Requirements**: Before making modifications, check whether changes touch session parsing (`server/parser.ts`), replay decoding (`server/replayParser.ts`), database cache (`server/db.ts`), or UI views (`src/components/`).
2. **Preserve Documentation**: Retain all existing JSDoc comments, formulas, and format specifications in `docs/`.
3. **Execute & Verify**:
   - Run `npm test` to verify no regressions across the 530+ unit/integration tests.
   - Run `npm run build` to verify clean TypeScript compilation and bundle generation.
4. **Never bypass layout matching**: Any function dealing with tracks, laps, or reference times must account for track layout variants.
