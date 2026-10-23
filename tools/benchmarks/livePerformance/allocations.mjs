import { createRequire } from 'node:module';
import { constants, PerformanceObserver } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import { LiveReader } from '../../../server/live/liveReader.ts';
import { readPedalFrame, readScoringFrame } from '../../../server/live/rf2Decode.ts';
import { openMapping } from '../../../server/live/sharedMemory.ts';
import { SCORING, SCORING_MAPPING_NAME, TELEMETRY, VEHICLE_TELEMETRY, WHEEL } from '../../../server/live/rf2Layout.ts';
import { scoringBuffer, telemetryBuffer } from '../../../test/server/live/rf2Fixtures.ts';

// Isolated decoder/FFI workload: never opens LMU's mappings, REST API or application database.
// Run with: node --expose-gc --import tsx tools/benchmarks/livePerformance/allocations.mjs
const ticks = Number(process.env.LIVE_ALLOCATION_TICKS ?? 200_000);
if (!Number.isSafeInteger(ticks) || ticks < 1) throw new Error('LIVE_ALLOCATION_TICKS must be a positive integer');
if (!global.gc) throw new Error('Run this benchmark with --expose-gc');
const require = createRequire(import.meta.url);
const koffi = process.platform === 'win32' ? require('koffi') : null;
const api = koffi?.load('kernel32.dll');
const create = api?.func('void* __stdcall CreateFileMappingW(intptr_t file, void* attributes, uint32 protect, uint32 high, uint32 low, str16 name)');
const map = api?.func('void* __stdcall MapViewOfFile(void* handle, uint32 access, uint32 high, uint32 low, size_t bytes)');
const unmap = api?.func('int __stdcall UnmapViewOfFile(void* view)');
const close = api?.func('int __stdcall CloseHandle(void* handle)');
const cleanup = [];
let allocatingCopies = 0;
let allocatingCopyBytes = 0;
let reusedCopyBytes = 0;

function mapping(initial, label) {
  let writer = initial;
  let source;
  if (koffi) {
    const name = `$lmu-allocation-benchmark-${process.pid}-${label}$`;
    const handle = create(-1, null, 4, 0, initial.length, name);
    if (handle === null) throw new Error('Cannot create benchmark mapping');
    cleanup.push(() => close(handle));
    const view = map(handle, 2, 0, 0, initial.length);
    if (view === null) throw new Error('Cannot map benchmark writer');
    cleanup.push(() => unmap(view));
    writer = Buffer.from(koffi.view(view, initial.length));
    initial.copy(writer);
    source = openMapping(name, initial.length);
    if (!source) throw new Error('Cannot open benchmark reader');
    cleanup.push(() => source.close());
  } else {
    source = {
      readU32: offset => writer.readUInt32LE(offset),
      read: (offset, length) => Buffer.from(writer.subarray(offset, offset + length)),
      readInto: (offset, target, targetOffset, length) => { writer.copy(target, targetOffset, offset, offset + length); },
    };
  }
  return { writer, source: {
    readU32: source.readU32,
    read: (offset, length) => {
      allocatingCopies++; allocatingCopyBytes += length;
      return source.read(offset, length);
    },
    readInto: (offset, target, targetOffset, length) => {
      reusedCopyBytes += length;
      source.readInto(offset, target, targetOffset, length);
    },
  } };
}

let gcCount = 0;
let gcMs = 0;
let checksum = 0;
const observer = new PerformanceObserver(list => {
  for (const entry of list.getEntries()) {
    if (entry.detail.kind === constants.NODE_PERFORMANCE_GC_MINOR) { gcCount++; gcMs += entry.duration; }
  }
});

/** Warms, collects, then measures `run(ticks)` alone: elapsed time, minor GCs and mapping copies. */
async function measure(label, run, extra = () => ({})) {
  run(10_000);
  global.gc();
  await setImmediate();
  allocatingCopies = 0; allocatingCopyBytes = 0; reusedCopyBytes = 0; gcCount = 0; gcMs = 0;
  const before = extra();
  const started = performance.now();
  run(ticks);
  const elapsedMs = performance.now() - started;
  await setImmediate();
  await setImmediate();
  const after = extra();
  return { phase: label, elapsedMs, minorGcCount: gcCount, minorGcMs: gcMs, allocatingCopies, allocatingCopyBytes, reusedCopyBytes,
    ...Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - (before[key] ?? 0)])) };
}

