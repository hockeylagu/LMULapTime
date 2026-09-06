# 🏎️ Le Mans Ultimate Lap Time Analyzer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57.svg)](https://sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-414%20Passing-brightgreen.svg)](https://vitest.dev/)

A modern, high-performance telemetry analyzer and race intelligence hub for **Le Mans Ultimate** (LMU). Automatically scans and parses your session XML logs and native binary VCR replay recordings, correlates multi-stint telemetry data, evaluates lap-by-lap pace against community "Alien" benchmarks, visualizes full 2D trajectory racing lines with synchronized telemetry, and provides deep head-to-head lap comparisons.

---

## ✨ Features

### 🛰️ VCR Replay & Trajectory Telemetry Studio
- **Native Binary VCR Decoder (`gMb1.002f`)**: Directly extracts high-frequency time-slice positions, multi-driver telemetry, and official Class 6 Type 6 timing loops without relying on third-party companion tools.
- **Interactive 2D Trajectory Map**:
  - Renders the complete circuit layout with customizable colored racing lines (**Speed gradient**, **Throttle/Brake application**, and **Lateral Yaw**).
  - Synchronized interactive playback scrubber with live apex position tracking, corner metrics, and start/finish loops.
- **Synchronized Telemetry Traces**:
  - Real-time waveforms for **Speed** (km/h), **Throttle** (0–100%), **Brake** (0–100%), **Steering Yaw Angle**, **Gear**, and **Engine RPM**.
- **Live 4-Wheel Corner Telemetry**:
  - Class 0 Type 15 packet decoding delivering independent 4-corner telemetry for **Tire Temperatures** (Carcass & Inner layers in °C), **Dynamic Tire Wear degradation**, and **Brake Disc Rotor Temperatures**.
- **Pit Stop & Garage Lifecycle Intelligence**:
  - Event-driven tracking of pit lane entrance, pit box stop durations, refueling/tire servicing intervals, pit lane exit, and garage motion states (`inPit`, `inGarage`).
- **Head-to-Head Replay Lap Comparison**:
  - Overlay any two laps sharing the same track layout and vehicle class.
  - Synchronized distance/time scrubbing showing side-by-side position, time delta ($\pm$ seconds), and driving input divergence at every corner.
- **Layout-Aware Session & Replay Matching**:
  - Automatically correlates XML results with `.Vcr` recordings across complex track layout variations:
    - **Monza**: Grand Prix vs. Curva Grande
    - **Bahrain**: Grand Prix (WEC) vs. Outer Circuit vs. Paddock Circuit
    - **Paul Ricard**: 1A-V2 (Full) vs. 1A-V2-Short
    - **Sebring**: International Raceway vs. School Circuit
    - **Fuji**: Grand Prix vs. Classic
    - **Silverstone**: Grand Prix vs. National vs. International
    - **Lusail**: Grand Prix vs. Short Circuit
    - **Daytona**: Road Course
  - Strictly prevents cross-layout leakage between parent GP facilities and shorter variants.
- **Format Specification**: Comprehensive reverse-engineered binary specification documented in [`docs/VCR_FORMAT.md`](docs/VCR_FORMAT.md).

### 📊 Comprehensive Session Telemetry
- **Multi-Metric Telemetry Charts**: Switch between **Lap Pace**, **Sector Times (S1 / S2 / S3)**, **Top Speed**, **Tire Wear degradation** (FL, FR, RL, RR, Avg), and **Fuel & Virtual Energy** stint consumption.
- **Flying Lap & Out-Lap Intelligence**:
  - Automatically identifies **Start Laps** (standing/rolling starts or garage exits).
  - Flags **Pit Stop in-laps** and **Out-laps** (pit exit laps), excluding them from flying average pace and pace consistency ratings.
  - Plots estimated/inferred lap times for incomplete laps so no telemetry data is lost.
- **Multiclass Race Classification**: Tracks both **Class Position** (Hypercar, LMP2, LMGT3, GTE) and **Overall Position**, with position deltas ($\Delta$), gaps to class leader, and finish statuses (Finished, DNF, DNS, DQ).
- **Session Rules & Server Badges**: Visualizes server configuration (Damage, Tire Warmers, Fixed Setups, ParcFermé, Multipliers) directly from session logs.
- **Results XML Specification**: Comprehensive technical specification of the simulation results log format and available data structures documented in [`docs/XML_FORMAT.md`](docs/XML_FORMAT.md).

