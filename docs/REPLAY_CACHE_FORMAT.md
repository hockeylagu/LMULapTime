# App replay cache binary lap format

Current written contract, reviewed against the codec and its tests on 2026-10-25. This is the
app's SQLite trajectory blob encoding, not the game's [VCR stream](VCR_FORMAT.md).
No historical migration, benchmark or private recording was rerun for this review.

## Ownership and versions

`server/core/replay/lapColumnsCodec.ts` defines `encodeLapColumns` and `decodeLapColumns`.
`replayTrajectoryCodec.ts` converts trajectories to/from the columnar lap object;
`server/traffic/lapSamples.ts` requests selected columns. The stored blob is
`replay_trajectories.trajectory_br`. SQLite row ownership and worker ingestion are described in
[CODE_MAP](CODE_MAP.md).

Encoding version **1** is inside each blob. The row's `parser_version` identifies decoder semantics,
not the binary encoding. The reader rejects missing magic and unknown encoding versions; it has
no legacy JSON decoding branch. The 2026-10-22 offline rewrite is completed; its execution checklist
is not a current recovery procedure and local backup availability is not established here.
Future compatibility changes need a documented supported migration/rebuild path that
preserves retained rows whose original VCR files have been deleted.

## Container

The entire uncompressed payload is compressed with Brotli, quality 9 on write.

| Uncompressed offset | Representation | Meaning |
|---|---|---|
| 0–3 | ASCII `LMTB` | Magic |
| 4 | Unsigned byte | Encoding version, currently 1 |
| 5–8 | UInt32 little endian | UTF-8 header length in bytes |
| 9 onward | UTF-8 JSON, then binary parts | Header followed by columns in descriptor order |

Header shape: `{lap, columns: [{key, column}]}`. `lap` contains the stored object excluding
`columns`, including `pointsLength`, metadata and constant channels. A column descriptor records
its kind and ordered part byte lengths; numeric descriptors also carry nullability and scaled
descriptors carry decimal count. Tuple descriptors contain their four child descriptors.

## Columns and exactness

- `scaled`: numeric values exactly representable with 0–4 decimal places; scaled integers have
  absolute value below `2^30`, are delta encoded as Int32, and stored as four byte planes.
- `f32` / `f64`: numeric arrays, float32 only when every value is exactly representable there.
- `bool`: bytes 0 = false, 1 = true, 2 = null.
- `tuple4`: four numeric subcolumns and, when needed, an outer null mask; wheel arrays retain
  FL/FR/RL/RR order from the trajectory contract.
- `json`: UTF-8 JSON fallback for columns not exactly handled by the specialized encodings.

Nullable numeric/tuple columns use a byte per sample with a nonzero byte marking null. Numeric
payload placeholders do not replace unavailable values with physical zero. Typed-array payloads
use host byte order (little endian on the current Windows/x64 environment); the format has no
payload-endianness marker. Portability to a different host order is not established by this review.

Each specialized candidate is decoded and compared with `Object.is` (including tuple items),
then widened or replaced with JSON on mismatch. No new rounding is introduced by the encoding;
source/parser precision is separate. Empty laps have zero points and may have zero columns.
Metadata and constants remain JSON, so the numeric exactness checks apply to encoded columns.

Selected-column reads still decompress the entire blob and parse the header. They skip decoding
unrequested column parts; this is not independently compressed random access. Lap-edge reads
select the needed samples through `replayTrajectoryCodec.ts`.

## Stored semantics and verification

Rows store the canonical served garage state, ISO 8855 steering convention, Virtual Energy and
calibrated ambient representation. The historical rewrite applied former read-time fixes once;
the current reader does not reapply them based on parser age. A semantic change must describe how
retained rows are upgraded rather than silently introducing competing representations.

`test/server/core/replay/lapColumnsCodec.test.ts` covers codec behavior; trajectory and traffic
tests cover consumers. The [rejected-candidate summary](plans/proposed/REPLAY_STORAGE_DESIGN.md#prior-results) explains
why the tested plain Float64/prepared-view candidates were rejected; it is not the current codec.
Prepared views and channel groups remain [proposals](plans/proposed/REPLAY_STORAGE_DESIGN.md).
