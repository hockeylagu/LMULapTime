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

## Versioning and provenance

The database schema is tied to the LMU telemetry exporter and may change with a game update. Record the LMU build, database filename, DuckDB version, `metadata` rows, catalog tables, and `config.json` beside imported data. Re-run the catalog queries after an update rather than assuming every channel has the same columns or timestamp behavior.

References:

- [DuckDB documentation](https://duckdb.org/docs/)
- [DuckDB information schema](https://duckdb.org/docs/stable/sql/meta/information_schema)
- [LMU telemetry configuration](../../Program%20Files%20(x86)%5CSteam%5Csteamapps%5Ccommon%5CLe%20Mans%20Ultimate%5CUserData%5CTelemetry%5Cconfig.json)