### 🔬 Deep Lap Comparison Studio
- **Head-to-Head Delta Analysis**: Compare any lap against your **Personal Best**, **Session Best**, **Theoretical Optimal Sectors**, **All-Time Track Record**, or **Community Benchmark Targets**.
- **Micro Delta Breakdowns**: Real-time sector-by-sector delta color-coding (green for time gained, red for time lost) and speed differentials ($\pm$ km/h).
- **Interactive Time Delta Chart**: Visual representation of pace divergence across every sector.

### 📈 Historical Progression & Track Intelligence
- **True Pace Progression**: Tracks clean flying lap trends, 3-session moving averages, and your **Top 3 Clean Lap Average (True Pace)** over time.
- **Pace Consistency Rating (%)**: Evaluates driving consistency based on lap time standard deviation across clean flying laps.
- **Theoretical Execution Gap**: Visualizes the delta between your actual fastest lap and your optimal theoretical sectors ($S1 + S2 + S3$).
- **Multi-Class & Car Model Filters**: Filter analytics across Hypercar (LMH/LMDh), LMP2, LMGT3, and specific vehicle models (e.g. Porsche 911 GT3 R, Ferrari 499P, BMW M4 GT3).

### ⚡ Blazing-Fast SQLite Caching (WAL Mode)
- **Zero-Lag Incremental Sync**: Incremental file modification checking (`mtime` & file size). Only newly created or modified XML files are reparsed.
- **Instantaneous Lookups**: Indexed queries for tracks, timestamps, and driver sessions.

### 🌐 Live Community Benchmark Sync & Update Changelog
- **Google Sheets Benchmark Sync**: Synchronizes the latest community reference lap times directly into SQLite.
- **Benchmark Update Changelog**: Whenever you refresh reference benchmarks, the built-in diff engine automatically highlights:
  - 🟢 **New References**: Newly added track and car class targets.
  - 🟡 **Updated Targets**: Adjusted Alien targets with before/after lap times, delta ($\Delta$), and game patch updates (e.g. `Patch 1.3 → 1.4+`).
  - 🔴 **Removed References**: Deprecated benchmark targets.

---

## 🛠️ Technology Stack

- **Frontend**:
  - [React 19](https://react.dev/) & [TypeScript](https://www.typescriptlang.org/)
  - [Vite 8](https://vitejs.dev/) - Lightning-fast frontend build tool
  - [Tailwind CSS](https://tailwindcss.com/) - Curated dark sim-racing aesthetic
  - [Recharts](https://recharts.org/) - Interactive telemetry and delta charts
  - [Lucide Icons](https://lucide.dev/) - Clean iconography
- **Backend**:
  - [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
  - [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) with Write-Ahead Logging (WAL)
  - [Fast-XML-Parser](https://github.com/NaturalIntelligence/fast-xml-parser) - High-throughput XML parsing
  - Custom Binary `.Vcr` Parser with 4-wheel telemetry & pitstop state machine
- **Testing**:
  - [Vitest](https://vitest.dev/) & [Testing Library](https://testing-library.com/) - 414+ automated unit and integration tests

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18.0 or newer)
- [Le Mans Ultimate](https://lemansultimate.com/) installed on your computer

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

3. **Start the application**:
   ```bash
   npm run dev
   ```
   *Windows users can also simply double-click `launch.bat`.*

4. **Open your browser**:
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
4. Click **Rescan & Load Telemetry**.

---

## 🧪 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts both frontend (Vite) and backend (Express) concurrently with hot-reload. |
| `npm run dev:server` | Runs the backend server using `tsx watch`. |
| `npm run dev:client` | Runs the Vite client development server. |
| `npm run build` | Runs TypeScript typechecks and compiles the production client bundle. |
| `npm test` | Runs all 414+ automated test suites with Vitest. |
| `npm run test:watch` | Runs Vitest in interactive watch mode. |
| `npm run test:coverage` | Generates detailed test coverage reports. |

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/<your-username>/LMULapTime/issues).
