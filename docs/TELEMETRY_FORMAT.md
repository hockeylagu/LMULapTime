# LMU Telemetry Format

## Scope

This document describes the official telemetry database produced by Le Mans Ultimate (LMU). LMU's built-in telemetry exporter writes a DuckDB database containing one table per channel plus catalog tables.

The verified telemetry directory is:

```text
C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry
```

It contains a session database such as `Bahrain International Circuit_P_2026-09-13T20_33_32Z.duckdb` and a telemetry channel configuration file, `config.json`.

## Official DuckDB data flow

```text
LMU
  -> UserData\Telemetry\<session>.duckdb
  -> DuckDB client or application importer
```

## DuckDB ingestion contract

The inspected capture was opened with DuckDB v1.4.4. It contained 101 tables:

- 58 channel tables listed by `channelsList`.
- 40 event definitions listed by `eventsList`.
- `metadata`, `channelsList`, and `eventsList` catalog tables.

The database uses one table per channel. Channel names are human-readable and include spaces, so always quote identifiers. The common table shapes are:

| Channel kind | Columns | Example tables | Meaning |
| --- | --- | --- | --- |
| Continuous scalar | `value FLOAT` | `Engine RPM`, `GPS Time`, `Ground Speed` | Samples are ordered by insertion and use the configured channel frequency; there is no per-row timestamp column. |
| Continuous four-wheel | `value1`..`value4 FLOAT` | `Susp Pos`, `TyresPressure`, `Wheel Speed` | Values are ordered front-left, front-right, rear-left, rear-right. |
| Timestamped scalar/event | `ts DOUBLE`, `value` | `Gear`, `Lap`, `ABS`, `Current Sector` | `ts` is elapsed session time in seconds. These rows represent changes/events and are sparse. |
| Timestamped four-wheel event | `ts DOUBLE`, `value1`..`value4` | `WheelsDetached`, `TyresCompound` | Timestamped per-wheel state or event values. |
| Catalog | `metadata`, `channelsList`, `eventsList` | See below | Session metadata and channel/event declarations. |

Observed catalog schemas:

```text
metadata(key VARCHAR NOT NULL, value VARCHAR)
channelsList(channelName VARCHAR NOT NULL, frequency INTEGER, unit VARCHAR)
eventsList(eventName VARCHAR NOT NULL, unit VARCHAR)
```

`config.json` describes enabled channels and requested frequencies. `channelsList` is the authoritative list for a particular database, because it reflects what was actually captured. The configuration observed beside the sample database includes channels such as `GPS Time`, `Engine RPM`, `Throttle Pos`, `Brake Pos`, `TyresPressure`, and `Wheel Speed`, with frequencies from 1 Hz to 100 Hz.

Read the catalog before reading channel tables:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'main'
ORDER BY table_name, ordinal_position;

