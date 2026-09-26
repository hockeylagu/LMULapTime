# 🏎️ Le Mans Ultimate Lap Time Analyzer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57.svg)](https://sqlite.org/)
[![DuckDB](https://img.shields.io/badge/DuckDB-100Hz%20Telemetry-FFF000.svg)](https://duckdb.org/)
[![Tests](https://img.shields.io/badge/Tests-1060%2B%20Passing-brightgreen.svg)](https://vitest.dev/)

A modern, high-performance telemetry analytics suite, lap comparison studio, and race intelligence hub for **Le Mans Ultimate (LMU)** (Studio 397 / Motorsport Games). Built for sim racers and endurance teams who want to find lap time, master vehicle dynamics, optimize setups, and compare their driving against alien benchmarks.

Plug-and-play with zero manual configuration: automatically indexes native session logs, high-fidelity 100 Hz telemetry, and binary replays into a lightning-fast motorsport analytics dashboard.

---

## ⚡ What You Can Do

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           LMU LAP TIME ANALYZER                        │
  ├───────────────────────────────────┬────────────────────────────────────┤
  │ 🏎️  Cockpit & Driver Dashboard    │ 🗺️  Interactive 2D GPS Replay Map   │
  │    Personal bests, pace trends,   │    Asphalt limits, apex speeds,    │
  │    consistency & execution gaps   │    racing lines & friction circle  │
  ├───────────────────────────────────┼────────────────────────────────────┤
  │ 🎯  Corner Technique Breakdown    │ 📈  Synchronized Telemetry Studio  │
  │    Entry braking, rotation apex,  │    Speed, pedals, steering yaw,    │
  │    and exit throttle pick-up      │    4-wheel temps, wear & hybrid    │
  ├───────────────────────────────────┼────────────────────────────────────┤
  │ ⚔️  Head-to-Head Lap Battles      │ 🤖  AI Race Engineer Debriefs      │
  │    Micro-sector delta splits &    │    Ranked technique deficits &     │
  │    theoretical optimal laps       │    Gemini garage setup advice      │
  ├───────────────────────────────────┼────────────────────────────────────┤
  │ 📋  Race Stewards & Session Logs  │ 🌐  Live Alien Benchmark Sync      │
  │    Standings, tire/fuel curves,   │    Community reference lap times   │
  │    penalties & collision ledger   │    with patch update changelogs    │
  └───────────────────────────────────┴────────────────────────────────────┘
```

---

## 🌟 Feature Tour

### 🏎️ 1. Cockpit Dashboard & Performance Hub
- **Driver Hero Banner**: Immediate visibility into your all-time stats, total driven sessions, track coverage, personal bests, and True Pace.
- **True Pace (Top 3 Clean Lap Average)**: Strips away lucky one-off laps to show your genuine, repeatable race pace.
- **Consistency Rating (%)**: Evaluates your driving precision across clean flying laps, flagging erratic stints.
- **Execution Gap Tracker**: Highlights the difference between your single fastest lap and your theoretical optimal sectors ($S1 + S2 + S3$).
- **Visual Stint Sparklines**: Real-time pace progression mini-charts across your recent outings.
- **Multiclass Filtering**: Switch effortlessly between Hypercar (LMH/LMDh), LMP2, LMGT3, and GTE, or filter down to specific car models (e.g. Ferrari 499P, Porsche 911 GT3 R, BMW M4 GT3).

---

### 🗺️ 2. Interactive 2D GPS Track Map & Replay Studio
- **Full Physical Track Limits**: Exact 1:1 scale road boundaries, asphalt corridors, and pit lanes across all 32 driven layouts.
- **Multi-Mode Colored Racing Lines**:
  - **Speed Heatmap**: Spot corner apex minimums and maximum straight speeds at a glance.
  - **Pedal Application**: Visualize brake release, trail braking duration, and throttle commitment zones.
  - **Lateral G & Yaw**: Identify high-load cornering phases and car rotation behavior.
- **Dynamic G-G Friction Circle**: Real-time traction diagram mapping longitudinal vs. lateral acceleration to visualize tire grip utilization and vehicle balance envelope.
- **Synchronized Playback Scrubber**: Scrub through any lap with full playback controls, corner apex markers, and a live telemetry HUD.
- **Mini-Corner Focus**: Dedicated zoomed minimaps that isolate individual turns during deep analysis.

---

### 🎯 3. Turn-by-Turn Corner Analysis & Driving Technique
- **Complete Corner Speed Breakdown**: Detailed table and delta graphs comparing your corner speeds, braking initiation points, and apex speeds against reference laps.
- **Three-Phase Corner Deconstruction**:
  - **Entry Phase**: Measures braking point distance, peak brake application, and trail-braking pressure decay rate.
  - **Rotation Phase**: Measures minimum corner speed, yaw rotation rate, and apex clipping proximity.
  - **Exit Phase**: Measures throttle pick-up timing relative to apex, throttle ramp rate, and traction stability on corner exit.
- **Corner Consistency Scoring**: Automatically spots which specific turns cost you time through erratic braking or inconsistent lines across stints.

---

### 📈 4. High-Precision Multi-Channel Telemetry Studio
Synchronized multi-metric telemetry traces across distance or elapsed lap time:

| Telemetry Channel | What It Shows |
| :--- | :--- |
| **Speed & Lap Delta** | Speed trace overlaid with live +/- time divergence (green for gains, red for time lost). |
| **Pedal Inputs** | Throttle and brake pedal positions with active **ABS** and **Traction Control (TC)** cut indicators. |
| **Steering & Balance** | Steering angle trace with real-time **Understeer / Oversteer** balance detection. |
| **G-Forces (Accel)** | Longitudinal acceleration (braking/acceleration), Lateral G (cornering load), and Total G vector. |
| **Dynamics** | Vehicle yaw rate, body slip angle, and lateral racing line offset. |
| **Suspension** | 4-corner suspension deflection and damper travel (FL, FR, RL, RR) in millimeters. |
| **Wheel Speeds & Slip** | Individual 4-wheel rotational velocity and dynamic slip to detect lockups and wheelspin. |
| **Tire Temps & Pressures** | Dynamic 4-wheel tire pressures (kPa) and inner/carcass temperatures (°C). |
| **Tire Degradation** | Stint tire wear progression (0–100%) for all 4 corners. |
| **Brake Thermals** | 4-corner brake rotor temperatures (°C) to monitor thermal fade and cooling duct efficiency. |
| **Hypercar Hybrid Powertrain** | Virtual Energy stint tank, high-voltage State of Charge (SoC), and MGU-K regen rates. |

- **Customizable Presets**: Switch instantly between layout presets (*Driver Inputs*, *Chassis Dynamics*, *Tires & Thermals*, *Brakes*, *Hybrid Powertrain*, or *All Channels*). Reorder channels, toggle traces, and save your own custom layouts.
- **Adjustable Resolution**: Toggle high-density downsampling to balance ultra-fine telemetry fidelity with smooth 60fps chart rendering.

---

### ⚔️ 5. Head-to-Head Lap Comparison Studio
- **Lap-to-Lap Battles**: Compare any two laps side-by-side—your personal best, session best, community alien benchmark, or a teammate's lap.
- **Micro-Sector Delta Splits**: Color-coded sector-by-sector time differentials ($\pm$s) and speed deltas ($\pm$ km/h).
- **Interactive Delta Curve**: Pinpoints the exact meter on circuit where time was gained or lost.
- **Theoretical Optimal Lap Builder**: Synthesizes your best individual sectors ($S1 + S2 + S3$) into an ultimate benchmark target.
- **Strict Layout Disambiguation**: Guarantees comparisons only happen between identical track configurations (e.g. Monza GP never mixes with Curva Grande; Bahrain GP never mixes with Outer or Paddock).

---

### 🤖 6. AI Race Engineer & Automated Driver Coaching
- **Deterministic Deficit Ranking**:
  - Automatically identifies and ranks your top driving technique deficits across every corner using deterministic telemetry evidence:
    $$\text{Priority} = \text{Estimated Time Loss} \times \text{Repeatability} \times \text{Confidence}$$
  - No AI hallucinations—priorities are rooted purely in physics, telemetry deltas, and repeatability.
  - **1-Click Drilldown**: Click any coaching finding to immediately zoom into the corner on the GPS track map and overlay telemetry waveforms.
- **Natural Language Race Engineer Debriefs (Google Gemini)**:
  - Powered by `@google/genai` to synthesize telemetry into actionable driver debriefs, technique critiques, and garage setup recommendations.
  - Explains *why* time was lost (e.g. overslowing at apex, oversaturating front tires on entry, hesitating on throttle pick-up) and gives concrete setup tweaks to address car balance.
- **Historical Coaching Archive**: Saves coaching debriefs so you can track your skill progression over time.

---

### 📋 7. Session Intelligence & Race Stewards Ledger
- **Multiclass Race Classifications**: Full standings with class positions, interval gaps to the leader, finish statuses (Finished, DNF, DNS, DQ), and position changes ($\Delta$).
- **Clean Flying Lap Filtering**: Automatically separates valid flying laps from standing/rolling starts, garage exits, in-laps, and out-laps.
- **Race Stewards Incident Ledger**:
  - Automatically extracts penalties, contact collisions, track limit cuts, and mechanical damage from session logs.
  - Displays elapsed session time, driver involved, and penalty severity in a dedicated stewards timeline.
- **Server Rules & Setup Badges**: Inspects server settings (Mechanical Damage, Tire Warmers, Fixed Setups, Parc Fermé, Fuel/Tire Multipliers) directly from session logs.

---

### 🏁 8. Circuit Database & 32 Layouts
- **Comprehensive WEC & IMSA Coverage**: Built-in specifications, turn counts, official lengths, elevation profiles, and famous corners for **32 distinct layouts**:
  - Autodromo Nazionale Monza (GP, Curva Grande)
  - Circuit de Spa-Francorchamps
  - Circuit de la Sarthe / Le Mans 24h
  - Sebring International Raceway (Full, School)
  - Bahrain International Circuit (GP, Outer, Paddock)
  - Circuit of the Americas (COTA)
  - Autódromo José Carlos Pace (Interlagos)
  - Fuji Speedway (GP, Classic)
  - Autodromo Internazionale Enzo e Dino Ferrari (Imola)
  - Lusail International Circuit (Qatar GP, Short)
  - Autódromo Internacional do Algarve (Portimão WEC)
  - Silverstone Circuit (GP, National)
  - Circuit Paul Ricard (1A-V2, Short)
  - Daytona International Speedway (Road Course)
  - WeatherTech Raceway Laguna Seca
  - Circuit de Barcelona-Catalunya

---

### 🌐 9. Live Community Alien Benchmarks
- **Live Google Sheets Sync**: Fetches community alien reference times directly into the application with 1 click.
- **Benchmark Update Changelog**: Built-in diff engine automatically detects and highlights:
  - 🟢 **New Benchmarks**: Newly added car classes and track combinations.
  - 🟡 **Updated Targets**: Adjusted reference lap times with game patch tags (e.g. `Patch 1.3 → 1.4+`) and time deltas ($\Delta$).
  - 🔴 **Retired Targets**: Deprecated or superseded benchmark times.

---

### 🔌 10. Seamless Plug & Play Integration
- **Zero-Configuration Setup**: Automatically detects your Steam installation, session logs (`UserData/LOG/Results/*.xml`), 100 Hz telemetry files (`UserData/Telemetry/*.duckdb`), and replays (`UserData/Replays/*.Vcr`).
- **Blazing-Fast SQLite WAL Cache**: Uses Write-Ahead Logging for instant queries and non-blocking background replay indexing.
- **Replay Cache Manager**: In-app management view showing cached replays, memory footprint, and 1-click rescan controls.

---

## 🛠️ Architecture & Deep-Dive Documentation

For engineers, modders, and telemetry enthusiasts interested in the underlying reverse-engineered data structures and pipelines:

- [`docs/LMU_SETUP_AND_TELEMETRY_GUIDE.md`](docs/LMU_SETUP_AND_TELEMETRY_GUIDE.md): Methodical guide to developing LMU car setups using telemetry and coaching evidence.
- [`docs/TELEMETRY_FORMAT.md`](docs/TELEMETRY_FORMAT.md): Detailed schema of native LMU 100 Hz DuckDB telemetry tables and channels.
- [`docs/VCR_FORMAT.md`](docs/VCR_FORMAT.md): Reverse-engineered binary replay stream specification (`gMb1.002f`).
- [`docs/VCR_ANALYSIS.md`](docs/VCR_ANALYSIS.md): Empirical telemetry accuracy comparison (VCR vs. DuckDB vs. Shared Memory).
- [`docs/XML_FORMAT.md`](docs/XML_FORMAT.md): LMU Results XML log schema specification and event markers.
- [`docs/TRACK_BOUNDARIES_PIPELINE.md`](docs/TRACK_BOUNDARIES_PIPELINE.md): Track boundary extraction, synthesis, and 1-step Procrustes alignment pipeline.
- [`docs/LMU_REST_API.md`](docs/LMU_REST_API.md): Embedded LMU REST API (`:6397`) and Swagger integration reference.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0 or newer)
- [Le Mans Ultimate](https://lemansultimate.com/) installed on your PC
- *(Optional)* Google Gemini API key for AI Race Engineer post-stint debriefs

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/hockeylagu/LMULapTime.git
   cd LMULapTime
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment (Optional)**:
   Create a `.env` file in the project root if you want to enable Gemini AI coaching debriefs:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Launch the application**:
   ```bash
   npm run dev
   ```
   *Windows users can also simply double-click `launch.bat`.*

5. **Open your browser**:
   - Frontend UI: [http://localhost:5173](http://localhost:5173)
   - Backend API: [http://localhost:3001](http://localhost:3001)

---

## ⚙️ Configuration & Directory Settings

By default, the application automatically detects standard Steam installation paths:
- **Session Results XML**: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\LOG\Results`
- **Replays Directory**: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Replays`
- **Telemetry DuckDB Directory**: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry`

To adjust your paths or driver profile:
1. Click **Settings** in the top navigation bar.
2. Enter your custom results, replays, or telemetry directories (live status badges verify that each directory exists).
3. Set your **In-Game Driver Profile Name** to automatically prioritize your laps.
4. Click **Rescan & Load Telemetry**.

---

## 🧪 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts frontend (Vite) and backend (Express) concurrently with hot-reload. |
| `npm run dev:server` | Starts the backend server using `tsx watch`. |
| `npm run dev:client` | Starts the Vite development server. |
| `npm run build` | Validates TypeScript types and compiles the production client bundle. |
| `npm test` | Runs the automated Vitest test suite (**1,060+ tests across 128 test files**). |
| `npm run test:watch` | Runs Vitest in interactive watch mode. |
| `npm run test:coverage` | Runs the test suite and generates V8 code coverage reports. |
| `npm run telemetry:probe` | Probes live memory-mapped telemetry structures via .NET 8 tool. |
| `npm run telemetry:record`| Records live session telemetry to disk via .NET 8 tool. |
| `npm run vcr:correlate` | Runs offline correlation between XML results and binary replay streams. |

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite 8](https://vitejs.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Recharts](https://recharts.org/), [Lucide React](https://lucide.dev/)
- **Backend**: [Node.js](https://nodejs.org/), [Express 5](https://expressjs.com/), [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) (WAL Mode), [DuckDB](https://duckdb.org/), [Fast-XML-Parser](https://github.com/NaturalIntelligence/fast-xml-parser), [@google/genai](https://github.com/googleapis/genai-js)
- **Diagnostics & Tooling**: C# .NET 8 Telemetry Recorder, TSX Geometry & Boundary Pipeline
- **Test Suite**: [Vitest](https://vitest.dev/), Testing Library, JSDOM

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more details.

---

## 🤝 Contributing

Contributions, feedback, and feature suggestions are welcome! Feel free to open an issue or submit a pull request.
