import Database from 'better-sqlite3';
import { serialize, deserialize } from 'node:v8';
import type { RawTrajectoryPoint } from './replayLapBuilder.js';
import { decodeReplayPose, type ReplayPoseState } from './replayPose.js';

const CHUNK_SAMPLES = 4096;
// Clock + state reference + event type + original pose payload. No decoded float/object staging.
const RECORD_BYTES = 8 + 4 + 1 + 65;

interface DriverBuffer { records: Buffer; length: number; states: ReplayPoseState[] }
interface SampleChunk { records: Buffer; states: ReplayPoseState[] }

function sameState(left: ReplayPoseState, right: ReplayPoseState): boolean {
  return left.wheelSpeeds === right.wheelSpeeds && left.brakeTemps === right.brakeTemps
    && left.virtualEnergy === right.virtualEnergy && left.rainIntensity === right.rainIntensity
    && left.ambientTemp === right.ambientTemp && left.tireCompoundIndices === right.tireCompoundIndices;
}

/** Routes pose packets once to bounded temporary chunks; only the selected driver becomes objects. */
export class ReplayDriverSamples {
  private readonly db = new Database(':memory:');
  private readonly buffers = new Map<number, DriverBuffer>();
  private readonly insert;

  public constructor() {
    // Keep staging in a genuine TEMP database: SQLite opens spill files DELETEONCLOSE
    // (Windows FILE_FLAG_DELETE_ON_CLOSE / Unix unlink), including when the process is killed.
    // A named staging database would require a separate crash-recovery cleanup policy.
    this.db.pragma('temp_store = FILE');
    this.db.exec('CREATE TEMP TABLE samples (id INTEGER PRIMARY KEY, driver_slot INTEGER, data BLOB)');
    this.insert = this.db.prepare('INSERT INTO samples (driver_slot, data) VALUES (?, ?)');
  }

  public append(slot: number, sTime: number, eventType: number, payload: Buffer, offset: number, state: ReplayPoseState): void {
    let buffer = this.buffers.get(slot);
    if (!buffer) {
      buffer = { records: Buffer.allocUnsafe(CHUNK_SAMPLES * RECORD_BYTES), length: 0, states: [] };
      this.buffers.set(slot, buffer);
    }
    const previous = buffer.states[buffer.states.length - 1];
    if (!previous || !sameState(previous, state)) buffer.states.push(state);
    const position = buffer.length * RECORD_BYTES;
    buffer.records.writeDoubleLE(sTime, position);
    buffer.records.writeUInt32LE(buffer.states.length - 1, position + 8);
    buffer.records[position + 12] = eventType;
    payload.copy(buffer.records, position + 13, offset, offset + 65);
    buffer.length++;
    if (buffer.length >= CHUNK_SAMPLES) this.save(slot, buffer);
  }

  private save(slot: number, buffer: DriverBuffer): void {
    if (!buffer.length) return;
    this.insert.run(slot, serialize({ records: buffer.records.subarray(0, buffer.length * RECORD_BYTES), states: buffer.states }));
    buffer.length = 0;
    buffer.states = [];
  }

  public flush(): void {
    this.db.transaction(() => { for (const [slot, buffer] of this.buffers) this.save(slot, buffer); })();
  }

  public get allocatedBytes(): number {
    return (this.db.pragma('temp.page_count', { simple: true }) as number)
      * (this.db.pragma('temp.page_size', { simple: true }) as number);
  }

  public read(slot: number | undefined): RawTrajectoryPoint[] {
    const ids = this.db.prepare('SELECT id FROM samples WHERE driver_slot = ? ORDER BY id')
      .all(slot ?? -1) as Array<{ id: number }>;
    const select = this.db.prepare('SELECT data FROM samples WHERE id = ?');
    const remove = this.db.prepare('DELETE FROM samples WHERE id = ?');
    const result: RawTrajectoryPoint[] = [];
    for (const { id } of ids) {
      const row = select.get(id) as { data: Buffer };
      const chunk = deserialize(row.data) as SampleChunk;
      for (let position = 0; position < chunk.records.length; position += RECORD_BYTES) {
        const point = decodeReplayPose(chunk.records, position + 13, chunk.records.readDoubleLE(position),
          chunk.records[position + 12], chunk.states[chunk.records.readUInt32LE(position + 8)]);
        if (point) result.push(point);
      }
      remove.run(id);
    }
    this.buffers.delete(slot ?? -1);
    return result;
  }

  public close(): void {
    this.buffers.clear();
    this.db.close();
  }
}
