import { parentPort } from 'node:worker_threads';
import { LiveReader } from '../../../server/live/liveReader.js';
import { SCORING, SCORING_INFO, SCORING_MAPPING_NAME, TELEMETRY, VEHICLE_TELEMETRY } from '../../../server/live/rf2Layout.js';
import { scoringBuffer, source, telemetryBuffer } from '../../../test/server/live/rf2Fixtures.js';

// Synthetic producer, real decoder/reader and real worker boundary. No LMU REST calls or Windows mappings.
const scoring = scoringBuffer(1, Array.from({ length: 64 }, (_, i) => ({
  id: i + 1, isPlayer: i === 3, place: i + 1, totalLaps: 7,
  name: 'Ferrari 296 GT3', className: 'GT3',
  doubles: { lapStartET: 100, timeIntoLap: 20, estimatedLapTime: 100, bestLapTime: 100, lastLapTime: 100 },
})));
const telemetry = telemetryBuffer(1, [{ id: 4, et: Date.now() / 1000, throttle: 0.5, brake: 0, tyreKelvin: 350 }]);
const start = Date.now();
let version = 1;
let posts = 0;
let lastScoringAt = start;
const reader = new LiveReader({
  openMapping: name => {
    const buffer = name === SCORING_MAPPING_NAME ? scoring : telemetry;
    return { ...source(() => buffer), size: buffer.length, close: () => {} };
  },
  probeGame: async () => 'session',
  post: message => { posts++; parentPort?.postMessage({ ...message, benchmarkPostedAt: Date.now() }); },
});
const producer = setInterval(() => {
  version++;
  const now = Date.now();
  telemetry.writeUInt32LE(version, TELEMETRY.versionBegin);
  telemetry.writeUInt32LE(version, TELEMETRY.versionEnd);
  const base = TELEMETRY.vehicles;
  const at = VEHICLE_TELEMETRY.offsets;
  telemetry.writeDoubleLE(now / 1000, base + at.elapsedTime);
  telemetry.writeDoubleLE((1 + Math.sin(now / 500)) / 2, base + at.unfilteredThrottle);
  telemetry.writeDoubleLE((1 + Math.cos(now / 750)) / 2, base + at.unfilteredBrake);
  telemetry.writeDoubleLE(60 - (now - start) / 100_000, base + at.fuel);
  telemetry.writeDoubleLE(100, base + at.fuelCapacity);
  if (now - lastScoringAt >= 200) {
    lastScoringAt = now;
    scoring.writeUInt32LE(version, SCORING.versionBegin);
    scoring.writeUInt32LE(version, SCORING.versionEnd);
    scoring.writeDoubleLE(120 + (now - start) / 1000, SCORING.info + SCORING_INFO.offsets.currentET);
  }
}, 10);
reader.start();
parentPort?.on('message', (message: unknown) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) return;
  if (message.type === 'stats') parentPort?.postMessage({ type: 'stats', posts });
  if (message.type === 'stop') { clearInterval(producer); reader.stop(); parentPort?.close(); }
});
