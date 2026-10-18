# Live session evidence and learning ingestion

Status: Capture foundation, aligned evidence API and chart integration implemented and validated, 2026-10-18.
Learning/calibration remains planned.
Reviewed: Source, 199 native DuckDB catalogs, saved memory/REST recordings and synthetic integration tests.
Scope: Persist live data as a fourth source alongside XML, replay and native telemetry; reconcile it to sessions;
derive traceable evidence for analytics and deterministic learning.
Dependencies: Existing live reader and replay-safe REST polling, normalized session storage, canonical
layout/vehicle definitions, replay reconciliation, and multi-file DuckDB ownership.
Next step: Validate capture overhead and session linking during a real LMU session, then build the
deterministic evidence consumers described below; use the matched XML game patch.
Completion gate: Recoverable, versioned captures attach only to verified sessions, retain channel-level
provenance, and produce deduplicated learning examples with chronological validation.

## Implementation status — 2026-10-18

The user authorized implementation after channel review. The first milestone records player evidence
independently of dashboard subscribers, in `server/live-captures/` (override `LMU_LIVE_CAPTURE_DIR`).
Each session attempt has a readable layout/kind/time/UUID filename ending `.live.duckdb`. Native
telemetry files are neither rewritten nor mixed into this catalog. No quota or automatic deletion applies.

`server/live/capture/` owns ISO decoding, channel metadata, sparse REST selection, bounded transport,
worker writes and XML reconciliation. Six verified vehicle velocity/angular-rate values are stored at
the reader's approximately 50 Hz cadence. The 24 reserved wheel columns remain SQL NULL and have
`verified=false`: recorded nonzero values alone do not establish their ISO wheel frame/sign mapping.
The proper rotation is `(forward,left,up)=(-nativeZ,-nativeX,nativeY)` for both vehicle vectors.
Saved JSONL supplied real numeric regression inputs; it is rounded decoded evidence, not a raw ABI dump.

Sparse observations retain player scoring/conditions, car damage/compound state, selected pit menu,
resource choices, tyre inventory/estimates, repair/refuel estimates, forecast and schedule, plus
versioned deterministic strategy predictions. Safe existing REST requests supply these observations;
request intervals are retained separately from game elapsed/lap clocks. Opponent records are excluded.

The SQLite index survives manual file deletion. Matching requires a known canonical layout and vehicle,
exact driver, session kind, bounded timestamps, at least two completed lap anchors within 0.05 seconds,
and a unique one-to-one candidate. Conflicting anchors prevent attachment. XML `GameVersion` is inherited
only after verification; ambiguous evidence stays pending and stale links are withdrawn. Raw-file
provenance is synchronized while off track. Session detail exposes `liveCaptures`; `/api/live/capture`
exposes recorder health, queue/drop counts and channel availability.

Writing uses transferred typed batches, a bounded queue and one dedicated worker; overload produces
explicit drop counts. Finalization checkpoints DuckDB off track. Reconnect reuse requires a unique recent
identity/clock/lap-anchor match; completed attempts cannot reopen. Replay or inconclusive navigation
does not release capture frames. Startup can therefore leave an intentional gap until live play is confirmed.
Catalog discovery validates app signatures; native DuckDB files are ignored. Shutdown waits for writer exit.
Existing source controls and folder help now call LMU's exported data **Native telemetry**;
internal `duckdb` API identifiers remain compatible with existing consumers.

Validation includes real worker writes/readback, retry idempotency, recovery, bounded backpressure,
catalog rediscovery, strict reconciliation, REST selection and replay exclusion. A synthetic hour
(180,000 rows, six varying doubles plus 24 NULL channels, no REST stream) occupied 17,575,936 bytes
after checkpoint. Writer throughput was 81.97 seconds for that hour, with 18.86 ms median / 39.15 ms
p95 per 50-row batch. These are storage/throughput measurements, **not measured game frame-time impact**.

Checks passed: 3,118 tests (56 intentionally skipped), production build, final recorder/API tests (63),
source-label/settings tests (174) and the endpoint benchmark. The source-label detector found no issues.

Still planned: wheel convention verification, visible source
management, durable learning-example extraction, chronological evaluation and forecast calibration.
The sections below retain the broader design; proposed examples are not all shipped interfaces.

## Aligned evidence reader — 2026-10-18

`GET /api/session/:sessionId/live-evidence?driverOrdinal=0&lapOrdinal=1` uses the same stored
session/driver/lap ordinal locator as native telemetry and replay requests. `src/api/liveEvidenceApi.ts`
provides the typed frontend fetcher. This exposes a complementary source; it does not replace native
telemetry or replay measurements or silently overlay them on existing charts.

The service requires the player, a completed XML lap, one current verified attachment and a unique
matching scoring lap-start/duration anchor (0.05-second tolerance). It reuses the canonical reconciliation
rules against current XML before and after the worker read. Withdrawn ownership, reparsed identity/timing,
missing files, ambiguous matches and loaded game sessions return structured `state: unavailable` reasons.
Missing or invalid locators return HTTP 404 or 400. Responses use `Cache-Control: no-store`.

`evidenceReader.ts` permits at most two independent read-only workers, with a ten-second timeout.
They never use the writer queue, and their process-local DuckDB handles are released before responses
resolve. The reader validates file identity, schema, normalization, channel conventions and stored anchors.
It reads at most 50,000 raw samples per lap; exceeding that limit reports unavailable rather than silently
downsampling. No read starts while a game session is loaded; a session loading during a read discards
its result. This is workload avoidance, not a measured guarantee of zero game-performance impact.

Samples retain game elapsed seconds and derive `lapSeconds = elapsedSeconds - verifiedStartSeconds`.
The raw memory lap counter is not assumed to have the XML numbering. Values remain ISO 8855 float64
measurements; unavailable entries remain NULL. Coverage includes first/last lap timestamps, gaps over
0.1 seconds and the recording-wide drop count. There is no interpolation, time stretching, nearest-lap
selection or change of source ownership. Native track/map coordinates remain untouched.