observer.observe({ entryTypes: ['gc'] });
try {
  const scoring = mapping(scoringBuffer(1, Array.from({ length: 64 }, (_, i) => ({
    id: i + 1, isPlayer: i === 3, place: i + 1, totalLaps: 7, name: 'Ferrari 296 GT3', className: 'GT3',
  }))), 'scoring');
  const telemetry = mapping(telemetryBuffer(1, [{ id: 4, et: 100, throttle: 0.5, brake: 0, tyreKelvin: 350 }]), 'telemetry');
  for (let corner = 0; corner < 4; corner++) {
    telemetry.writer.write('RDRACEOLD,ROAD,', TELEMETRY.vehicles + VEHICLE_TELEMETRY.offsets.wheels + corner * WHEEL.size + WHEEL.offsets.terrainName, 'latin1');
  }
  let version = 1;
  /** One producer step: telemetry every tick (50 Hz), scoring every tenth (5 Hz). */
  function produce(tick) {
    version++;
    if (tick % 10 === 0) {
      scoring.writer.writeUInt32LE(version, SCORING.versionBegin);
      scoring.writer.writeUInt32LE(version, SCORING.versionEnd);
    }
    telemetry.writer.writeUInt32LE(version, TELEMETRY.versionBegin);
    telemetry.writer.writeUInt32LE(version, TELEMETRY.versionEnd);
    telemetry.writer.writeDoubleLE(version / 50, TELEMETRY.vehicles + VEHICLE_TELEMETRY.offsets.elapsedTime);
  }

  let scoringVersion = null;
  let telemetryVersion = null;
  let slot = -1;
  const decode = await measure('decode', count => {
    for (let tick = 0; tick < count; tick++) {
      produce(tick);
      const score = readScoringFrame(scoring.source, scoringVersion);
      if (score.status === 'ok') { scoringVersion = score.version; checksum += score.value.playerClassPlace; }
      const result = readPedalFrame(telemetry.source, 4, telemetryVersion, slot, null, tick % 25 === 0);
      if (result.status !== 'ok') throw new Error('Expected coherent benchmark telemetry');
      telemetryVersion = result.version; slot = result.value.slot;
      checksum += result.value.sample.throttle;
    }
  });

  // The production reader and its worker messages: each post is serialized and deserialized as postMessage
  // would (structuredClone with the same transfer list), so the transport's allocations are measured too.
  let posts = 0;
  let transferredBytes = 0;
  const reader = new LiveReader({
    openMapping: name => ({ ...(name === SCORING_MAPPING_NAME ? scoring : telemetry).source, close: () => {} }),
    probeGame: () => new Promise(() => {}),
    capture: true,
    post: message => {
      posts++;
      const transfer = message.type === 'capture' ? [message.batch.rows.buffer] : [];
      for (const buffer of transfer) transferredBytes += buffer.byteLength;
      const copy = structuredClone(message, { transfer });
      if (copy.type === 'frame') checksum += copy.pedal?.throttle ?? 0;
    },
  });
  reader.start();
  // Benchmark-only: a confirmed live session without a navigation probe (the reader's own fields).
  reader.captureConfirmed = true;
  reader.lastProbeAt = Number.POSITIVE_INFINITY;
  const transport = await measure('reader+transport', count => {
    for (let tick = 0; tick < count; tick++) {
      produce(tick);
      reader.tick();
    }
  }, () => ({ posts, transferredBytes }));
  reader.stop();
  console.log(JSON.stringify({ nativeWindowsMapping: Boolean(koffi), ticks, simulatedSeconds: ticks / 50,
    phases: [decode, transport], checksum }, null, 2));
} finally {
  observer.disconnect();
  for (const dispose of cleanup.reverse()) dispose();
}
