# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: the author**, a Le Mans Ultimate sim racer who reviews their own sessions. The tool is built around their use first.
- **Secondary: other LMU drivers on PC.** The project is open source (MIT) so any LMU driver can run it locally. Design must not rely on the author's personal habits or data.
- The job: after driving, find out where time was lost, against whom, and what to change next. This means reading laps, corners and stints, and comparing against real drivers from the same layout and class.

## Product Purpose

A local telemetry analytics, lap comparison and race intelligence hub for Le Mans Ultimate. It reads LMU's own files (results XML, 100 Hz DuckDB telemetry, binary `.Vcr` replays) and turns them into clean laps, true pace, corner-by-corner analysis, comparisons, a leaderboard and a rival to chase.

Success means the driver leaves a session review knowing a few specific, correct things to work on, backed by numbers they can trust.

## Positioning

- **Everyone's telemetry, not just yours.** It decodes LMU's reverse-engineered replay format, so it has the trajectory and telemetry of every car in the session. You compare against the real drivers you raced, on the same layout and in the same class.
- **A plain-language debrief first.** A session opens on a clear, deterministic debrief (key takeaways, one tip per corner, habits versus one-off mistakes) instead of raw traces. The telemetry stays one step away for verification.
- **Local, zero setup.** It runs on the driver's PC and finds the LMU install, results, replays and telemetry by itself. There is no account, no upload and no subscription.
- **A rival to chase.** Each layout and class has a rival about 0.3 s ahead (or a ghost time) until you beat them, with exactly where the time is against them, corner by corner.

## Operating Context

- Desktop browser, opened after a session: the driver finishes driving, then runs the app to review. It is not a live second-monitor companion while driving. Mobile is not a target.
- A Node/Express server on port 3001 plus the Vite client; started with `npm run dev` / `launch.bat`.
- Sources: `UserData/LOG/Results/*.xml`, `UserData/Telemetry/*.duckdb`, `UserData/Replays/*.Vcr`, and optionally LMU's embedded REST API. Replays can be several hundred MB to 1 GB and are decoded in workers and cached. The cache is the source of truth once replays are deleted.
- Main areas: dashboard, sessions and session detail (debrief), tracks and track detail, leaderboard and rivals, telemetry/replay studio (`#/telemetry`), settings.

## Capabilities and Constraints

- The capability list is in `README.md` and `AGENTS.md`; the code map is in `docs/CODE_MAP.md`.
- **Layouts never mix.** Benchmarks, records, comparisons and geometry are strictly per layout (32 layouts), and comparisons stay within one car class.
- **Lap classification is fixed.** True pace and consistency use clean flying laps only. Start, out, in, partial and wet laps are judged apart.
- **Numbers must be exact.** Lap times, deltas and units are shown precisely. Nothing is rounded or estimated silently, and unknown or inferred values are labeled as such.
- **Advice must be right or absent.** No advice is better than bad advice, and any coaching shown to the driver needs very high confidence. Metrics and lap detection are deterministic. AI (Google Gemini, optional) may interpret information that is too hard to read directly, when that helps, but it is held to the same confidence bar. The app must work fully without it.
- Damage/repair state is not available in VCR or XML. Pit repairs are only a guess and must be presented as such.

## Brand Commitments

- Name: **LMU Lap Time Analyzer** (Le Mans Ultimate Lap Time Analyzer).
- **Dark UI only.** It is used in dim sim-rig settings, and no light theme is planned.
- Voice: plain, direct and specific, and reads like a race engineer, not marketing. Short sentences, concrete numbers.

## Evidence on Hand

- Real session, telemetry and replay data from the author's local LMU install (not committed). Test fixtures are in `test/fixtures/`.
- Community benchmark targets are synced from a public Google Sheet.
- There are no testimonials, user counts, press or published accuracy claims. Do not fabricate any.

## Product Principles

1. **Trust over coverage.** Show fewer insights rather than a doubtful one; every number and tip must hold up.
2. **Real opponents, same conditions.** Compare against drivers actually met, on the same layout, class and conditions.
3. **Answer first, detail on demand.** Lead with what cost time and what to do next; raw traces stay one step away for anyone who wants to verify.
4. **It just finds your data.** No setup, accounts or uploads between the driver and their review.