Only game-timestamped observations within the lap enter `observations`. REST observations without a
game timestamp remain in `sessionObservations`, retaining request/wall timestamps without assigning
them to a lap. Each stream is bounded to 1,000 observations and 1 MB of JSON data before transfer from
the worker; `observationsTruncated` signals omitted data. Recording ID plus sample index / observation
ID provides stable deduplication identity, including observations at a shared lap boundary.

Verification: the full suite passed 3,126 tests (56 intentionally skipped); subsequent focused reader,
API and benchmark tests passed 19 tests, including JSON bounds and concurrent-reader rejection.
The production build passed without warnings. Real worker tests cover exact lap intervals, zero/NULL
preservation, gaps, session-only REST evidence, stale identity/clocks, path traversal and manual deletion.
The before/after endpoint sweep on the same snapshot found no regression above the project's
>20% and >5 ms threshold. The unlinked evidence path measured 1.29 ms median / 2.39 ms p95;
that number does not represent a real-file read or game frame-time overhead.
This reader does not yet extract training examples, calibrate forecasts or enable unverified wheel data.

## Chart and analysis integration — 2026-10-18

Player telemetry responses now include an inexpensive `hasLiveCapture` hint only for an available
verified attachment under the current match rule. `fetchSessionTelemetry` requests the separate
evidence API only when that hint is present. Missing/unavailable supplemental evidence leaves the
base trajectory usable and reports an unavailable source state; cancellation still propagates.
The same fetch path serves primary/comparison laps, debriefs and consistency analysis.

`shared/domain/live/liveTelemetryFusion.ts` requires exact session/driver/lap identity, matching
completed lap durations and ISO conventions. Native telemetry uses its explicit lap-relative clock.
A session-relative replay requires an explicit lap origin agreeing with the live game-time anchor
within 25 ms; matching uses the shared game clock, not an arbitrary first-point offset. Unknown
clocks remain unaligned. No time fitting, sample stretching, interpolation or extrapolation is applied.
Each target chart point selects its nearest source sample within 25 ms and within the recorded span.
Capture gaps, unavailable values and low/reverse forward velocity retain the computed fallback.

Measured yaw rate converts rad/s to deg/s without rounding. Body slip is derived as
`atan2(velocity_left, velocity_forward)` for forward velocity at least 5 m/s, retaining the ISO
positive-left convention. Per-point `liveDynamics` records the source recording, sample index,
time offset and which dynamics were supplied. Replay coordinates, timing, native input channels,
source identity and stored caches are unchanged.

Client dynamics processing preserves these supplied yaw/slip values and uses the supplied yaw in
subsequent deterministic balance calculations. **Native telemetry G-force measurements remain
unchanged, including measured zeroes; replay-only G remains computed.** Live-derived G is still an
estimate when calculated using yaw and speed, not a direct acceleration measurement. Unverified wheel
channels remain disabled. No forecasting model is trained or recalibrated by this integration.

The inspector shows live coverage as a percentage of served chart points for yaw and beta,
with raw gaps, recording-wide drop counts, patch and normalization provenance in the tooltip.
Following the existing G-force convention, real-data yaw and velocity-derived beta have no extra
channel badge; only estimated fallback shows `COMPUTED` at the selected point. This supersedes the
initial `LIVE CAPTURE` / `LIVE VELOCITY` badges by user direction. Coverage percentages describe
chart-point coverage, not an uninterrupted raw lap.
Comparison traces retain the existing distance-based display interpolation; that is not a new raw
live measurement. Missing captures show a reason without hiding the base telemetry.

Verification: the full suite passed 3,140 tests (56 intentionally skipped), with final focused fusion,
fetch, chart and route checks covering G preservation, cancellation, identity, clocks, gaps and source
disclosure. The production build and mechanical UI detector passed; covered-point, gap and unavailable
states were visually inspected in an isolated synthetic preview without touching LMU or real sessions.
The final focused suite passed 42 tests; a route check also confirms the attachment hint does not
mutate retained trajectory objects. Same-snapshot endpoint sweeps found no threshold regression;
automatic telemetry measured 154.57 → 152.00 ms and VCR telemetry 82.23 → 80.48 ms median.
Those endpoints measure the unlinked path, excluding a live-file read and client fusion.

## 1. Objective and boundaries

### Confirmed user decisions (2026-10-17)

- Record automatically whenever this app and LMU are running, independently of dashboard visibility.
  Persist actual live-session evidence only; menu/replay states still follow the exclusion rules below.
- Capture all verified useful channels not covered by native telemetry and replay. Build a capability
  matrix to establish coverage, units and semantics; do not limit the initial scope to strategy essentials.
- Retain recordings without a hard size cap or automatic oldest-first deletion. The user will perform
  manual cleanup when needed; report recording sizes so usage is visible. This supersedes the initial
  5 GB policy. Compact learning evidence, source manifests and provenance remain separate.
- Use data representations appropriate to each channel and minimize capture CPU, allocations and I/O
  to avoid affecting game performance. Defer compression and expensive compaction until the session ends.
- Store live capture in **one app-owned DuckDB recording per game session attempt**, including multiple
  capture/reconnection segments. Keep it separately linkable and manually removable like native telemetry.
- Name sources by meaning: **Native telemetry** for LMU's exporter and **Live capture** for app-recorded
  supplemental data. DuckDB names the storage engine, not the source category; see section 10.
- Convert verified LMU memory dynamics to the **ISO 8855 standard** once at ingestion, before writing
  the live-capture DuckDB file. The app expects ISO 8855 values; persist those directly so readers,
  fusion and learning do not repeat source-axis/sign conversion. Never label unmapped native values ISO.
- Capture the player car only. Opponent race context comes from saved VCR replays; when no replay
  is saved it is absent. Do not record opponent scoring in live capture.
- The game patch reported by XML `GameVersion` is sufficient game-version provenance. Do not require
  exact executable-build discovery or introduce a separate game-build lookup as a prerequisite.
- Use DuckDB's existing game-time and lap-relative alignment convention as the primary reference
  for live data. VCR is a supporting compatibility example, not the preferred capture model.
  Do not introduce a separate wall-clock alignment system for live channels.
