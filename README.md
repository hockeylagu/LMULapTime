# 🏎️ Le Mans Ultimate Lap Time Analyzer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57.svg)](https://sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-579%20Passing-brightgreen.svg)](https://vitest.dev/)

A modern, high-performance telemetry analytics suite, lap comparison studio, and race intelligence hub for **Le Mans Ultimate (LMU)** (Studio 397 / Motorsport Games). Automatically scans session XML logs and reverse-engineers native binary `.Vcr` replays to deliver professional-grade driver coaching, synchronized multi-metric waveforms, physical track limit corridors, and alien benchmark tracking.

---

### ⚡ Feature Highlights at a Glance

| Feature Hub | Core Capabilities |
| :--- | :--- |
| **🤖 AI Race Engineer & Coaching** | Deterministic technique deficit ranking ($P = \text{Loss} \times \text{Repeatability} \times \text{Confidence}$) + Google Gemini debriefs. |
| **🛰️ 2D Replay & Trajectory Studio** | Native binary `gMb1.002f` parser, synchronized interactive playback scrubber, 4-wheel corner telemetry gauges. |
| **🏁 Physical Track Boundaries** | Pre-aligned road limits & asphalt corridors across **all 21 driven layouts** in exact 1:1 LMU simulation coordinates ($x, z$). |
| **🔬 Deep Lap Comparison Studio** | Head-to-head delta analysis, micro-sector time divergence ($\pm$s), theoretical optimal lap, and synchronized telemetry overlays. |
| **📊 Session Telemetry & Stewards Log** | Class classifications, incident ledger (penalties, collisions, cut warnings), flying lap filtering, and stint tire/fuel consumption. |
| **📈 Historical Pace & Progression** | Top 3 Clean Lap Average (True Pace), lap consistency rating (%), execution gap tracking, and multi-class car model filters. |
| **🌐 Community Benchmarks & Diff Sync** | Live Google Sheets alien benchmark sync with automated changelog highlighting new, updated, and deprecated targets. |
| **⚡ Blazing-Fast SQLite WAL Cache** | Incremental sync, non-blocking background replay scanner, and sub-millisecond query performance. |

---

## ✨ In-Depth Feature Tour

### 🤖 1. Deterministic Coaching Engine & AI Race Engineer
- **Deterministic Technique Deficit Ranking**:
  - Automatically identifies and ranks your top driving technique deficits across every corner using pure deterministic evidence:
    $$\text{Priority} = \text{Estimated Time Loss} \times \text{Repeatability} \times \text{Confidence}$$
  - Evaluates **Braking Points** (early/late braking initiation), **Trail Braking Shape** (pressure decay rate and release area), **Throttle Application** (distance from apex to initial pick-up and ramp rate to 100%), **Apex Minimum Speed**, and **Line Deviation**.
  - **Evidence-Linked Drilldown**: Click directly on any coaching finding to immediately focus on the corner, compare baseline vs. target laps, and inspect synchronized telemetry waveforms.
- **Natural Language Coaching Reports (Google Gemini)**:
  - Powered by `@google/genai` to synthesize telemetry metrics into actionable engineer debriefs, technique critiques, and garage setup advice.
  - Generates comprehensive post-stint summaries, tire management guidance, and session improvement tips.
- **Historical Coaching & Progression Archive**:
  - Automatically persists historical coaching reports in SQLite cache, allowing you to review your technique progression across multiple sessions.

---

### 🛰️ 2. Binary VCR Replay & Trajectory Telemetry Studio
- **Native Binary VCR Decoder (`gMb1.002f`)**: Directly extracts high-frequency time-slice positions, multi-driver telemetry, and official Class 6 Type 6 timing loops without relying on third-party companion tools.
- **Interactive 2D Trajectory Map**:
  - Renders the complete circuit layout with customizable colored racing lines (**Speed gradient**, **Throttle/Brake application**, and **Lateral Yaw**).
  - Synchronized interactive playback scrubber with live apex position tracking, corner metrics, and start/finish loops.
- **Synchronized Telemetry Traces**:
  - Real-time waveforms for **Speed** (km/h), **Throttle** (0–100%), **Brake** (0–100%), **Steering Yaw Angle**, and **Gear**.
- **Live 4-Wheel Corner Telemetry**:
  - Class 0 Type 15 packet decoding delivering independent 4-corner telemetry for **Tire Temperatures** (Carcass & Inner layers in °C), **Dynamic Tire Wear degradation**, and **Brake Disc Rotor Temperatures**.
- **Pit Stop & Garage Lifecycle Intelligence**:
  - Event-driven tracking of pit lane entrance, pit box stop durations, refueling/tire servicing intervals, pit lane exit, and garage motion states (`inPit`, `inGarage`).
- **Format Specification**: Comprehensive reverse-engineered binary specification documented in [`docs/VCR_FORMAT.md`](docs/VCR_FORMAT.md).

---

