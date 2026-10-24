# Simagic peripheral plugin integration plan

Status: In progress — delivery steps 1–5 done and committed 2026-10-23 (analyzer `fe55db1e`, plugin repository `361f62b`); step 6, the real LMU + SimPro acceptance event, remains. Reviewed: 2026-10-23. Scope since the original design: wheel only, LMU-tagged presets only, and Suggest maps class-only names (LMP2 WEC / LMP2 ELMS) to class defaults. Next step: drive one event with the plugin enabled and automatic switching on, and record the result here. Completion gate: the acceptance criteria below, with the first garage switching once and later sessions of the event doing nothing.

Implementation clarifications: the host consumes the load before running selection but cancels by safe lifecycle **and load generation**, so consuming it does not abort its own request. Settings Apply is the driver's explicit choice: allowed in the garage even after the load was handled, refused on track. Canonical model rows are deduplicated by model/class; profile-only aliases do not alter vehicle resolution. Shared DTOs live in `shared/types/peripherals/peripherals.ts` to keep the parent directory at its 20-file limit. The demo receives no status component and makes no peripheral requests. A restarted backend follows the document's deliberate new-load/readback behavior; persistent load tracking remains out of scope.

Verification 2026-10-23, at the commit: analyzer `npm test` passed 3,565 tests (56 existing skips); `npm run lint` and `npm run build` passed with zero warnings; the plugin repository's tests and typecheck passed. Settings were checked in the browser against the real database and SimPro catalog (Suggest previewed only; no mapping saved by the agent, no hardware writes). One manual preset switch was approved and made during phase 1.

Remaining verification: the real-event acceptance (step 6); reconnect, restart and partial-result cases have fake-plugin tests but no hardware run.

Working rules for the implementer: read [`docs/CODE_MAP.md`](../CODE_MAP.md) and `AGENTS.md` first; keep `npm test`, `npm run lint`, `npm run build` at zero warnings; **do not commit unless the user says so** (then small logical commits, only your own hunks); never send a SimPro write other than `preset_select_dev_config`, and only from the code paths below (tests use a fake server).

## Intended result

Move the behavior of `C:\Documents\SimagicWheelDeamon` into an optional peripheral plugin run by the LMU Lap Time Analyzer backend. Starting the analyzer starts the plugin when it is enabled; stopping the analyzer stops it. No separate Python daemon, tray, startup task or service.

The Simagic Git repository becomes a plugin-only TypeScript package (vendor adapter, fixtures, docs). The analyzer owns the plugin host, the live session-load hook, persistence, the API, matching (Suggest) and all UI. The plugin has no entry point or lifecycle of its own.