- The user subsequently authorized implementation after reviewing the channel analysis.
- Before implementation, present the concrete channel list, cross-source coverage, verification status,
  and proposed capture shape/cadence for user review. No implementation before channel scope is known
  and reviewed. See [Live channel inventory](LIVE_CHANNEL_INVENTORY.md).

Treat live observations as durable session evidence, independent of whether the dashboard is open.
The dashboard becomes a consumer of that evidence. XML remains the anchor for official stored
sessions and results; replay and DuckDB remain independent sources with their existing responsibilities.

The first milestone is trustworthy evidence, not automatic forecast calibration. Later learning must
remain deterministic, learn from measured outcomes, and demonstrate improvement against a baseline.
AI may explain findings but must not calculate metrics, source ownership, scores or predictions.

The original analysis did not authorize implementation. The subsequent user instruction authorized the
capture foundation above. Historical findings below describe the inspected pre-change code; remaining
schemas and learning interfaces are design sketches. No deployment or historical source rewrite occurred.

## 2. Current ingestion architecture and findings

| Source | Current entry and storage | Consequence for this proposal |
|---|---|---|
| Results XML | `server/core/dbSessionSync.ts` and `server/sessions/parser.ts`; normalized session/driver/lap rows | Creates the official historical session; new source attachments must survive reparses |
| Replay | `server/core/replay/dbReplaySync.ts`, replay workers and stores | Adds trajectory, weather and race evidence; retained cache survives missing source files |
| DuckDB | `server/telemetry/telemetryCatalog.ts`, `duckdbReader.ts`, `telemetryLinks.ts` | Multiple files can belong to one session; ownership and lap file selection are already distinct concerns |
| Live | `server/live/liveReader.ts`, `liveService.ts`, domain trackers and `live_strategy_audit` | Captures dashboard/strategy checkpoints outside the session ingestion pipeline |

Relevant findings:

- XML session IDs currently derive from the XML filename. A live capture cannot know this ID in advance.
- Completed XML paths are skipped on ordinary scans. Attach evidence through reconciliation rather
  than forcing XML reparses or fingerprint checks.
- Session writes and summary projections are transactional. Source attachment and resulting projection
  changes must also be atomic.
- Scans are held while a game session is loaded; live persistence must operate independently of that hold.
- `LiveService` owns the reader worker, but strategy REST polling and audit writes depend on dashboard
  clients. Disconnecting the page can end an audit run even though the game session continues.
- `LiveAuditTracker` records snapshots at bounded checkpoints, including immutable forecasts and
  measured consumption comparisons. It is useful forecast evidence, not a complete source recording.
- `dbLiveAuditStore.ts` stores JSON checkpoints and prunes to the newest 30 runs at startup. That policy
  cannot govern the long-term learning dataset.
- Live identity includes canonical layout and class. It does not provide durable driver identity,
  canonical car identity, linked XML game-patch provenance or a channel availability catalog.
- `rf2Layout.ts` includes the scoring `driverName` field; `decodeVehicle` and `LiveVehicleReading`
  currently omit it. A game vehicle slot is not a persistent driver identifier.
- XML `GameVersion` is parsed and persisted as `sessions.game_version`. The live contracts do not
  establish an exact game build. Shared-memory update counters are frame-coherence counters.
- Existing telemetry fusion implements explicit DuckDB/replay field precedence, but does not offer
  general channel/interval provenance for a fourth source.
- The current source paths do not automatically calibrate forecasts from saved audits or establish
  an inferred historical session link for those audits.

## 3. Target data flow

```mermaid
flowchart LR
    A[Shared memory and safe REST reads] --> B[Recoverable capture segments]
    B --> C[Versioned channels and observations]
    C --> D[Session reconciliation]
    X[XML sessions] --> D
    R[Replay metadata] --> D
    T[DuckDB metadata] --> D
    D --> E[Session and lap evidence projections]
    E --> F[Analytics and learning examples]
    C --> G[Live dashboard]
```

Add this incrementally. Do not replace the existing source stores or introduce a generic ingestion
framework before the live-source contracts and consumers justify it.

## 4. Capture identity and lifecycle

Separate three identities:

1. **Capture:** one recorder run with a stable generated ID and recorder provenance.
2. **Segment:** a continuous interval within one game session attempt and clock epoch.
3. **Session attachment:** a versioned association between a segment and an existing stored session.

A capture may contain practice, qualifying and race segments. One session may own multiple segments
because recording started late, the server restarted or a connection was lost. Split any segment
crossing session attempts; do not attach an entire mixed-session recording to a single session.

Track explicit states: recording, completed, interrupted, recovered and failed. Preserve late-start
and partial coverage. Distinguish capture interruption from a game-session restart.

Persist live evidence immediately without waiting for XML. Keep unmatched captures available for
later reconciliation. Do not invent official historical results when no XML exists.

Recording demand must be independent of SSE subscribers. UI backpressure or browser closure must
not change persisted evidence. Preserve existing replay detection, safety checks, request serialization,
timeouts and backoff. Replay playback must never become new live learning evidence.

## 5. Canonical identity and context

Store original source values alongside resolved values and their resolution evidence/version.

| Group | Required evidence or explicit unknown |
|---|---|
| Circuit | Raw track, venue/course/scene where available; canonical layout key; resolution status |
| Vehicle | Raw vehicle/class; canonical vehicle identity and class; content/upgrade identity when available |
| Participant | Exact reported driver name, player flag, source vehicle slot and driver ownership intervals |
| Session | Raw session code, canonical kind, attempt identity and session-clock epoch |
| Conditions | Compound, wetness/rain, fuel and tyre multipliers, relevant settings and setup identifiers |
| Coverage | First/last observation, gaps, late start, interruption and finish evidence |

Resolve circuits directly with `getCircuitSpecification(...)`; do not add a second layout mapping.
Preserve exact custom venue/course identities and leave ambiguous layouts unresolved. Never mix
layouts or collapse vehicle models into a class-only consumption profile.

Use existing canonical vehicle definitions and mapping functions. If they lack a durable car identifier,
extend that canonical model explicitly rather than creating a live-only alias dictionary.

Driver names remain exact source identities, not proof of a globally unique person. Endurance swaps
require explicit driver ownership intervals. A vehicle slot must not be used as a persistent person key.
Unknown ownership can support car-level evidence but must exclude unsupported driver-specific learning.

