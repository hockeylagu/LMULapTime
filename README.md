# 🏎️ Le Mans Ultimate Lap Time Analyzer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57.svg)](https://sqlite.org/)
[![DuckDB](https://img.shields.io/badge/DuckDB-100Hz%20Telemetry-FFF000.svg)](https://duckdb.org/)
[![Tests](https://img.shields.io/badge/Tests-1380%2B%20Passing-brightgreen.svg)](https://vitest.dev/)

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
- **Pinpoint Lap Alignment**: Telemetry traces and racing lines are automatically synchronized to the exact same track position for fair, accurate comparisons.
- **Synchronized Playback Scrubber**: Scrub through any lap with full playback controls, corner apex markers, and a live telemetry HUD.
- **Mini-Corner Focus**: Dedicated zoomed minimaps that isolate individual turns during deep analysis.

---

### 🎯 3. Turn-by-Turn Corner Analysis & Driving Technique
- **Corner Speed Breakdown**: Compare apex minimums, braking initiation points, and exit speeds against any reference lap.
- **Three-Phase Corner Deconstruction**: Analyzes entry trail braking, mid-corner rotation, and exit throttle pick-up for every turn.
- **Corner Consistency Scoring**: Highlights erratic braking zones and inconsistent racing lines across your stint.

---

### 📈 4. High-Precision Multi-Channel Telemetry Studio
Synchronized telemetry traces across distance or elapsed lap time:

| Telemetry Channel | What It Shows |
| :--- | :--- |
| **Speed & Lap Delta** | Speed trace overlaid with live +/- time divergence. |
| **Pedal Inputs** | Throttle and brake pedal positions with active **ABS** and **TC** indicators. |
| **Steering & Balance** | Steering angle trace with real-time **Understeer / Oversteer** detection. |
| **G-Forces (Accel)** | Longitudinal acceleration, Lateral G cornering loads, and Total G vector. |
| **Dynamics & Slip** | Yaw rate, body slip angle, and individual 4-wheel slip velocity. |
| **Suspension Travel** | 4-corner damper deflection (FL, FR, RL, RR) in millimeters. |
| **Tires & Thermals** | Dynamic tire pressures, carcass temperatures, and stint wear degradation. |
| **Brake Rotor Temps** | 4-corner brake disc temperatures to monitor thermal fade. |
| **Hypercar Hybrid** | Virtual Energy stint tank, high-voltage State of Charge (SoC), and MGU-K regen. |

- **Customizable Presets**: Switch instantly between layout presets (*Inputs*, *Dynamics*, *Tires*, *Brakes*, *Hybrid*, or *All Channels*).
- **Smooth 60 FPS Charts**: High-density downsampling balances fine detail with fluid responsiveness.

---

### ⚔️ 5. Head-to-Head Lap Comparison Studio
- **Lap-to-Lap Battles**: Compare any two laps side-by-side—your personal best, session best, community benchmark, or a teammate's lap.
- **Comparison Accuracy Indicators**: Real-time confidence indicators showing alignment precision and data quality between compared laps.
- **Micro-Sector Delta Splits**: Color-coded sector-by-sector time differentials ($\pm$s) and speed deltas ($\pm$ km/h).
- **Interactive Delta Curve**: Pinpoints the exact meter on circuit where time was gained or lost.
- **Theoretical Optimal Lap**: Synthesizes your best individual sectors ($S1 + S2 + S3$) into an ultimate benchmark target.

---

### 🤖 6. AI Race Engineer & Automated Driver Coaching
- **Objective Deficit Ranking**: Automatically spots and ranks your biggest driving deficits by potential time loss and repeatability.
- **1-Click Corner Drilldown**: Click any coaching finding to immediately zoom into that turn on the track map and overlay telemetry traces.
- **Natural Language Debriefs (Google Gemini)**: Explains *why* time was lost and suggests concrete garage setup tweaks to improve car balance.
- **Historical Coaching Archive**: Saves coaching debriefs so you can track your skill progression over time.

---

### 📋 7. Session Intelligence & Race Stewards Ledger
- **Multiclass Classifications**: Complete finishing standings, class positions, gap intervals, and position changes.
- **Clean Flying Lap Filtering**: Automatically isolates clean flying laps from pit out/in-laps and incidents.
- **Stewards Incident Log**: Full timeline of penalties, track limit cuts, collisions, and damage.
- **Server Rules & Setup Badges**: Inspects server settings (damage multipliers, tire warmers, fixed setups, fuel usage) directly from session logs.

---

### 🌐 8. Live Community Alien Benchmarks
- **Live Google Sheets Sync**: Fetches community alien reference times with 1 click.
- **Benchmark Update Changelog**: Automatically detects and highlights new benchmarks, updated targets with patch tags, and retired times.

---

### 🔌 9. Seamless Plug & Play Integration
- **Zero Configuration**: Automatically detects your Steam installation, session logs, 100 Hz telemetry, and replays.
- **Endurance & Multi-Stint Ready**: Seamlessly handles long race sessions, driver stints, and multi-file recordings without missing data.
- **Replay & Cache Manager**: In-app management view to inspect cached replays, track background updates, and trigger 1-click rescans.
- **Blazing-Fast Local Performance**: High-speed local caching ensures instant page loads and zero lag when scrubbing through telemetry traces.
- **Polished Cockpit Experience**: Smooth loading screens with motorsport quotes and instant navigation directly to your fastest lap.

---

## 🛠️ Architecture & Deep-Dive Documentation

For engineers, modders, and telemetry enthusiasts interested in the underlying reverse-engineered data structures and pipelines:

- [`docs/LMU_SETUP_AND_TELEMETRY_GUIDE.md`](docs/LMU_SETUP_AND_TELEMETRY_GUIDE.md): Methodical guide to developing LMU car setups using telemetry and coaching evidence.
- [`docs/TELEMETRY_FORMAT.md`](docs/TELEMETRY_FORMAT.md): Detailed schema of native LMU 100 Hz DuckDB telemetry tables and channels.
- [`docs/VCR_FORMAT.md`](docs/VCR_FORMAT.md): Reverse-engineered binary replay stream specification (`gMb1.002f`).
- [`docs/VCR_ANALYSIS.md`](docs/VCR_ANALYSIS.md): Empirical telemetry accuracy comparison (VCR vs. DuckDB vs. Shared Memory).
- [`docs/XML_FORMAT.md`](docs/XML_FORMAT.md): LMU Results XML log schema specification and event markers.
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
| `npm test` | Runs the automated Vitest test suite (**1,380+ tests across 159 test files**). |
| `npm run test:watch` | Runs Vitest in interactive watch mode. |
| `npm run test:coverage` | Runs the test suite and generates V8 code coverage reports. |
| `npm run telemetry:probe` | Probes live memory-mapped telemetry structures via .NET 8 tool. |
| `npm run telemetry:record`| Records live session telemetry to disk via .NET 8 tool. |
| `npm run vcr:correlate` | Runs offline correlation between XML results and binary replay streams. |

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite 8](https://vitejs.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Recharts](https://recharts.org/), [Lucide React](https://lucide.dev/)
- **Backend**: [Node.js](https://nodejs.org/), [Express 5](https://expressjs.com/), [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) (WAL Mode), [DuckDB](https://duckdb.org/), [Fast-XML-Parser](https://github.com/NaturalIntelligence/fast-xml-parser), [@google/genai](https://github.com/googleapis/genai-js)
- **Diagnostics & Tooling**: C# .NET 8 Telemetry Recorder, TSX analysis scripts
- **Test Suite**: [Vitest](https://vitest.dev/), Testing Library, JSDOM

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more details.

---

## 🤝 Contributing

Contributions, feedback, and feature suggestions are welcome! Feel free to open an issue or submit a pull request.