When LMU finishes loading a live session, resolve the player's car and, once, in the garage before driving: read each mapped device's active preset and select the mapped one only if it differs. Never switch while on track. Only the wheel preset (LEDs, buttons) is switched. **Decision 2026-10-23: the wheelbase is out of scope** — its profile is the same for every car, so settings, mappings, the runner and the UI handle the wheel only (the plugin's device contract still reports `base` devices as SimPro does; the analyzer ignores them). Sections below that mention base targets describe the original design. SimPro Manager is required and **started by the user**: it runs elevated, so the analyzer cannot launch it (and cannot read its executable path). Historical sessions, replays, comparisons and the dashboard demo never change presets.

## Phase 1 results (done)

Full contract: [`SimagicWheelDeamon/docs/SIMPRO_API_CONTRACT.md`](../../../SimagicWheelDeamon/docs/SIMPRO_API_CONTRACT.md); sanitized fixtures in `SimagicWheelDeamon/fixtures/simpro/`. The points the implementation depends on:

- SimPro **V3.0.0**, `http://127.0.0.1:4010/simpro/api/v3/<method>`, `POST` JSON. **HTTP is always 200**; the body's `status` (200 / 500) and `message` tell success from failure. Connection refused = SimPro not running.
- Identifiers are strings; device list uses 16-digit hex (`"0000000002060000"`), preset methods return decimal (`"33947648"`) and accept both. Preset and device UUIDs exceed 2^53: **never convert to `number`**; canonicalize with `BigInt` to a decimal string.
- GT NEO wheel: `device_uuid === product_uuid` (no serial). Base/pedals: serial-derived `device_uuid`.
- `preset_get_dev_config_list` returns every preset of a device with `presetUUID`, `presetName`, `selected` (exactly one `true`), `isOffical` (sic), `gameName_list` (LMU = `"lmu"`), `factoryReset`. **Use its `selected` entry as the readback** (24 KB, 3 ms); `preset_get_selected_dev_config` returns the same UUID plus the full ~470 KB config and is not needed.
- `preset_select_dev_config` answers in ~30 ms; readback showed the new preset 70 ms later; no device dropped or changed identity. An unknown preset → `status 500 "select failed"`, nothing changes.
- LEDs are part of the wheel preset (`rpm_lights`, `led_buttons`, brightness); there is no LED-only selection. A wheel preset also sets buttons/encoders/paddles; a base preset sets FFB.
- The user's LMU presets are tagged `lmu` and named class-first on purpose, so they group by class in SimPro's list (`GT3 296`, `HYP Peugeot`, `LMP3 Ginetta`, `LM P2`, `WEC P2`); Suggest compares tokens regardless of order and uses the class prefix to reject conflicting classes, while Simagic's official presets are car-first and tagged for other games (`296 GT3`, `M4 GT3`). The same car often has both.
- Test switch done: GT NEO HYP Peugeot → GT3 296 (left there, user's choice).

Settled with the user (no further validation needed):

- Device identity stays the same across SimPro restarts and wheel reconnects: saved devices and mappings match by canonical UUID.
- LMU does not show a loading screen between practice, qualifying and race of one event (none appears on the live dashboard), so the lifecycle stays out of `loading` and one load covers the **whole event / weekend**: the switch runs once, in the first garage.

## Findings from the existing source

- `server/plugins/dataPlugin.ts` / `docs/PLUGINS.md`: immutable JSON data packages, no executable lifecycle. Keep peripheral plugins separate (`server/peripherals/`).
- `server/live/liveService.ts` runs without browser clients. Events today: `lifecycle`, `session-loaded` (also true for replays, so not the trigger), `game-running`. Every snapshot goes through the private `publish()`; the identity resolver's `onChange` also publishes. A replay is published as lifecycle `menu` (`applyReading`), so a replay never appears as `garage`.
- `shared/domain/live/liveLifecycle.ts`: `deriveLiveState` gives `loading` / `menu` / `offline` from the navigation screen and buffer, `garage` = `!inRealtime`, `starting` (phase 0–4), `driving`, `finished`. `garage` covers the first garage and every later return to the monitor.
- `LiveIdentityResolver` keys identity on session code + track + entry name + class (resets on practice → qualifying), and the navigation answer comes 0–30 s after a load. `resolveLiveIdentity` uses the entry name first (`resolveVehicle(session.vehicleName)`), then `vehFile`, then `classes`; the REST car may already be the menu's next car.
- `shared/domain/vehicleMapping.ts`: `resolveVehicle(value)` → `{ model, carClass } | null`; `normalizeCarClass`, `knownCarClass`, `VEHICLE_CLASS_OPTIONS`, `VEHICLE_KEYS` (generated, `class/car name` → keys). Suggest needs the list of canonical models with their display names and aliases: export what exists rather than duplicating it.
- App settings are key/value metadata: `SessionDatabase.getMetadata` / `setMetadata` (pattern: `server/live/liveSettings.ts`). Use that for plugin settings instead of a settings table.
- Process listing: `server/live/gameProcess.ts` (Toolhelp via koffi) lists process names; elevated `simpro3.exe` processes are visible by name.
- **There is no live dashboard menu today.** Show plugin status as a compact chip in `src/components/live/LiveSessionBar.tsx` (121 lines) instead; see "Live dashboard status".
- Settings sections: `src/components/settings/settingsSections.ts` (`SETTINGS_SECTIONS`), rendered by `Settings.tsx` (`case` per section id); panels use `SettingsPanel`, dropdowns use `src/components/common/dropdown/Select.tsx` (never a native select).
- Routers are mounted in `server/index.ts` (`app.use('/api', createXRouter(...))`).

## Architecture

```text
LiveService (snapshot event)
        |
PeripheralHost (server/peripherals/)  -- load detector, readiness gate, once-per-load guard, switch runner
        |                     \
 dynamic import()          SQLite stores (server/core/peripherals/) + metadata settings
        |
 lmu-peripheral-simagic (file:../SimagicWheelDeamon, optional)
        |
 SimPro REST 127.0.0.1:4010 ---- GT NEO wheel / Alpha EVO base
```

The host owns registration, enable/disable, start/stop, the guard, status and error isolation; a plugin exception or rejected promise becomes plugin status, never an app crash. A disabled plugin makes no vendor requests. The plugin is stateless and never decides when to switch.

## Plugin package (Simagic repository)

Convert `C:\Documents\SimagicWheelDeamon` main directly (user decision):

1. Ask the user to disable the old daemon's startup entry (shortcut in the Startup folder created by `tools/create_windows_shortcuts.py`) — do not delete it yourself.
2. Remove: `src/simagic_daemon/` (Python), `SimagicWheelDaemon.bat`, `SimagicWheelDaemon.pyw`, `pyproject.toml`, `src/*.egg-info`, `tools/*.py`, `assets/` tray icons. Keep `LICENSE` (MIT), `docs/` (update `CODE_MAP.md`, `README.md`; keep the research docs and `SIMPRO_API_CONTRACT.md`), `fixtures/simpro/`. Leave `local/` (private, gitignored) and ignored historical logs untouched; neither is part of the plugin deliverable.
3. Add a TypeScript ESM package:

```text
package.json        name "lmu-peripheral-simagic", "type": "module", "private": true,
                    "exports": { ".": "./dist/index.js" }, "types": "./dist/index.d.ts",
                    scripts: build (tsc), test (vitest run), lint, prepare (npm run build)
tsconfig.json       strict, NodeNext, declaration, outDir dist
src/index.ts        CONTRACT_VERSION, createSimagicPlugin
src/contract.ts     the plugin-side types below (no analyzer imports)
src/simproClient.ts post(method, body, signal) -> envelope; deadline; envelope validation
src/uuid.ts         canonicalUuid(hex|decimal) -> decimal string via BigInt
src/simagicPlugin.ts the members below
test/               vitest against fixtures/simpro via a local fake HTTP server (node:http)
```

No runtime dependencies (use global `fetch` + `AbortSignal.any([signal, AbortSignal.timeout(ms)])`). `.gitignore` adds `node_modules/`, `dist/` (built by `prepare` on install). Keep the MIT attribution for anything ported from the daemon.

### Contract (version 1)

Declared in the plugin (`src/contract.ts`) and mirrored by the analyzer (`server/peripherals/peripheralContract.ts`); the analyzer never imports the plugin's types.

```ts
export const CONTRACT_VERSION = 1;

export interface PeripheralHost {
  log(level: 'info' | 'warn' | 'error', message: string): void;
  now(): number;
}

export type DeviceRole = 'wheel' | 'base';

export interface PeripheralDevice {
  productUuid: string;        // canonical decimal
  deviceUuid: string;         // canonical decimal
  role: DeviceRole;           // SimPro product_type; pedals and others are not returned
  name: string;               // product_name
  firmware: string | null;
}

export interface PeripheralPreset {
  presetUuid: string;         // decimal string, never a number
  name: string;
  tags: string[];             // gameName_list, e.g. ['lmu']
  official: boolean;          // isOffical
  active: boolean;            // selected
}

export type PresetList = { ok: true; presets: PeripheralPreset[] } | { ok: false; error: string };
export type ActivePreset = { ok: true; presetUuid: string } | { ok: false; error: string };   // error = unknown
export type SelectResult = { outcome: 'accepted' } | { outcome: 'rejected'; error: string } | { outcome: 'uncertain'; error: string };
export interface PeripheralHealth { api: 'responsive' | 'unavailable'; process: 'present' | 'absent' | 'unknown'; }

export interface PeripheralPlugin {
  id: string;                 // 'simagic'
  label: string;              // 'Simagic (SimPro)'
  contractVersion: number;
  listDevices(signal: AbortSignal): Promise<{ ok: true; devices: PeripheralDevice[] } | { ok: false; error: string }>;
  listPresets(device: PeripheralDevice, signal: AbortSignal): Promise<PresetList>;
  readActivePreset(device: PeripheralDevice, signal: AbortSignal): Promise<ActivePreset>;
  selectPreset(device: PeripheralDevice, presetUuid: string, signal: AbortSignal): Promise<SelectResult>;
  checkHealth(signal: AbortSignal): Promise<PeripheralHealth>;
}

export function createSimagicPlugin(host: PeripheralHost): PeripheralPlugin;
```

Behavior of the Simagic implementation:

- Every request has a deadline (default 3 s; `checkHealth` 1.5 s) combined with the caller's signal. Body `status !== 200` → error with `message`. Non-JSON or missing fields → error, never a partial result.
- `listDevices`: `get_device_list`; keep `device_uuid_valid === true` and `product_type` `wheel`/`base`; canonicalize UUIDs.
- `listPresets`: `preset_get_dev_config_list`; every entry must have string `presetUUID` and `presetName` or the whole call fails (complete or nothing).
- `readActivePreset`: same list; exactly one `selected: true` → its UUID, else `{ ok: false, error: 'no unique selected preset' }`.
- `selectPreset`: `preset_select_dev_config` with canonical decimal UUIDs. `status 200` and `result.preset_uuid === presetUuid` → accepted; `status 500` → rejected; timeout/abort/connection error after the request started → uncertain. **Never retried inside the plugin.**
- `checkHealth`: `get_support_device` with a short deadline → api; process via a Windows process-name check for `simpro3.exe` (`tasklist /FI "IMAGENAME eq simpro3.exe" /FO CSV /NH` with `windowsHide`, or the analyzer-style Toolhelp probe; `unknown` on non-Windows or failure).
- Tests: each member against the fixtures; hex/decimal canonicalization; UUIDs > 2^53 round-trip exactly; envelope 500, garbage JSON, timeout and abort; zero or two `selected` entries → unknown; select unknown preset → rejected; select timeout → uncertain; no retries (fake server counts requests).

## Analyzer: loading the optional plugin

- `package.json`: `"optionalDependencies": { "lmu-peripheral-simagic": "file:../SimagicWheelDeamon" }`. The analyzer must install, build, lint and test without that folder.
- `server/peripherals/peripheralContract.ts`: the types above (analyzer copy) and `PERIPHERAL_CONTRACT_VERSION = 1`.
- `server/peripherals/pluginRegistry.ts`: `REGISTERED_PERIPHERALS = [{ id: 'simagic', packageName: 'lmu-peripheral-simagic', factory: 'createSimagicPlugin' }]`. `loadPeripheralPlugin(entry)` does `await import(entry.packageName)` in a try/catch: missing package → status `not-installed`; other errors → `load-failed` with message. Narrow the module from `unknown`: `CONTRACT_VERSION === 1`, factory is a function, the created object has `id === entry.id` and the five methods → else `incompatible`. No `any`, no casts beyond a type guard.
- Tests inject a fake `PeripheralPlugin` through the host constructor; they never import the real package.

## Persistence

Settings in metadata (`getMetadata`/`setMetadata`), one JSON value per plugin under `peripheral_settings:simagic`, validated on read (invalid → defaults):

```ts
interface PeripheralSettings {
  enabled: boolean;                 // default false
  automatic: boolean;               // default true (only matters when enabled)
  wheel: SelectedDevice | null;     // { productUuid, deviceUuid, name }
  base: SelectedDevice | null;
}
```

Tables (DDL in `server/core/dbSchema.ts`, `CREATE TABLE IF NOT EXISTS`, `WITHOUT ROWID`):

```sql
CREATE TABLE IF NOT EXISTS peripheral_presets (
  plugin_id TEXT NOT NULL,
  product_uuid TEXT NOT NULL,
  device_uuid TEXT NOT NULL,
  preset_uuid TEXT NOT NULL,
  name TEXT NOT NULL,
  tags_json TEXT NOT NULL,          -- JSON string array
  official INTEGER NOT NULL,
  available INTEGER NOT NULL,       -- 0 once absent from a complete refresh
  PRIMARY KEY (plugin_id, product_uuid, device_uuid, preset_uuid)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS peripheral_catalog_refreshes (
  plugin_id TEXT NOT NULL,
  product_uuid TEXT NOT NULL,
  device_uuid TEXT NOT NULL,
  refreshed_at INTEGER,             -- last complete refresh, ms; null before the first success
  last_error TEXT,                  -- last failed attempt, null after success
  PRIMARY KEY (plugin_id, product_uuid, device_uuid)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS peripheral_car_preset_mappings (
  plugin_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('wheel', 'base')),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('model', 'class')),
  scope_key TEXT NOT NULL,          -- canonical model (resolveVehicle().model) or normalized class
  product_uuid TEXT NOT NULL,
  device_uuid TEXT NOT NULL,
  preset_uuid TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, role, scope_kind, scope_key)
) WITHOUT ROWID;
```

Store: `server/core/peripherals/peripheralStore.ts` (prepared statements; `replaceCatalog(device, presets)` in one `db.transaction`: upsert names/tags/official, `available = 1` for listed, `available = 0` for absent, set `refreshed_at`; `recordRefreshError`; `listCatalog`; `listMappings`; `saveMappings(rows)` in one transaction, validating each preset exists for that device; `clearMapping`). A mapping whose device differs from the currently selected device, or whose preset is unavailable, is **broken**: kept, shown, never applied.

## Mapping resolution and Suggest (`shared/domain/peripherals/`)

`resolvePresetTarget(mappings, role, car)` where `car = { model: string | null; carClass: string | null }`: the `model` row for `car.model`, else the `class` row for `normalizeCarClass(car.carClass)`, else `null` (unmapped). No exact-livery level, no global default, no cross-car fallback. Pure, tested.

`suggestMappings(cars, presets, existing, { overwrite })` — pure, deterministic:

- `cars`: every canonical model the app knows (from `vehicleMapping.ts`: model id, display name, class, aliases), one call per device/role.
- Normalize names: lowercase, strip punctuation, collapse whitespace, split into tokens (`"GT3 296"` → `gt3`, `296`).
- A preset matches a car when the preset's tokens contain the car's distinguishing model tokens (from its canonical name or an alias: `296`, `m4`, `vette`/`corvette`, `valkyrie`, `9x8`/`peugeot`, …) and contain no token naming another class (`gt3`, `gte`, `lmp2`/`lm p2`, `lmp3`, `hyp`/`hypercar`) that conflicts with the car's class.
- Manufacturer-only matches (`Porsche`, `BMW` when the maker has several cars) never count.
- Several presets match one car → prefer the ones tagged `lmu`; if exactly one remains, use it; otherwise leave the row empty (ambiguous).
- Fills empty rows only unless `overwrite`; returns the proposed rows plus a per-car reason (`matched "GT3 296" (lmu)`, `ambiguous: 296 GT3, GT3 296`, `no match`) for the UI. Saved results are ordinary mappings.
- Fixture-driven tests using the real names in `fixtures/simpro/preset_get_dev_config_list.wheel.json` (copy the sanitized file into `test/fixtures/peripherals/`): `GT3 296` wins over `296 GT3` by the `lmu` tag; `HYP Peugeot` → Peugeot 9X8; `LM P2` vs `WEC P2` both LMP2 → ambiguous unless an alias distinguishes; `GT Neo Default` matches nothing.
- Missing aliases belong in `vehicleMapping.ts` (useful ones may come from the old daemon's `vehicle_mapping.py`); do not create a second car list.

## Session-load hook and switching (`server/peripherals/`)

`LiveService` change: add a `snapshot` event (`events.emit('snapshot', this.snapshot)` at the end of `publish()`), typed with the other events. Nothing else in `LiveService` changes.

### Load detector (`sessionLoadDetector.ts`, pure state machine)

Input per snapshot: `lifecycle`, `session` (track, vehicleName, vehicleClass), `identity`, `receivedAt`. State: `{ phase: 'idle' | 'pending' | 'handled', key, garageSince }`.

- `previousLifecycle ∈ {loading, menu, offline}` and `lifecycle === 'garage'` → new load: `key = trackName|vehicleName|vehicleClass`, `phase = 'pending'`, `garageSince = receivedAt`.
- First snapshot after backend/plugin start that is `garage` → same as a new load (restart counts as a new load; readback makes it a no-op).
- `lifecycle` becomes `loading`, `menu` or `offline` → `idle` (any pending work is cancelled).
- `garage` with a key different from the pending/handled key (car or track changed without passing through loading) → new load.
- Garage → `starting`/`driving`/`finished` while `pending` → the load is consumed as `skipped: left the garage`.
- Return to `garage` with the same key → nothing (no re-arm). Practice → qualifying → race keeps the key.
- LMU does not pass through `loading` between the sessions of one event, so a load is one event / weekend. Should it ever do so, the second load finds the presets already active (zero writes).

### Readiness (while `pending`, re-evaluated on each snapshot and a 1 s timer)

- Settled: `lifecycle === 'garage'` for at least **3 s** since `garageSince`.
- Car: `resolveVehicle(session.vehicleName)` → use it. Else `identity.vehicleModel` only when `identity.carClass === knownCarClass(session.vehicleClass)`. Else keep waiting while in the garage (identity refreshes arrive as snapshots).
- Plugin enabled, automatic on, at least one selected device. Otherwise consume the load as `skipped` with the reason.

### Switch runner (`presetSwitchRunner.ts`), once per load

For each role with a selected device, sequentially (wheel, then base), under one `AbortController` cancelled when the detector leaves `pending`:

1. `resolvePresetTarget`; none or broken → result `unmapped` / `broken`, next role.
2. `listDevices` → the selected device must be present (same canonical UUIDs) → else `device-missing`.
3. `readActivePreset` → unknown → `skipped: readback unknown` (no write). Equal to the target → `already-active` (no write).
4. Re-check: same load key, still `garage`, not aborted → else `skipped: left the garage`.
5. `selectPreset` → `accepted` / `rejected` / `uncertain`.
6. After `accepted`: `readActivePreset` once → `applied` (confirmed) or `applied-unconfirmed` (readback differs or unknown). Never another write.

Mark the load `handled` before step 1 (so an exception still consumes it). Results per role are kept in memory as the last run (`{ loadKey, car, startedAt, roles: { wheel?: RoleResult, base?: RoleResult } }`) and shown in Settings. No retries, no rollback, no periodic enforcement; presets stay as selected on session end, game exit, disable and shutdown.

`PeripheralHost.stop()` (called from the server shutdown path) unsubscribes from `LiveService`, clears timers and aborts in-flight work.

### Health

`checkHealth` every 15 s while the plugin is enabled (and immediately on enable / Settings open), cached with its observation time; disconnects only update status. Settings requests `POST /:id/health/refresh` once on mount for an enabled, ready plugin. Concurrent checks share the same in-flight promise, and cancelled work cannot overwrite newer configuration. Combine with the device list for "selected device absent". The dashboard continues reading cached status only.

## API (`server/routes/peripherals/peripheralRoutes.ts`, mounted at `/api/peripherals`)

| Method + path | Body / response |
|---|---|
| `GET /` | `PeripheralsStatus[]`: id, label, install state (`not-installed` / `load-failed` / `incompatible` / `ready`), settings, cached health, last run, detected car, resolved per-device targets and current load phase/skip reason |
| `POST /:id/health/refresh` | Read-only vendor health/device refresh; returns updated plugin status and never dispatches selection |
| `PUT /:id/settings` | `PeripheralSettings` (validated); enabling triggers a health check and, if devices are selected and the catalog is empty, a refresh |
| `GET /:id/devices` | Live `listDevices` (for the device pickers) |
| `GET /:id/presets` | Cached catalog per selected device + `refreshedAt`, `lastError` |
| `POST /:id/presets/refresh` | Refresh selected devices' catalogs; returns the catalog |
| `GET /:id/mappings` | Mappings with broken flags + the car list (models grouped by class, class defaults) |
| `PUT /:id/mappings` | Replace the given rows (validated in a transaction); `null` preset clears |
| `POST /:id/mappings/suggest` | `{ overwrite: boolean }` → proposed rows + reasons (**not saved**; the UI saves via `PUT`) |
| `POST /:id/apply` | `{ model?: string, carClass?: string }` → runs the switch runner for that car now; refused with 409 while lifecycle is `starting`/`driving`/`finished`; in `garage` it marks the current load `handled` first; returns the per-role results |

Shared DTOs in `shared/types/peripherals.ts`. Every vendor call is backend-side to the fixed loopback address; no URL parameter reaches SimPro. Plugin not installed/disabled → the plugin routes answer 409 with a clear message (status `GET /` still works). Client: `src/api/peripheralsApi.ts` via `fetchJson`/`postJson` (and the existing PUT helper if present).

## Settings UI (`src/components/settings/peripherals/`)

New section `peripherals` in `SETTINGS_SECTIONS` (title "Peripherals", icon e.g. `Gamepad2`, keywords simagic, simpro, wheel, base, preset, led, profile). Components, each ≤ 300 lines:

- `PeripheralsCard.tsx`: per plugin; not installed / load failed / incompatible messages; Enable and Automatic switches; SimPro health line; a note that SimPro must be running (the analyzer does not start it) and that a selection applies the complete SimPro preset (LEDs, buttons, FFB).
- `PeripheralDevicePickers.tsx`: wheel and base `Select`s from live devices (or "None"); show the saved device even when disconnected.
- `PresetMappingTable.tsx`: rows = canonical models grouped by class, plus one class-default row per class; wheel and base `Select`s from the catalog (searchable), clear buttons, broken-reference warning, catalog freshness + Refresh; **Suggest** (fills empty rows; checkbox "replace existing") shows proposed rows with reasons for confirmation, then saves.
- **Apply** per row: shows per-role results (`applied`, `already active`, `skipped: …`, `rejected`, `uncertain`, `device missing`) with the readback; disabled with an explanation while on track.
- Detected car, resolved targets and the last automatic result.
- Empty, loading and error states; `font-mono` for UUIDs; `ApiError` messages shown; theme tokens.

## Live dashboard status

No dashboard menu exists; add a small read-only chip to `LiveSessionBar.tsx` (or a tiny child component) fed by `GET /api/peripherals` (poll every 30 s while the live page is open, no SSE change). Hidden when no plugin is enabled. Texts:

| Evidence | Text |
|---|---|
| API responsive, devices present | SimPro running |
| Process absent | SimPro is not running |
| Process present, API unavailable | SimPro running, API unavailable |
| Process unknown, API unavailable | Cannot connect to SimPro |
| API responsive, selected device absent | SimPro running · wheel disconnected |

Warning icon + text for anything but the first row (not colour alone). An API failure alone is never "not running". No actions.

## Delivery sequence

1. ~~Validate the vendor contract~~ — done (see Phase 1 results).
2. **Peripheral host**: contract mirror, registry + dynamic loader, metadata settings, `snapshot` event, load detector, readiness, once-per-load guard, host start/stop wired in `server/index.ts`. Tests with fake snapshots and a fake plugin: no browser clients, replays (lifecycle `menu`) and demo never trigger, disabled plugin silent, restart in garage, garage returns, practice → qualifying.
3. **Simagic package**: repository conversion and the plugin above with its own tests (fake HTTP server, fixtures). Install into the analyzer (`npm install` picks up the optional `file:` dependency); verify the analyzer still passes with the folder renamed away.
4. **Catalog, mapping, Suggest, switch runner**: stores + DDL, `resolvePresetTarget`, `suggestMappings`, runner. End-to-end tests with fake LMU snapshots + fake plugin: already-active zero writes, unknown readback, leaving the garage mid-request (abort), rejected/uncertain without retry, partial wheel/base, broken mappings.
5. **API, Settings, Apply, dashboard chip**: routes + tests, client API, UI + component tests.
6. **Hardware session and docs**: user runs LMU + SimPro for an event (first garage switches once, later sessions do nothing); update the plugin README/CODE_MAP, analyzer `docs/PLUGINS.md` (peripheral plugins vs data packages, optional install, contract version, SimPro requirement) and `docs/CODE_MAP.md`.

## Acceptance criteria

- Loading a Ferrari 296 GT3 live session selects its mapped wheel preset and optional base preset once in the first garage, only where the active preset differs; another car selects its own. Already-active presets produce zero selection requests.
- Practice → qualifying → race of one event, garage returns, repeated snapshots, identity refreshes, mapping edits, catalog refreshes, manual SimPro changes and reconnects cause no further switch. No request is sent on track, including after a skipped or failed load.
- Works with no browser open. Replays, historical sessions, demo mode, menu car changes and stale navigation answers produce no writes.
- Unknown cars, unmapped cars, class defaults, renamed and deleted presets and two devices behave deterministically and visibly. Mappings survive restart and preset renames; failed refreshes keep the cached catalog.
- Suggest fills only unique confident matches among `lmu`-tagged presets and never touches hardware.
- Apply switches the row's presets through the same runner, is refused on track, and in the garage prevents a second automatic switch for that load.
- SimPro not running, device disconnects, rejected selections, unknown readback and partial results are visible, never retried, never block recording.
- Plugin folder absent → analyzer installs, builds, tests and runs, showing "not installed". Contract mismatch → "incompatible", app unaffected. The plugin repository has no Python and builds only the package.
- Zero warnings/errors for `npm test`, `npm run lint`, `npm run build` (analyzer) and the plugin's own build/test.

## Out of scope

Launching or supervising SimPro, profile editing, direct LED streaming, pedal presets, exact-livery mappings, a global default, migrating the daemon's configuration, persistent load tracking across restarts, dashboard actions, third-party plugin installation.