## 6. Game, content and pipeline version provenance

Keep these independent:

- Game patch from XML `GameVersion`, already stored as `sessions.game_version`; this is the accepted
  game-version granularity. No exact executable-build identifier is required.
- Track and vehicle content/package versions, when available.
- Shared-memory plugin/protocol identity and version.
- Recorder and decoder versions.
- Channel normalization and identity-resolution versions.
- Session matching/alignment rules and evidence projection versions.
- Prediction model version and training-data lineage.

Each value carries its source, observation time and provenance status: directly observed, inherited
through a verified attachment, or unknown. Preserve disagreements between sources instead of silently
overwriting them. An inherited value must reference the verified link and be revisitable if it changes.

After verified session attachment, reference/inherit that session's XML game patch, retaining its XML
provenance and link revision. Before attachment, or when the XML patch is absent, keep it unknown.
Do not delay live capture while waiting for XML and do not infer the patch from dates or the currently
installed game. XML reparses or link withdrawals must refresh/invalidate inherited patch provenance.

Frame update counters, replay format versions and database engine versions are separate from the
game patch. Discovery may establish available content/setup identifiers, but exact-build discovery
is outside the required scope. Compatibility across XML patch versions must be explicit, not assumed
merely to increase training sample counts.

## 7. Multiple channels and observation semantics

Actual-source analysis (2026-10-17): all 199 available DuckDB files declare the same 58 continuous
channels and 40 events. Wind, brake thickness, vertical G, three tyre-temperature bands and initial
setup are already exported. See [the full catalog and proposed capture scope](LIVE_CHANNEL_ANALYSIS.md)
before interpreting earlier candidate lists as missing-source claims. The complementary dynamic core
is 30 numeric values at observed ~50 Hz, with 44.64 MB/hour of float64 payload plus timestamps; its
normalization and user review gates remain open. No implementation was performed.

Each recording declares the channels it actually captured. Do not assume all game versions, vehicle
classes, exporters or recording segments provide the same fields.

A channel declaration contains:

- Canonical key and original source field/path.
- Producer: shared-memory scoring, shared-memory telemetry, or the specific safe REST read.
- Unit, scalar/vector/four-wheel shape, coordinate axes and sign convention.
- Declared frequency when available and measured cadence/coverage.
- Timestamp semantics, interpolation/hold policy and maximum permitted age/gap.
- Capability/quality status and decoder/normalization version.

Canonical keys may have multiple producers and recordings. Keep the observations separately even
when a projection chooses one. Preserve four-wheel order FL/FR/RL/RR and LMU Cartesian x/z meters.
Follow ISO 8855 as documented by the existing normalization contract; the standard is authoritative,
not an app-specific choice of axes or signs.

ISO 8855 is mandatory for canonical vehicle/wheel dynamics, consistent with the existing telemetry
contract: vehicle X forward, Y left, Z up, positive-left steering and positive-left yaw. Use the
right-hand rule for angular vectors about the declared axes; distinguish angular velocity from
Euler-angle derivatives. Store explicit units and normalization version plus `signConvention: 'iso8855'`
only for verified canonical values. Apply conversion once at the normalization boundary, not in views
or learning models. Do not silently reuse the existing steering-only conversion for new vector fields.

The selected boundary is ingestion, between decoded LMU readings and persisted live-capture tables:
`LMU memory -> decode -> verified ISO 8855 conversion -> typed DuckDB batch -> direct consumers`.
Store source-field provenance and conversion/schema version in channel/recording metadata rather than
duplicating native and normalized sample arrays. Readers honor the stored convention/version and must
not reapply native-source transformations to ISO data. Normalize the accepted columns once for all
consumers, rather than maintaining separate dashboard and historical conversion formulas. Keep this
small deterministic transform bounded; expensive analysis/compaction remains outside the capture path.

Do not assume shared memory requires every sign to change. Use an identity conversion where a
field already matches the canonical meaning, unit and sign. Recorded forward driving demonstrates
that the raw local-velocity vector is not already ISO-axis ordered: at 133.7125 km/h in third gear,
`localVel` is `[0.4143, 0.2803, -37.139]`, with forward speed on negative native Z rather than positive
ISO X. Conversely, the measured native angular Y component already follows the project's positive-left
yaw sign in the paired heading check; it needs correct axis labeling, not an automatic negation.
Validate these mappings per field/frame and preserve compliant values without a second conversion.

Record source axes/units and the conversion formula for local velocity, angular velocity, wheel contact/
ground velocities, camber and toe. Wheel-local frames require their own documented ISO-compatible
definitions and per-corner sign checks; do not guess a camber/toe sign from left/right corner alone.
If a conversion is not yet verified, exclude that field from canonical capture columns until validated.
Any deliberately retained diagnostic native evidence must have a separate explicit convention/schema;
never mix it into ISO columns or pass it to canonical learning. Native diagnostic duplication is not
the default recording design. Historical diagnostic files used by this analysis remain untouched.

Track/map geometry remains in native LMU Cartesian x/z meters (y up), as required by existing domain
rules. ISO vehicle axes do not authorize rotating, mirroring or relabeling track boundaries/positions.

Separate the meaning of the recorded values:

| Kind | Examples | Learning treatment |
|---|---|---|
| Measurement | Fuel, VE, tread, wetness, damage | Candidate observed evidence with quality/coverage checks |
| Game estimate | Repair-time estimate, forecast, estimated usage | Predictor or estimate to evaluate; not measured truth |
| Selection | MFD target, selected tyres, garage setting | Intent/configuration; not proof of service performed |
| App prediction | Pit window, finish resource, recommended ratio | Immutable forecast with model/input lineage |
| Outcome | Measured lap consumption, actual stop duration | Target only after timing and completeness validation |

Record fuel litres, VE percentage points, fractions and percentages explicitly. Unknown or unsupported
channels remain absent/null, never zero-filled. Documented zeroed force/load channels must not become
valid measured training features without new evidence validating them.

