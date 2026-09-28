# 🏎️ Le Mans Ultimate Lap Time Analyzer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57.svg)](https://sqlite.org/)
[![DuckDB](https://img.shields.io/badge/DuckDB-100Hz%20Telemetry-FFF000.svg)](https://duckdb.org/)
[![Tests](https://img.shields.io/badge/Tests-1700%2B%20Passing-brightgreen.svg)](https://vitest.dev/)

Telemetry analytics and lap comparison for **Le Mans Ultimate (LMU)**. It decodes LMU's own replays to get the telemetry of every car on track, not just yours, and puts your laps next to theirs.

---

## ✨ Highlights

### 🎬 Every Driver's Telemetry, from the Replays
- **Reverse-engineered replay format**: LMU's binary `.Vcr` replays (`gMb1.002f`) are decoded to extract the trajectory and telemetry of every car in the session: position, speed, throttle and brake (with ABS/TC), steering, gear and brake temperatures.
- **Your own laps at 100 Hz**: LMU's native DuckDB telemetry is read and fused with the replay trajectory, cut cleanly at the timing line.
- **Compare against anyone**: any of your laps against any other driver's lap from the same layout, aligned on track position: speed and delta traces, pedals, racing lines on the map, sector and corner gaps.
- **Built for big files**: replays of several hundred MB are decoded in worker threads and cached, so the next look is instant.

### 🗺️ Replay & Telemetry Studio
- **2D track map** with 1:1 track limits for all 32 layouts: racing lines colored by speed, pedals or lateral G, friction circle and playback scrubber.
- **Synchronized telemetry**: speed and delta, pedals with ABS/TC, steering with understeer/oversteer, G-forces, yaw and slip, dampers, tire pressures/temps/wear, brake temps and Hypercar hybrid energy.

### 🎯 Coaching
- **Corner analysis**: entry (braking, trail brake), rotation (apex speed) and exit (throttle pick-up) for every turn, with consistency scoring.
- **Deterministic coaching**: driving deficits ranked by time lost, repeatability and confidence.
- **AI Race Engineer** (optional, Google Gemini): explains the findings and suggests setup changes.

### 🏆 Leaderboard & Rivals
- **Leaderboard per layout and class**: ranks the real drivers you met on each layout on their dry representative laps.
- **A rival to chase**: a driver about 0.3 s ahead (or a ghost time) until you beat them, with where the time is against them, corner by corner.

### 🏎️ Dashboard & Sessions
- **True Pace** (top 3 clean laps), consistency rating and theoretical best, from clean flying laps only (out, in, start and wet laps judged apart).
- **Session detail**: multiclass standings, position deltas, sectors against the fastest same car, tire and fuel curves, stewards log (penalties, track limits, contacts), rules and conditions.
- **Community benchmarks**: alien reference times synced from Google Sheets.

### 🔌 Plug & Play
- Finds the LMU Steam install, results, replays and telemetry on its own; handles long multi-stint sessions and multi-file telemetry.

---

## 🛠️ Documentation

- [`docs/TELEMETRY_FORMAT.md`](docs/TELEMETRY_FORMAT.md): LMU 100 Hz DuckDB telemetry tables and channels.
- [`docs/VCR_FORMAT.md`](docs/VCR_FORMAT.md) / [`docs/VCR_ANALYSIS.md`](docs/VCR_ANALYSIS.md): the reverse-engineered binary replay format (`gMb1.002f`) and its accuracy.
- [`docs/XML_FORMAT.md`](docs/XML_FORMAT.md): LMU results XML schema.
- [`docs/TRACK_BOUNDARIES_PIPELINE.md`](docs/TRACK_BOUNDARIES_PIPELINE.md): how track boundaries are built and aligned.
- [`docs/LMU_REST_API.md`](docs/LMU_REST_API.md): LMU's embedded REST API (`:6397`).

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
| `npm test` | Runs the Vitest suite (1,700+ tests across 200+ files). |
| `npm run test:watch` | Runs Vitest in interactive watch mode. |
| `npm run test:coverage` | Runs the test suite and generates V8 code coverage reports. |
| `npm run telemetry:probe` | Probes live memory-mapped telemetry structures via .NET 8 tool. |
| `npm run telemetry:record`| Records live session telemetry to disk via .NET 8 tool. |
| `npm run vcr:correlate` | Runs offline correlation between XML results and binary replay streams. |
| `npm run vehicles:catalog` | Rebuilds the vehicle catalog. |

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
