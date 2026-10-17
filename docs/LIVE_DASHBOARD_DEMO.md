# Offline live dashboard validation

In the app, go to **Settings → Live Dashboard → Open demo**. Search settings for “demo” or “offline” to find it.

Open `http://localhost:5173/#/live?demo=1` (or your production app URL with `#/live?demo=1`).
The query belongs **after the hash**, because the app uses HashRouter. This is shipped in production;
it works with just the frontend served, without LMU, the API server, telemetry files or saved sessions.

The dashboard renders the same production components as the real stream. All demo values are illustrative.
The persistent **DEMO · SAMPLE DATA** label distinguishes them from game data. Sample data is never saved or sent to
the backend. The demo reads `/api/live/settings` for your saved reserve and pedal trace duration, with defaults
when the server is unavailable. This validates presentation and display decisions; it does not validate game ingestion or
prove the sample strategy is achievable in a race.

Qualifying examples use 10-minute sessions, sprint examples use 20 minutes, and practice uses 60 minutes.
Out-lap presets show lap 1 with no completed history or session best. Garage estimates use the same domain
planning functions as the live dashboard. The longer race examples remain 60 minutes to exercise pit strategy.

Use the grouped **Scenario** selector to inspect all 55 presets. **Previous** and **Next** wrap through the
catalogue in weekend order: connect/load → practice → qualifying/results → warmup → race preparation/start →
stint → pit stop → finish/results. Alternative conditions, incidents, missing data and tentative previews follow.
**Tour all** starts from the beginning and advances every five seconds until stopped. **Animate pedals** runs a repeatable
pedal trace on track; turn it off for static inspection. **Hide controls** collapses the toolbar without
resizing the dashboard's 2560 × 1440 stage. The sample-data label stays visible. **Exit demo** returns to the
real dashboard and its game stream.

Direct links are shareable and survive reloads:

| View | Hash route |
| --- | --- |
| Mid-stint VE | `#/live?demo=1&scenario=race` |
| Fuel class | `#/live?demo=1&scenario=race&carClass=LMP2` |
| Finish reachable | `#/live?demo=1&scenario=sprint` |
| Saving to skip a stop | `#/live?demo=1&scenario=saving` |
| Pit this lap | `#/live?demo=1&scenario=pit-this-lap` |
| Stop and go | `#/live?demo=1&scenario=penalty` |
| Flat tyre | `#/live?demo=1&scenario=damage-flat` |
| Race preparation | `#/live?demo=1&scenario=garage-race` |
| 20-minute sprint preparation | `#/live?demo=1&scenario=garage-sprint` |
| Qualifying | `#/live?demo=1&scenario=qualifying` |
| Qualifying out lap | `#/live?demo=1&scenario=qualifying-out-lap` |
| Practice out lap | `#/live?demo=1&scenario=practice-out-lap` |
| Wet track | `#/live?demo=1&scenario=wet` |
| Final qualifying result | `#/live?demo=1&scenario=result-qualifying-settled` |
| Stream loss | `#/live?demo=1&scenario=disconnected` |
| Tentative corner speed | `#/live?demo=1&scenario=corners` |

Add `&controls=hidden` to start with collapsed controls. An unknown scenario falls back to mid-stint with
an explanatory message. `demo=false` and `demo=0` use the real game stream.

Use **Car class** to configure any scenario, including garage, driving, results and the tentative corner preview.
For example: `#/live?demo=1&scenario=garage-qualifying&carClass=LMP3` or
`#/live?demo=1&scenario=garage-sprint&carClass=GT3`. Class selection remains in the URL while changing scenarios
or touring. Supported canonical values are `Hyper`, `GT3`, `LMP2`, `LMP2_ELMS`, `LMP3` and `GTE`.
GT3 is the default when `carClass` is absent; selecting GT3 removes the override. An invalid class uses GT3 with an explanatory message.
Class variants use illustrative cars and lap times; Hypercar/GT3 use VE and fuel ratio, other classes use litres
and omit fuel ratio. Garage plans are recalculated for the class pace and resource type.

Set **Settings → Live Dashboard → Pedal trace history** to choose 5–120 seconds (30 by default).
The saved duration applies to both live data and demo traces, including the corner preview. Saved VE/fuel reserve
also applies to demo preparation and sprint plans. Reopening the page or focusing its window reloads settings.

The catalogue covers all seven race action modes (calculating, pit now, in pit, pit countdown, stint, sprint,
saving), VE/fuel, pit states, MFD missing/short, penalties, wheel/body damage, tyre coverage, fuel ratio,
rain/wet/drying, practice/qualifying/warmup/unknown, invalid laps, positive/negative deltas, paused/FCY,
garage preparation, grid/formation/countdown, offline/menu/loading/finished, missing references and data,
race/DNF/disqualified/provisional/settled qualifying results, connecting and disconnected.

To add a display case, add an isolated preset in `src/components/live/demo/demoScenarios.ts` using the
canonical snapshot types. The regression test renders every preset, asserts isolation from network requests,
and checks coverage of all race action modes. Keep simulated values out of server ingestion and storage.