Inventory all verified useful channels against native telemetry and replay, including measured motion,
per-wheel data, condition/tread, damage, weather, forecast and pit-menu/service information. Persist the
useful missing channels from the first capture profile; no strategy-only scope restriction applies.
Coverage means compatible semantics, units, fidelity and usable availability, not merely similar names.
Document whether a channel is redundant, complementary, unavailable, or requires further validation.

Keep the minimal overlapping timing, identity and resource observations needed for verified alignment,
capture integrity and outcome evaluation. Record why each overlap is necessary; do not duplicate full
telemetry/replay streams indiscriminately. Define behavior when an ordinarily covered channel is absent
from the actual recording, without changing the agreed principle of complementary capture.

## 8. Clocks, freshness and alignment

### Reuse the existing DuckDB/replay time convention

`duckdbReader.ts` uses `GPS Time` as the continuous sample timeline when available and timestamped
`Lap` transitions as lap boundaries. It emits lap-relative seconds as `pointTime - startTs`; channel
frequency/insertion order aligns continuous channels without their own timestamps. Timestamped state
changes retain their event times. The reader has a declared-frequency fallback when GPS Time is absent.

DuckDB is the preferred reference for the live timeline and alignment contract. Preserve explicit
native sample times, lap boundaries and channel cadence, then expose the same lap-relative seconds
for comparison. This preference concerns time semantics. The separately confirmed storage choice is
an app-owned DuckDB recording; LMU's native file need not exist or be open during live capture.

VCR provides a supporting compatibility example: frame `sTime` is elapsed simulation-session time,
replay start/end times use session seconds, and timing-loop events carry their session crossing time.
`replayLapPoints.ts` preserves `sTime` as `timeSec`; the trajectory contract supports
`timeReference: 'session'` and `lapStartTimeSec` for the selected lap. Keep interoperability with those
existing contracts while using DuckDB as the primary alignment reference.

Retain explicit clock epochs and native precision for live observations. An absent lap-start anchor
stays unknown; the first captured sample of a partial lap is not its lap start.

`telemetryFusion.ts` aligns replay points to the same lap-relative axis, subtracting the replay's
`lapStartTimeSec` through `vcrLapBaseTime` when the replay clock is session-relative, and respecting
explicit `timeReference: 'lap'`. Reuse these defining implementations directly where applicable; do
not create a pass-through live alignment wrapper or a second implementation of replay time rules.
The existing legacy fallback to the first replay sample is a compatibility path for retained replay
rows without clock metadata, not a convention to reproduce in new live recordings.

Live telemetry already exposes game session elapsed time (`elapsedTime` in `rf2Decode.ts`); scoring
exposes `currentEt` and `lapStartEt`. Preserve those source times and project verified lap intervals onto
the same lap-relative axis. DuckDB need not exist or be open while capturing: alignment to its recorded
timeline happens later, using matched lap/sector boundaries and verified source ownership.

Validate agreement between live elapsed time, DuckDB GPS/event time and replay session time on shared
crossings before assuming a zero offset. Reusing the convention does not prove identical clock epochs
or erase source latency. Persist any supported offset and residual error; keep uncertain overlaps
unresolved. Live samples have explicit source timestamps, so do not replace them with DuckDB's
row-index/frequency fallback or force them to 100 Hz.

UTC/filename times continue to help session ownership reconciliation; they are not the sample-fusion
clock. Monotonic receipt timing is for latency, freshness and recovery diagnostics. REST responses
without a source timestamp remain interval observations rather than falsely precise telemetry samples.

Preserve source game elapsed time, UTC receipt time, monotonic recorder time, source sequence and
segment/epoch ownership. For REST reads, keep request start/end and source time if supplied; receipt
time alone is not the exact measurement time. Declare uncertainty rather than inventing precision.

- Split genuine backward clock resets into new epochs/attempts; handle pauses separately.
- Record missing intervals, reconnects and repeated/stale source frames.
- Do not compute UTC session start solely as receipt time minus game elapsed time: pauses and delay
  can invalidate that calculation.
- Align lap intervals through line crossings, sector timing and session evidence, not lap number alone.
- Persist alignment method/version, offset where justified, residual error and permitted tolerance.
- Keep observations at their actual time. A cached condition response is not a fresh tyre measurement
  on every snapshot or necessarily an exact line-crossing observation.
- Never interpolate across unbounded gaps, session resets, refuelling or incompatible state transitions.

Channels can have different clocks and freshness within the same snapshot. The persistence contract
must retain that distinction rather than treating the assembled dashboard snapshot as simultaneous truth.

## 9. Session reconciliation and source ownership

Reconcile after XML writes, segment finalization/recovery, and relevant replay/DuckDB metadata changes.
Use bounded candidate windows and incremental change stamps, following existing reconciliation patterns.

Evaluate canonical layout, session kind/attempt, exact trusted participant evidence, compatible vehicle,
time overlap, and lap/sector agreement. Inherit the XML game patch only after ownership is verified;
an inherited patch must not be used as circular evidence to establish that same ownership.
Use observed coverage windows, not an assumption that capture start equals session start.

Require an unambiguous owner supported by evidence. Do not choose a nearest-time candidate when
identity or attempt ambiguity remains. Store pending/rejected/linked status, rule version, candidate
evidence and reason codes. Withdraw invalid links and rebuild dependent projections atomically.

Explicitly cover restarted races with shared XML timestamps, same-layout back-to-back sessions,
mid-session joins, empty attempts, driver swaps, missing XML and delayed source discovery. Additional
files or segments must not overwrite an earlier fragment or duplicate its observations.

Use capture IDs and immutable chunk identities, not filenames, as source identity. Re-ingesting the
same evidence must be idempotent. Session, driver and lap locators use stored session IDs and source
ordinals, not recording filenames or assumed globally unique lap numbers.

Reparsing XML restores source attachments. Ordinary attachment must not reread immutable XMLs.
Stored evidence and verified attachments survive deletion of original XML/replay/capture files.

## 10. Persistence and retention design

### Confirmed storage: one live-capture DuckDB file per session

Use one app-owned DuckDB file for each game session attempt. This follows the native telemetry's
file-based discovery, attachment and manual-cleanup pattern while storing complementary evidence.
SQLite remains the session index and owner of links, compact projections and learning metadata;
it is not the selected raw live-recording container. The earlier SQLite-first recommendation is superseded.

