# 🏎️ Le Mans Ultimate Lap Time Analyzer

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57.svg)](https://sqlite.org/)
[![DuckDB](https://img.shields.io/badge/DuckDB-100Hz%20Telemetry-FFF000.svg)](https://duckdb.org/)
[![Tests](https://img.shields.io/badge/Tests-3000%2B%20Passing-brightgreen.svg)](https://vitest.dev/)

Telemetry analytics and lap comparison for **Le Mans Ultimate (LMU)**. It decodes LMU's own replays to get the telemetry of every car on track, not just yours, and puts your laps next to theirs.

![LMU Telemetry Studio Preview](assets/telemetry_studio.png)

---

## ✨ Highlights

### 🗺️ Replay & Telemetry Studio
- **100 Hz columnar DuckDB telemetry**: Ingests native telemetry at microsecond precision, smoothly interpolated across the start/finish timing loop.
- **2D track map**: Recorded trajectories with color-coded speed, pedal zones and a live telemetry cursor. Bundled SVGs cover 32 layouts; calibrated road boundaries and physical profiles require an optional local data package.
- **Fullscreen GPS map**: Follow-car camera with minimap HUD overlay, dynamic friction circle, sector lines, brake distance boards, and a docked live telemetry playback strip.
- **Synchronized multi-channel traces**: Speed, lap delta, throttle & brake (with ABS/TC events), stepped gear changes, steering angle with real-time understeer/oversteer/scrub balance indicators, G-forces, dampers, tire temperatures & pressures, and Hypercar hybrid energy (SoC, Virtual Energy, Regen).
- **Three-phase corner breakdown**: Micro-splits deconstructing every turn into Entry (braking point, trail brake decay), Rotation (apex minimum speed, yaw rate), and Exit (throttle pick-up timing, traction).

![Fullscreen GPS Map - Follow-Car & Minimap HUD](assets/fullscreen_gps_map.png)

![Fullscreen GPS Map - Portimão Circuit Layout, Pit Lane & Runoff](assets/fullscreen_gps_map_portimao.png)

### 🎬 Every Driver's Telemetry, from the Replays
- **Reverse-engineered replay format**: LMU's binary `.Vcr` replays (`gMb1.002f`) are decoded to extract the trajectory and telemetry of every car in the session: position, speed, throttle and brake (with ABS/TC), steering, gear and brake temperatures.
- **Your own laps at 100 Hz**: LMU's native DuckDB telemetry is read and fused with the replay trajectory, cut cleanly at the timing line.
- **Compare against anyone**: any of your laps against any other driver's lap from the same layout, aligned on track position: speed and delta traces, pedals, racing lines on the map, sector and corner gaps.
- **Built for big files**: replays of several hundred MB are decoded in worker threads and cached, so the next look is instant.

### 🏆 Leaderboard & Rivals
![Leaderboard & Rivals](assets/leaderboard_rivals.png)
- **Leaderboard per layout and class**: Ranks the real drivers you met online on each layout on their representative dry laps, compared against official alien targets.
- **A dynamic rival to chase**: Automatically picks a competitive rival about 0.3 s ahead (or a ghost target) until you beat them, showing exactly where the time is won or lost corner by corner.
- **Community benchmark integration**: Synchronizes target lap times directly from community reference sheets with automated diff and patch-level tracking.

### 🏎️ Dashboard & Sessions
![Session Detail & Stint Analysis](assets/session_detail.png)
- **True Pace & Consistency**: Calculates true pace (top 3 clean laps average), theoretical best, and lap consistency score exclusively from clean flying laps (out, in, and start laps filtered out).
- **Multiclass race analysis**: Full classification standings, position deltas, sector splits vs best same car, tire wear degradation profiles, and stewards penalty logs.
- **Multi-session progression**: Interactive pace trajectory tracking performance evolution across stints, cars, and layouts.

![Dashboard Overview](assets/dashboard.png)

### Live capture and learning evidence

The backend records supplemental player data while LMU runs, independent of the dashboard. Each
session recording uses its own DuckDB file, linked strictly to XML identity and lap clocks. Verified
ISO 8855 dynamics augment yaw/body-slip charts; disposable response/error diagnostics support race
debugging. Strategy audit checkpoints share the session DuckDB for direct inspection. Frozen fuel/VE forecasts and measured outcomes feed an offline baseline and bounded correction candidate evaluator.
Settings → Learning includes a manual learning-evidence check with separate fuel/VE counts,
exclusion reasons, offline readiness and automatic correction status. Corrections require fresh-session
validation and an exact live identity/patch match; `LMU_LIVE_LEARNING=0` disables them. Real-game
overhead validation is pending.
See [live capture storage and channels](docs/LIVE_CAPTURE_FORMAT.md).

### 🎯 Coaching
- **Corner analysis**: entry (braking, trail brake), rotation (apex speed) and exit (throttle pick-up) for every turn, with consistency scoring.
- **Deterministic coaching**: driving deficits ranked by time lost, repeatability and confidence (`priority = timeLoss * repeatability * confidence`).
- **AI Race Engineer** (optional, Google Gemini): explains the findings and suggests setup changes.

### 🔌 Plug & Play
- Finds the LMU Steam install, results, replays and telemetry on its own; handles long multi-stint sessions and multi-file telemetry.

---

## 🛠️ Documentation

- [`docs/README.md`](docs/README.md): documentation guide.
- [`docs/plans/README.md`](docs/plans/README.md): completed work, active branch work and remaining priorities.
- [`docs/CODE_MAP.md`](docs/CODE_MAP.md): implementation, routes, storage and cache versions.
- [`docs/PLUGINS.md`](docs/PLUGINS.md): optional local data packages, setup and fallback.
- [`docs/LIVE_CAPTURE_FORMAT.md`](docs/LIVE_CAPTURE_FORMAT.md): app-owned live recordings, diagnostics and learning evidence.
- [`docs/TELEMETRY_FORMAT.md`](docs/TELEMETRY_FORMAT.md): LMU 100 Hz DuckDB telemetry tables and channels.
- [`docs/VCR_FORMAT.md`](docs/VCR_FORMAT.md) / [`docs/VCR_ANALYSIS.md`](docs/VCR_ANALYSIS.md): the reverse-engineered binary replay format (`gMb1.002f`) and its accuracy.
- [`docs/XML_FORMAT.md`](docs/XML_FORMAT.md): LMU results XML schema.
- [`docs/LMU_REST_API.md`](docs/LMU_REST_API.md): LMU's embedded REST API (`:6397`).

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 24.15+ on the 24.x line (also supported by the installed stack: 22.22.2+ on 22.x, or 26+)
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
   Create an ignored `.env.local` file in the project root if you want to enable Gemini AI coaching debriefs; `dev:server` loads this file:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   Optional detailed track/vehicle data uses `LMU_PLUGIN_ROOT` in the same file; see [local package setup](docs/PLUGINS.md).

4. **Launch the application**:
   ```bash
   npm run dev
   ```
   *Windows users can also simply double-click `launch.bat`.*

   On Windows, a system tray gauge icon appears while the backend is running. Double-click it,
   or right-click and choose **Open LMU Lap Time Analyzer**, to open the website. The icon closes
   automatically when the backend stops or restarts. Set `LMU_TRAY=0` in `.env.local` to disable it.
   It opens `LMU_UI_ORIGIN` when configured, otherwise `http://localhost:5173` (or `LMU_UI_PORT`).

5. **Open your browser**:
   - Frontend UI: [http://localhost:5173](http://localhost:5173)
   - Backend API: [http://localhost:3001](http://localhost:3001)

---

## ⚙️ Configuration & Directory Settings

By default, the application automatically detects standard Steam installation paths:
- **Session Results XML**: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\LOG\Results`
- **Replays Directory**: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Replays`
- **Native telemetry directory**: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry`

App recordings default to `server/live-captures/` (`LMU_LIVE_CAPTURE_DIR` override). There is no
automatic disk quota; manually remove closed recordings or disposable diagnostic sidecars when needed.
Diagnostic sidecars are off unless turned on in Settings → Live dashboard. These settings are backend environment variables.

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
| `npm test` | Runs the complete Vitest suite; latest verification is recorded in [CODE_MAP](docs/CODE_MAP.md). |
| `npm run test:watch` | Runs Vitest in interactive watch mode. |
| `npm run test:coverage` | Runs the test suite and generates V8 code coverage reports. |
| `npm run learning:evaluate` | Read-only chronological fuel/VE baseline and bounded correction candidate report; does not activate corrections. |
| `npm run telemetry:probe` | Probes live memory-mapped telemetry structures via TypeScript diagnostic tool. |
| `npm run telemetry:record`| Records live session telemetry to disk via TypeScript diagnostic tool. |
| `npm run telemetry:dump` | One-shot diagnostic dump of shared memory buffers via TypeScript diagnostic tool. |
| `npm run vcr:correlate` | Runs offline correlation between XML results and binary replay streams. |
| `npm run check:local-data` | Checks release inputs for forbidden detailed local data. |
| `npm run screenshots` | Captures application screenshots with the configured tooling. |

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite 8](https://vitejs.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Recharts](https://recharts.org/), [Lucide React](https://lucide.dev/)
- **Backend**: [Node.js](https://nodejs.org/), [Express 5](https://expressjs.com/), [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) (WAL Mode), [DuckDB](https://duckdb.org/), [Fast-XML-Parser](https://github.com/NaturalIntelligence/fast-xml-parser), [@google/genai](https://github.com/googleapis/genai-js)
- **Diagnostics & Tooling**: TypeScript Telemetry Recorder (`tools/telemetryRecorder.ts`), TSX analysis scripts
- **Test Suite**: [Vitest](https://vitest.dev/), Testing Library, happy-dom

---

## 📄 License

Distributed under the **Mozilla Public License 2.0** (`MPL-2.0`). See [`LICENSE`](LICENSE) for the full license text and third-party software usage and trademark notices.

---

## 🤝 Contributing

Contributions, feedback, and feature suggestions are welcome! Feel free to open an issue or submit a pull request.