SELECT * FROM metadata ORDER BY key;
SELECT * FROM channelsList ORDER BY channelName;
SELECT * FROM eventsList ORDER BY eventName;
```

Do not infer a DuckDB schema from another telemetry schema. Record the database path, DuckDB version, table list, column types, timestamp units, coordinate system, and configured frequencies before implementing ingestion. The current sample has no foreign keys or common sample ID visible in the channel tables.

For continuous channels without `ts`, use `GPS Time` as the master 100 Hz timeline when present. Lower-frequency channels are aligned by sample order and their declared frequency; do not manufacture a timestamp by multiplying a row number until the channel frequency and session start are known. Timestamped tables should be joined by nearest `ts` at the required tolerance.

If telemetry is normalized into the application's cache, the recommended logical model is:

- `sessions`: one row per recording/session and source metadata.
- `telemetry_samples`: one row per channel and sample index or timestamp.
- `wheel_samples`: four values expanded from a `value1`..`value4` row, keyed by channel and sample.

Use a stable `session_id` plus `(channel_name, sample_index)` for continuous rows and `(channel_name, ts)` for timestamped rows. Keep raw source columns and the original DuckDB path alongside derived metrics so parsing changes can be replayed without data loss.

## Sign conventions (ISO 8855)

Normalized vehicle dynamics follow ISO 8855:2011 vehicle axes (x forward, y left, z up), and ASAM OpenDRIVE's
`t` (positive left of the reference line, the same sense as ISO 8855 y) for the offset from the track
centerline. Views put the positive side up on charts and label it left.

Reference: [ISO 8855:2011](https://www.iso.org/standard/51180.html), clauses 2.3, 2.8 and 2.10
(right-handed axes, earth-fixed axes and vehicle axes).

### Map and native coordinates

Positions `x`, `y`, `z` and orientations `rotX`, `rotY`, `rotZ` retain the **native LMU frame**:
`x/z` are horizontal metres and `y` is elevation. They are not ISO vehicle-axis components.
An ISO earth-fixed representation can be chosen as `(X_E, Y_E, Z_E) = (z, -x, y)`;
the horizontal bearing and origin are arbitrary. Detailed track packages remain in native LMU
coordinates so replays, timing gates, boundaries and surface polygons share the same frame.

The SVG map draws native `x` right and `z` up (screen y is inverted); native
`atan2(dx, dz)` therefore increases clockwise. ISO yaw rate negates its derivative. A native
forward tangent `(tx, tz)` has left normal `(-tz, tx)`, used for positive centerline offset.
`rotY = 0` is a valid body orientation, not a missing-data sentinel.

The car's map arrow shows **inertial load transfer**, opposite the acceleration vector: left-turn
acceleration moves load right, and braking moves load forward. Its numeric tooltip uses ISO
acceleration signs. Screen coordinates are display coordinates, not vehicle axes.

### Channel signs

| Field | Positive | Source and conversion |
| --- | --- | --- |
| `accelLonG` | Accelerating (braking is negative) | DuckDB `G Force Lat` negated; replays: computed from speed |
| `accelLatG` | Left turn (a_y toward the car's left) | DuckDB `G Force Long` as is; replays: `v · r / g` |
| `yawRateDeg` | Turning left (counter-clockwise seen from above) | Computed: minus the rate of LMU's heading |
| `slipAngleDeg` | Velocity left of the nose (nose right of travel, a right-hander at speed) | Computed: nose heading minus velocity heading |
| `steerYaw` | Steering left | VCR wheel position and DuckDB `Steering Pos` negated at decode |
| `lateralOffsetM` | Left of the centerline | Track projection onto the left-hand normal |
| `understeerDeg` | Understeer (oversteer negative) | Not an axis; independent of turn direction |

Replay acceleration derived from speed and yaw assumes approximately planar motion and small
sideslip. When orientation is absent, the sideslip fallback (`-0.85 degrees/G`) is a heuristic,
not a measured ISO beta; beta's sign cannot generally be inferred from turn direction alone.
These conventions establish coordinate and sign consistency, not full ISO certification of
every estimated vehicle-dynamics quantity.

LMU's own data is right-positive for steering and heading, and its DuckDB G-force channel names do
not match their content:

| LMU source | Holds | Mapping |
| --- | --- | --- |
| DuckDB `G Force Long` | Lateral G, positive in a left turn | `accelLatG = value` (`normalizeDuckDbGForces`) |
| DuckDB `G Force Lat` | Longitudinal G, positive under braking | `accelLonG = -value` |
| DuckDB `Steering Pos` (%) | Steering, positive to the right | `steerYaw = -value / 100` |
| VCR `steer10` | Steering wheel, positive to the right | `steerYaw = (512 - steer10) / 512` |
| Heading `atan2(dx, dz)`, `rotY` | Grows clockwise seen from above (turning right) | Yaw rate negated |

Evidence (2026-10-05):

- **GPS ground truth.** The 10 Hz `GPS Latitude`/`GPS Longitude` track is synthetic but not mirrored:
  its heading winds +360° per lap on clockwise Bahrain and Monza. Its right-turn rate correlates with
  `G Force Long` at r = −0.76 (Bahrain Q), −0.76 (Monza Q) and −0.80 (Algarve Q), and with
  `Steering Pos` at r = +0.59 (Bahrain) and +0.65 (Monza). `G Force Lat` does not correlate with it
  (|r| < 0.07).
- **LMU heading.** In LMU local x/z, `atan2(dx, dz)` grows through right turns: the plugin centerlines
  wind +360° on clockwise circuits (Bahrain, Monza, Spa) and −360° on counter-clockwise ones (COTA,
  Interlagos, Imola). `rotY` turns the same way (r = +0.93 against the path's right-turn rate,
  Bahrain Q1 13).
- **VCR steering.** Replay `steer10` is right-positive: r = +0.95 against the path's right-turn rate for
  three AI cars of the same Bahrain replay.

Stored data: replay trajectory blobs and DuckDB lap-cache rows written since the conversion carry
`signConvention: 'iso8855'`. Rows without it hold right-positive steering and are flipped on read
(`toIso8855Steering`, `replayTrajectoryCodec.ts`), never rewritten, so deleted replays keep their only
copy and no replay needs decoding again. Lateral offsets are not stored: they are reprojected whenever
a trajectory is served.

## Versioning and provenance

The database schema is tied to the LMU telemetry exporter and may change with a game update. Record the LMU build, database filename, DuckDB version, `metadata` rows, catalog tables, and `config.json` beside imported data. Re-run the catalog queries after an update rather than assuming every channel has the same columns or timestamp behavior.

References:

- [DuckDB documentation](https://duckdb.org/docs/)
- [DuckDB information schema](https://duckdb.org/docs/stable/sql/meta/information_schema)
- [LMU telemetry configuration](../../Program%20Files%20(x86)%5CSteam%5Csteamapps%5Ccommon%5CLe%20Mans%20Ultimate%5CUserData%5CTelemetry%5Cconfig.json)