Several recorder runs/reconnection segments can contribute to the same file only after continuity of
the session attempt is established. Never split solely because a browser disconnects or the car enters
the garage. Never combine practice/qualifying/race or restarted attempts just because their names or
timestamps agree. Uncertain recovery fragments remain provisional; reconcile and safely consolidate
verified fragments into the session file, retaining segment identities and deduplicating observations.
The one-file rule concerns the canonical recording, not transient recovery/WAL/finalization artifacts.

Create the recording before its XML is available, with an immutable recording/session-attempt ID in
metadata. A readable filename can include canonical layout (when known), session kind, UTC start and
a short recording ID to avoid collisions; for example `bahrain_outer_R_<UTC-start>_<id>.live.duckdb`.
Names help manual browsing but do not establish ownership. Do not require file renames when XML
arrives; store the verified session link in SQLite and in appropriate provenance metadata.

Keep live files in their own configurable directory and never modify LMU's native telemetry files.
Reuse catalog/discovery/linking concepts without routing a different schema through native parsers.
Include source kind and schema version in each file's manifest. Deleting a finalized live file manually
must mark that source unavailable while preserving the session, native telemetry/replay links and
retained compact evidence. Avoid deleting files with an active writer.

Use a dedicated writer worker and bounded, typed bulk batches; no synchronous database work on the
reader/event-loop path and no per-sample transaction. Benchmark batching, memory, flush/checkpoint
behavior and crash recovery. Defer expensive explicit compaction/archive work until the session ends.
DuckDB can perform internal encoding/compression/checkpoint work during writing: do not promise it
is entirely disabled. If direct writing misses the performance gate, review a temporary staging path
without changing the agreed canonical per-session DuckDB output or silently adding a second format.

### Meaningful source naming

| Meaning | Product/domain label | Source discriminator (proposed) |
|---|---|---|
| LMU-exported telemetry recording | Native telemetry | `native-telemetry` |
| App-recorded complementary session evidence | Live capture | `live-capture` |
| Binary replay | Replay | Existing replay identity |
| Official results | Session results | Existing XML identity |

Use **Telemetry recordings** as a shared heading only where both telemetry sources are intended.
Rename existing UI/domain references that use "DuckDB" to mean native telemetry during implementation;
audit API contracts, persisted fields and migrations together. Do not reinterpret a legacy native
`duckdbFilename` as a live capture or collapse both sources into one filename slot. Keep native
multi-file support: only the new canonical live recording is one file per session.
Engine-specific adapters such as `DuckDbReader` can retain DuckDB in their names where it actually
describes the engine. Do not add alias wrappers or forwarding shims just to hide a rename. This is a
planned naming change, not a request to rename existing files, code or API fields during analysis.