### 🏁 3. Physical Track Boundaries & Limit Corridors (21 Driven Layouts)
- **Full Physical Road Corridors**:
  - Automatically generates and pre-aligns physical left and right boundary polygons (`leftBoundary`, `rightBoundary`, `centerline`) in exact LMU simulation coordinates ($x, z$).
  - Evaluates track limit respect and racing line placement relative to actual kerb limits and road margins.
- **Multi-Source Ingestion & 1-Step Procrustes Alignment**:
  - **TUM Racetrack Database**: Surveyed boundaries for Monza GP, Spa, COTA, Barcelona, Interlagos, Silverstone, and Bahrain GP.
  - **Track-Atlas & OpenStreetMap GPS**: Curvature-adaptive centerlines with FIA/ACO homologation road width profiling for Le Mans 24h, Imola, Daytona Road Course, Fuji, Laguna Seca, and Sebring Full.
  - **LMU Telemetry Corridors**: Native high-frequency physics extraction for circuit layout variants (Monza Curva Grande, Fuji Classic, Bahrain Outer, Bahrain Paddock, Sebring School, Lusail Short, Paul Ricard Short, Portimão WEC).
- **Fast 60fps Client-Side Rendering**: Pre-calculated coordinates stored in `server/data/tracks/` and mirrored to `public/tracks/` for zero-overhead client rendering in `GpsTrackMapScene`.
- **Pipeline Architecture & Adding New Tracks**: Fully automated via `npx tsx tools/analysis/buildAllTrackBoundaries.ts` and documented in [`docs/TRACK_BOUNDARIES_PIPELINE.md`](docs/TRACK_BOUNDARIES_PIPELINE.md).

---

### 🔬 4. Deep Lap Comparison Studio
- **Head-to-Head Delta Analysis**: Compare any lap against your **Personal Best**, **Session Best**, **Theoretical Optimal Sectors**, **All-Time Track Record**, or **Community Benchmark Targets**.
- **Micro Delta Breakdowns**: Real-time sector-by-sector delta color-coding (green for time gained, red for time lost) and speed differentials ($\pm$ km/h).
- **Synchronized Telemetry Traces**: Overlay throttle, brake, speed, and steering angle waveforms across distance or elapsed lap time.
- **Interactive Time Delta Chart**: Visual representation of pace divergence across every corner and straight.
- **Strict Circuit Layout Disambiguation**: Prevents cross-pollinating benchmarks or comparisons between distinct layout variants (e.g. Monza GP vs. Curva Grande; Bahrain GP vs. Outer vs. Paddock; Sebring Full vs. School).

---

### 📊 5. Comprehensive Session Telemetry & Stewards Log
- **Multi-Metric Telemetry Charts**: Switch between **Lap Pace**, **Sector Times (S1 / S2 / S3)**, **Top Speed**, **Tire Wear degradation** (FL, FR, RL, RR, Avg), and **Fuel & Virtual Energy** stint consumption.
- **Flying Lap & Out-Lap Intelligence**:
  - Automatically identifies **Start Laps** (standing/rolling starts or garage exits).
  - Flags **Pit Stop in-laps** and **Out-laps** (pit exit laps), excluding them from flying average pace and pace consistency ratings.
  - Plots estimated/inferred lap times for incomplete laps so no telemetry data is lost.
- **Multiclass Race Classification**: Tracks both **Class Position** (Hypercar, LMP2, LMGT3, GTE) and **Overall Position**, with position deltas ($\Delta$), gaps to class leader, and finish statuses (Finished, DNF, DNS, DQ).
- **Session Stewards Log & Incident Timeline**:
  - Extracts penalties, contact collisions, cut-track warnings, and mechanical damage events from XML results.
  - Displays elapsed lap time, driver involved, and penalty severity in a dedicated stewards ledger.
- **Session Rules & Server Badges**: Visualizes server configuration (Damage, Tire Warmers, Fixed Setups, ParcFermé, Multipliers) directly from session logs.
- **Results XML Specification**: Comprehensive technical specification of the simulation results log format and available data structures documented in [`docs/XML_FORMAT.md`](docs/XML_FORMAT.md).

---

### 📈 6. Historical Progression & Track Intelligence
- **True Pace Progression**: Tracks clean flying lap trends, 3-session moving averages, and your **Top 3 Clean Lap Average (True Pace)** over time.
- **Pace Consistency Rating (%)**: Evaluates driving consistency based on lap time standard deviation across clean flying laps.
- **Theoretical Execution Gap**: Visualizes the delta between your actual fastest lap and your optimal theoretical sectors ($S1 + S2 + S3$).
- **Multi-Class & Car Model Filters**: Filter analytics across Hypercar (LMH/LMDh), LMP2, LMGT3, and specific vehicle models (e.g. Porsche 911 GT3 R, Ferrari 499P, BMW M4 GT3).

---