The project currently uses the legacy `duckdb` Node client. Official documentation marks that client
deprecated and recommends Node Neo, which exposes bulk appending. Evaluate binding support during
format benchmarking; no dependency migration is authorized by this analysis alone. References:
[SQLite WAL and checkpoint behavior](https://www.sqlite.org/wal.html),
[SQLite application file format](https://www.sqlite.org/appfileformat.html),
[Node client status](https://duckdb.org/docs/lts/clients/nodejs/overview),
[bulk insert guidance](https://duckdb.org/docs/lts/data/insert),
[Node Neo appender](https://duckdb.org/docs/lts/clients/node_neo/overview).

Proposed table groups, with final naming/schema to be decided during contract design:

| Group | Purpose |
|---|---|
| Live captures/segments | Lifecycle, identity, version provenance, coverage and recovery state |
| Channel declarations | Producer, units, shape, capabilities, cadence and normalization |
| Sample chunks/events | Bounded recoverable observations with ordering, integrity and time bounds |
| Session source links | Ownership, participant/interval mapping, rule version and rejection evidence |
| Lap/stint/stop evidence | Compact derived facts with supporting observations and projection lineage |
| Forecast evaluations | Frozen predictions, later outcomes, model version and error measurements |

Use SQLite WAL, modular stores and prepared statements for the index/projections, and transactional
DuckDB batch writes for raw live recordings. High-frequency data belongs in typed tables, not per-frame
snapshot JSON or a duplicate full-session blob.

### Capture representation and performance

Choose representation by channel semantics, avoiding waste before applying compression:

- Dense numeric channels: typed numeric columns, populated through bounded bulk batches.
  Preserve source precision initially; any narrower type or quantization requires measured error bounds.
- Discrete state/settings: timestamped changes plus an initial state per recoverable chunk, rather than
  repeating identical values every sample. Retain repeated responses only when their new observation
  time carries useful freshness or validation evidence.
- Sparse events: compact timestamped event records, with stable event IDs/sequence for deduplication.
- Static metadata/strings: segment or channel dictionaries/manifests, referenced by ID from samples.
- Timing: shared block timelines only for truly synchronous samples; separate clocks/timestamps for
  asynchronous producers. Never manufacture simultaneity to save space.
- Missing/invalid values: explicit validity masks/status, preserving the distinction from measured zero.

DuckDB is the selected container; table layout, batch encoding and explicit post-session compaction
policy still need measurement. Avoid JSON serialization or a database transaction per sample.
Persist only useful complementary channels and the
minimal overlap required by section 7; avoid full-frame dumps, repeated snapshots and unused padding.

During a session, append typed batches through a dedicated bounded writer, batching I/O
and reusing buffers where practical. Keep expensive encoding, indexes, compaction and training off
the shared-memory reader path. Select block size and flush cadence by both I/O cost and acceptable
crash-loss window; do not perform a durability flush per frame. Record backpressure/gaps explicitly.
Preserve existing safe REST request limits rather than increasing polling to fill nominal sample rates.

### Deferred compression and finalization

When the game session has ended, enqueue compression/compaction of closed chunks in a background
worker. Browser closure, a temporary disconnection or return to the garage does not establish session
completion. Bound concurrency and CPU/I/O usage; suspend or defer jobs if another game session starts.
Interrupted sessions can finalize after recovery establishes that their segments are no longer active.

Use lossless compression by default. Retain channel metadata, sample ordering, validity, timestamps and
random lap/window access through independent blocks or an index. Verify decompressed content/integrity
before atomically publishing the replacement and deleting the uncompressed input. Keep jobs resumable
and idempotent; on failure the original remains readable. Compression must not change source identity,
observations, projection lineage or classification, and must not require decoding replay files again.

Account for uncompressed and compressed files plus temporary replacement space in storage reporting.
Check available disk space before compression; use bounded-chunk replacement or defer the job when
space is insufficient. Never delete retained recordings automatically to make room, or delete an
in-flight source chunk. Removing verified redundant uncompressed inputs after lossless replacement
is format finalization, not retention cleanup.

Before choosing chunk encoding, measure representative session size, capture overhead, write latency,
recovery and bounded lap reads. Container choice is settled; validate the schema and writer strategy.
Use bounded buffering and an explicit durable acknowledgement/recovery policy. On storage failure,
surface capture degradation and mark gaps; never block the game reader indefinitely or silently
claim complete evidence. Handle disk-full, process termination and incomplete final chunks.

Retention separates raw samples, compact observations/outcomes, and disposable UI/audit diagnostics.
There is no automatic storage limit or age/size eviction for recordings. Retain completed, partial and
unmatched recordings until the user manually cleans them up. Continue bounded buffering/chunking
for memory and recovery; removing the disk cap does not remove those requirements. Measure/report
raw, compressed, temporary and compact-evidence growth separately. Cleanup must preserve compact
learning facts, source manifests and provenance, marking removed inputs unavailable. Do not let the
existing 30-audit-run pruning delete training
lineage. If raw evidence is deliberately removed, retain its manifest and mark
which projections can no longer be recomputed; never claim full reproducibility without the inputs.

Existing audit rows may remain historical forecast diagnostics. They cannot be upgraded into complete
channel recordings or assigned drivers that were never captured. A game patch may be inherited from
a verified XML attachment with explicit provenance, not guessed from the audit date. Migrate only facts their
stored evidence supports; ambiguous historical attachments remain unresolved.

## 11. Session augmentation and source precedence

Raw source observations remain independent. Session APIs consume compact evidence projections
rather than hydrating all live frames into `DetailedSession` or list endpoints.

Select sources per channel and covered interval, using declared quality/freshness rules:

- XML supplies official results and the existing canonical lap classification.
- DuckDB supplies available native recorded telemetry.
- Replay supplies trajectory, traffic and replay-specific evidence.
- Live supplies additional measurements, condition observations and pit/forecast context.

There is no universal "live wins" precedence. A valid DuckDB fuel trace may outrank sparse live reads;
a live-only measured channel can fill a genuinely unsupported channel. Preserve conflicts and the
chosen source, normalization, alignment and derivation in the projection's provenance.

Do not double-count the same physical lap because live, replay and DuckDB observed it. Never replace
missing values with zeros or smooth away a real refuelling/impact transition.

Any use of live rain to change historical lap conditions must enter `classifySessionLaps` and the
canonical annotation path. Do not add a second classifier in views or learning code. Rule changes
require the appropriate parser/projection version and rebuild from retained facts, including sessions
whose XML is gone. Preserve canonical start/in/out/partial lap rules and clean-lap-only pace metrics.

Expose compact source availability, coverage, unresolved status and provenance for inspection.
Invalidate only affected session/lap projections through existing revision mechanisms.

## 12. Learning dataset and deterministic calibration

Produce one example per physical lap, stint or stop, with:

- Session/driver/lap ordinals, stint/stop identity and supporting source/segment/chunk references.
- Canonical layout and car, participant ownership, game/content versions and relevant settings.
- Compound, conditions, fuel load, tyre age, traffic, caution and damage context when supported.
- Coverage, freshness, alignment uncertainty, sample count and exclusion reasons.
- Features actually available at prediction time and the later independently observed outcome.
- Prediction/model version, evidence projection version and training-data lineage.

Use canonical clean-lap eligibility for pace/consumption targets, with additional target-specific
exclusions for pits, cautions, refuelling, gaps and unresolved identity. Pit-stop models use valid stop
intervals rather than incorrectly requiring stops to be clean flying laps.

Candidate learning order:

1. Persistent compatible fuel/VE usage profiles and measured forecast bias.
2. Finish-resource and pit-window evaluation, separating consumption error from race-horizon error.
3. Actual pit-lane/stationary/service outcomes against estimates and selections.
4. Stint-aware tyre/pace models accounting for fuel, traffic, weather and damage where measured.
5. Weather-change forecast evaluation against observed change intervals.

Compare the existing last-three-lap estimator with deterministic alternatives such as recency weighting
and bounded bias correction. Choose parameters from held-out evidence, not intuition alone. Do not
learn labels from the app's own predictions or treat game estimates as measured outcomes.

Evaluate chronologically with whole sessions held out, preventing adjacent laps/source duplicates
from leaking between training and validation. Report sample counts, signed bias, absolute/tail errors,
under-fuelling or missed-stop outcomes, and uncertainty coverage by compatible cohort. Use explicit
fallbacks when evidence is sparse or a new XML patch/context is incompatible.

Promotion requires documented improvement against the current baseline without unacceptable safety
margin regressions, versioned parameters, bounded correction and a rollback path. Confidence/sample
count/source-age readouts should reflect validated evidence, not a decorative confidence score.

## 13. Delivery phases and acceptance gates

| Phase | Deliverable | Acceptance gate |
|---|---|---|
| 0. Capability review | Review exact channel inventory, source coverage, evidence, shapes/cadences and XML patch inheritance | User has reviewed chosen channels before implementation; unknowns documented; no guessed patch or unsupported channel claims |
| 1. Contracts | Canonical capture/segment/channel/version/quality/link contracts and schema proposal | Concrete examples cover partial capture, multiple channels and session resets |
| 2. Durable capture | Independent recording lifecycle, bounded storage, recovery and diagnostics | Dashboard closure does not stop recording; replay exclusion and interruption recovery verified |
| 3. Reconciliation | Versioned session/participant/lap attachments and incremental ownership repair | Ambiguous matches stay pending; restart/layout/driver regressions pass; XML reparses preserve links |
| 4. Augmentation | Compact resource, tyre, weather, damage and stop evidence with provenance | Source precedence, gaps, canonical classification and projection invalidation verified |
| 5. Dataset | Deduplicated examples and chronological baseline evaluation | Reproducible cohort/lineage and leakage checks; no automatic calibration yet |
| 6. Calibration | Validated compatible history, correction and confidence/fallback behavior | Held-out improvement, bounded behavior, versioning and rollback demonstrated |

The first end-to-end milestone is phases 0-4: a trustworthy session-linked live evidence layer covering
the verified useful channels missing from telemetry/replay. Unverified channels remain explicitly pending;
advanced learning models are not prerequisites for this evidence milestone.

## 14. Verification and repository integration

Add focused tests mirroring source locations for capture stores/recovery, decoding/provenance,
reconciliation, alignment, source selection, projections and learning eligibility. Required scenarios:

- Dashboard absent/closed; multiple viewers; slow SSE client; server restart during a lap.
- Replay entered from a session monitor; replay exit; safe REST timeouts/backoff unchanged.
- Pauses, late starts, clock resets, missing crossings, stale REST responses and long gaps.
- Same facility/different layouts, back-to-back attempts, reused filenames, exact driver ambiguity/swaps.
- Several live segments and DuckDB files covering one session, overlapping channels and duplicates.
- Delayed/missing/deleted XML or replay; reparse and rule-version repair without loss of attachments.
- Unknown XML patches, patch inheritance after verified matching and invalidation after relinking/reparse;
  varying channel availability, unit/sign/four-wheel normalization.
- Refuel, tyre replacement, caution, damage, wet/dry change and incomplete stop outcomes.
- Immutable pre-outcome forecasts, chronological session holdouts and training-data retention.
- Interrupted writes, disk-full, recovery, idempotent re-ingestion and bounded memory.
- Typed representation round trips, state-change reconstruction, timestamp/validity preservation and
  independently readable chunks; any precision reduction has explicit domain error bounds.
- Deferred compression pauses for a new session, survives interruption, verifies before replacement,
  preserves random window reads and checks temporary replacement space without automatic data eviction.
- Automatic capture with no dashboard; complementary channel selection against actual source capabilities.
- No automatic age/size deletion of completed, partial or unmatched recordings; manual cleanup preserves
  compact evidence/manifests and removed raw inputs are marked unavailable.

For implementation, run `npm test` and `npm run build` with zero warnings/errors. Run coverage where
required without lowering thresholds. For API performance changes, run `npm run benchmark:endpoints`
before and after on a fixed cohort; add capture overhead, storage growth, recovery and lap-read
measurements. Live-game safety/performance checks need separate recorded evidence.
Compare recording off/on on the same representative driving workload: game frame-time median/p95/p99
and stutter counts, reader/writer CPU and memory, allocations, queue depth, dropped samples, disk
bandwidth and write latency. Establish numeric overhead limits from the measured baseline before
acceptance; a lower average file size is insufficient if recording causes frame-time spikes. Measure
post-session compression time, peak temporary space, CPU/I/O and interruption/resume behavior separately.

Keep new contracts in `shared/types/`, deterministic algorithms in focused `shared/domain/` modules,
and stores in semantic `server/core/` subdirectories. Respect file/directory limits and direct imports.
Keep domain rewrites out of schema initialization; use versioned reconciliation/projection rebuilds.

Update `docs/CODE_MAP.md` only as behavior ships, and update `docs/TELEMETRY_FORMAT.md`,
`docs/XML_FORMAT.md` and relevant live-source documentation when their contracts actually change.
This plan's index entry is a proposal, not evidence that live ingestion is implemented.

## 15. Open decisions before implementation

1. Which content/setup identifiers are available and useful? Game-patch provenance is settled:
   use XML `GameVersion` through a verified session attachment; exact build discovery is not required.
2. What driver/vehicle identity evidence is available during swaps and reconnects?
3. Which verified useful channels are missing from telemetry/replay, and what cadence preserves their
   useful fidelity with lightweight writes? Which small overlaps are needed for integrity?
4. Which chunk encoding/durability approach meets measured overhead and recovery requirements?
5. What measured offsets/tolerances validate live source timestamps against the existing DuckDB/replay
   game-time and lap-relative convention, including restarted or adjacent session attempts?
6. Which chunk sizing, storage reporting and manual-cleanup behavior preserve lineage, recovery and
   explicit coverage loss without an automatic retention cap?
7. Which compatibility rules and held-out performance gates allow learned profiles across XML patches?

These are engineering discovery tasks; this analysis does not claim their answers are established.

## Source references

- [Code map](../CODE_MAP.md), [telemetry format](../TELEMETRY_FORMAT.md),
  [XML format](../XML_FORMAT.md), [VCR format](../VCR_FORMAT.md).
- [Live dashboard plan](LIVE_RACE_DASHBOARD.md) and [live sources](LIVE_DATA_SOURCES.md).
- [XML sync](../../server/core/dbSessionSync.ts), [parser](../../server/sessions/parser.ts),
  [session row fields](../../server/core/sessionRows/specs.ts).
- [DuckDB catalog](../../server/telemetry/telemetryCatalog.ts),
  [ownership](../../server/telemetry/telemetryLinks.ts),
  [metadata contracts](../../server/telemetry/telemetryMatcher.ts),
  [fusion](../../server/telemetry/telemetryFusion.ts).
- [Replay matching](../../server/sessions/replayMatching.ts),
  [canonical classification](../../server/sessions/sessionLapClassification.ts).
- [Live service](../../server/live/liveService.ts), [reader](../../server/live/liveReader.ts),
  [layout](../../server/live/rf2Layout.ts), [decoder](../../server/live/rf2Decode.ts).
- [Live identity](../../shared/domain/live/liveIdentity.ts),
  [audit tracker](../../shared/domain/live/liveAudit.ts),
  [audit contracts](../../shared/types/liveAudit.ts),
  [audit store](../../server/core/live/dbLiveAuditStore.ts).