### 🌐 7. Live Community Benchmark Sync & Update Changelog
- **Google Sheets Benchmark Sync**: Synchronizes the latest community reference lap times directly into SQLite.
- **Benchmark Update Changelog**: Whenever you refresh reference benchmarks, the built-in diff engine automatically highlights:
  - 🟢 **New References**: Newly added track and car class targets.
  - 🟡 **Updated Targets**: Adjusted Alien targets with before/after lap times, delta ($\Delta$), and game patch updates (e.g. `Patch 1.3 → 1.4+`).
  - 🔴 **Removed References**: Deprecated benchmark targets.

---

### ⚡ 8. Blazing-Fast SQLite Caching & Background Replay Scanner
- **Zero-Lag Incremental Sync**: Incremental file modification checking (`mtime` & file size). Only newly created or modified XML files are reparsed.
- **Asynchronous Background Scanner**: Automatically indexes and downsamples binary replays in a low-priority background thread with real-time UI status tracking in the navigation bar.
- **Replay Cache Management**: In-app cache inspection card displaying total parsed replays, trajectory size, memory footprint, and rescan controls.
- **Instantaneous Lookups**: Indexed queries for tracks, timestamps, and driver sessions using Write-Ahead Logging (WAL).

---

## 🛠️ Technology Stack

- **Frontend**:
  - [React 19](https://react.dev/) & [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
  - [Vite 8](https://vitejs.dev/) - Fast frontend build tool
  - [Tailwind CSS v4](https://tailwindcss.com/) - Curated dark motorsport UI aesthetic
  - [Recharts](https://recharts.org/) - Interactive telemetry and delta charts
  - [Lucide Icons](https://lucide.dev/) - Clean iconography
- **Backend**:
  - [Node.js](https://nodejs.org/) & [Express 5](https://expressjs.com/)
  - [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) with Write-Ahead Logging (WAL)
  - [Fast-XML-Parser](https://github.com/NaturalIntelligence/fast-xml-parser) - High-throughput XML parsing
  - Custom Binary `.Vcr` Parser with 4-wheel telemetry & pitstop state machine
  - [Google Gen AI SDK](https://github.com/googleapis/genai-js) (`@google/genai`) - AI race engineer post-stint coaching
- **Native Tools & Diagnostics**:
  - **C# .NET 8 Telemetry Recorder** (`tools/telemetry-recorder/`) - Real-time memory-mapped telemetry probes
  - **TSX Offline Analysis & Geometry Pipeline** (`tools/analysis/`) - Replay binary verification, boundary generation (`buildAllTrackBoundaries.ts`), and correlation utilities
- **Testing**:
  - [Vitest](https://vitest.dev/) & [Testing Library](https://testing-library.com/) - **579+ automated unit and integration tests** (45 test suites)

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18.0 or newer)
- [Le Mans Ultimate](https://lemansultimate.com/) installed on your computer
- *(Optional)* Google Gemini API key for AI Race Engineer coaching reports

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/LMULapTime.git
   cd LMULapTime
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment (Optional)**:
   Create a `.env` file in the project root if you want to enable Gemini AI coaching reports:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Start the application**:
   ```bash
   npm run dev
   ```
   *Windows users can also simply double-click `launch.bat`.*

5. **Open your browser**:
   - Frontend: [http://localhost:5173](http://localhost:5173)
   - Backend API: [http://localhost:3001](http://localhost:3001)

---

## ⚙️ Configuration & Directory Setup

By default, the application detects standard Steam installation paths:
- **Results XML Directory**: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\LOG\Results`
- **Replays Directory**: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Replays`

You can change these paths at any time via the in-app **Settings** tab:
1. Navigate to **Settings** in the top navigation bar.
2. Enter your custom results directory and replays directory.
3. Optionally enter your **In-Game Driver Profile Name** to automatically prioritize your driver telemetry.
4. Inspect or clear SQLite cache statistics in the **Replay Cache** card.
5. Click **Rescan & Load Telemetry**.

For a controlled workflow that turns lap comparison, corner phases, tyre trends, and coaching evidence into LMU garage decisions, see the [`LMU Setup Development with Telemetry and Coaching` guide](docs/LMU_SETUP_AND_TELEMETRY_GUIDE.md).

---

## 🧪 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts both frontend (Vite) and backend (Express) concurrently with hot-reload. |
| `npm run dev:server` | Runs the backend server using `tsx watch`. |
| `npm run dev:client` | Runs the Vite client development server. |
| `npm run build` | Runs TypeScript typechecks and compiles the production client bundle. |
| `npm test` | Runs all 579+ automated test suites with Vitest. |
| `npm run test:watch` | Runs Vitest in interactive watch mode. |
| `npm run test:coverage` | Generates detailed test coverage reports. |
| `npm run telemetry:probe` | Probes live memory-mapped telemetry structures via .NET 8 tool. |
| `npm run telemetry:record`| Records live session telemetry to disk via .NET 8 tool. |
| `npm run vcr:correlate` | Runs offline correlation between XML results and binary replay streams. |

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/<your-username>/LMULapTime/issues).
