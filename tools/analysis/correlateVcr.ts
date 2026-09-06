/**
 * Ground-truth correlation sweep for reverse-engineering undocumented VCR packet fields.
 *
 * Brute-forces every plausible byte/bitfield extraction in the 65-byte Class 0 vehicle-pose
 * packet and ranks each one against real telemetry channels captured from the rF2 shared
 * memory plugin during the SAME session, joined on elapsed time.
 *
 * Prerequisites
 *   1. Record shared memory while driving:
 *        tools/telemetry-recorder -> `record`  (see tools/telemetry-recorder/Program.cs)
 *   2. Save a replay of that same session BEFORE leaving it. Without the paired .Vcr there
 *      is nothing to correlate against.
 *
 * Usage
 *   npx tsx tools/analysis/correlateVcr.ts --vcr <file.Vcr> --telemetry <file.jsonl>
 *     --top <n>       how many candidates to list per channel (default 6)
 *     --samples <n>   max aligned samples used in the sweep (default 2500)
 *     --raw           disable the nuisance controls (see below) - for comparison only
 *
 * READING THE RESULTS - this matters more than the numbers themselves:
 *
 *   `speedKmh`, `throttle`, `brake` and `steering` are KNOWN-ANSWER CONTROLS. The sweep must
 *   rediscover them at their documented offsets, otherwise alignment or parsing is broken and
 *   every other row is meaningless.
 *
 *   `gear` is a NEGATIVE CONTROL: it lives in the event header's evType, never in the payload.
 *   Whatever r it scores is the false-positive floor. Treat any result at or below it as noise.
 *   Measured floor on the first Portimao capture: r=0.87 uncontrolled, r=0.65 controlled.
 *
 *   By default candidates and channels are residualised against speed, time and time^2. Without
 *   that, every monotonic channel (fuel down, temps up, wear up) matches any drifting counter,
 *   and everything speed-driven matches everything else speed-driven. A cluster of unrelated
 *   channels all reporting the SAME candidate is the signature of that artifact, not a find.
 *
 *   Labels alias: `bits@4>>23`, `bits@5>>15` and `bits@6>>7` are the same absolute bits, since
 *   each is read from a u32 at a different base offset. Convert to absolute bit = offset*8+shift.
 *
 *   Speed and rpm are near-inseparable while driving. To isolate a suspected rpm field, record a
 *   session sitting stationary in neutral blipping the throttle: speed stays 0 while rpm sweeps
 *   its full range. The same decoupling trick works for other confounded channels.
 */
import fs from 'fs';
import readline from 'readline';
import { parseReplayMetadata } from '../../server/replayParser.js';

const PACKET_SIZE = 65;

interface VcrPacket {
  sTime: number;
  gear: number;
  payload: Buffer;
}

interface TelSample {
  et: number;
  [key: string]: unknown;
}

function decodePacketSpeedKmh(payload: Buffer, offset: number): number | undefined {
  const b0 = payload[offset];
  const b1 = payload[offset + 1];
  const b2 = payload[offset + 2];
  const b3 = payload[offset + 3];
  const b4 = payload[offset + 4];
  if ((b0 | b1 | b2 | b3 | b4) === 0) return undefined;

  const readSigned16 = (low: number, high: number): number => {
    const value = low | (high << 8);
    return value & 0x8000 ? value - 0x10000 : value;
  };

  const high1 = b1 & 0x20 ? (b1 & 0x3f) + 192 : b1 & 0x3f;
  const velocity1 = (3.6 * readSigned16(b0, high1)) / 32;
  const low2 = (b1 >> 6) + ((b2 & 0x3f) << 2);
  const high2 = (b2 >> 6) + ((b3 & 1) << 2) + (b3 & 2 ? 248 : 0);
  const velocity2 = (3.6 * readSigned16(low2, high2)) / 20;
  const low3 = ((b3 & 0xfc) >> 2) + ((b4 & 3) << 6);
  const high3 = b4 & 0x80 ? (b4 >> 2) + 192 : b4 >> 2;
  const velocity3 = (3.6 * readSigned16(low3, high3)) / 32;
  const speed = Math.hypot(velocity1, velocity2, velocity3);
  return isFinite(speed) ? speed : undefined;
}

function readVcrPackets(filePath: string, targetSlot: number): VcrPacket[] {
  const buf = fs.readFileSync(filePath);
  if (buf.subarray(45, 49).toString('ascii') !== 'IRSR') {
    throw new Error(`Not an LMU replay (missing IRSR magic): ${filePath}`);
  }

  const frameStreamEnd = Math.min(buf.readUInt32LE(53), buf.length);
  const packets: VcrPacket[] = [];
  let sp = 57 + 4;

  while (sp + 6 <= frameStreamEnd) {
    const sTime = buf.readFloatLE(sp);
    const nEvents = buf.readUInt16LE(sp + 4);
    if (nEvents > 250 || sTime < 0 || sTime > 100000) break;

    let probe = sp + 6;
    let parseable = true;
    for (let e = 0; e < nEvents; e++) {
      if (probe + 4 > frameStreamEnd) {
        parseable = false;
        break;
      }
      probe += 4 + 1 + ((buf.readUInt32LE(probe) >>> 8) & 0x1ff);
      if (probe > frameStreamEnd) {
        parseable = false;
        break;
      }
    }
    if (!parseable) break;

    let eventSp = sp + 6;
    for (let e = 0; e < nEvents; e++) {
      const h = buf.readUInt32LE(eventSp);
      const sz = (h >>> 8) & 0x1ff;
      const drv = h & 0xff;
      const evType = (h >>> 17) & 0x3f;

      if (sz === PACKET_SIZE && evType >= 7 && evType <= 15 && drv === targetSlot) {
        packets.push({
          sTime,
          gear: evType - 8,
          payload: Buffer.from(buf.subarray(eventSp + 5, eventSp + 5 + PACKET_SIZE))
        });
      }

      eventSp += 4 + 1 + sz;
    }
    sp = eventSp;
  }

  return packets;
}

async function loadTelemetry(filePath: string): Promise<TelSample[]> {
  const out: TelSample[] = [];
  const stream = readline.createInterface({ input: fs.createReadStream(filePath) });
  for await (const line of stream) {
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.t === 'tel' && typeof o.et === 'number' && o.et > 0) {
      out.push(o as TelSample);
    }
  }
  out.sort((a, b) => a.et - b.et);
  return out;
}

function interpolate(samples: TelSample[], et: number, key: string): number | undefined {
  if (samples.length === 0 || et < samples[0].et || et > samples[samples.length - 1].et) {
    return undefined;
  }
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].et <= et) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const va = a[key] as number;
  const vb = b[key] as number;
  if (typeof va !== 'number' || typeof vb !== 'number') return undefined;
  const span = b.et - a.et;
  return span <= 0 ? va : va + ((vb - va) * (et - a.et)) / span;
}

function correlationOf(xs: number[], ys: number[]): number {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return den === 0 ? 0 : (n * sxy - sx * sy) / den;
}

/**
 * Projects out a set of nuisance regressors. Without this, every monotonic channel (fuel,
 * temps, wear) matches any drifting counter, and everything speed-driven matches everything
 * else speed-driven - which is how a field absent from the payload still scored r=0.87.
 */
class Residualizer {
  private readonly cols: Float64Array[];
  private readonly gramLu: number[][];
  private readonly pivot: number[];

  constructor(cols: Float64Array[], private readonly n: number) {
    this.cols = cols;
    const k = cols.length;
    const gram: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let a = 0; a < k; a++) {
      for (let b = a; b < k; b++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += cols[a][i] * cols[b][i];
        gram[a][b] = s;
        gram[b][a] = s;
      }
      gram[a][a] += 1e-9;
    }
    this.pivot = Array.from({ length: k }, (_, i) => i);
    this.gramLu = gram;
    for (let c = 0; c < k; c++) {
      let maxRow = c;
      for (let r = c + 1; r < k; r++) {
        if (Math.abs(gram[r][c]) > Math.abs(gram[maxRow][c])) maxRow = r;
      }
      [gram[c], gram[maxRow]] = [gram[maxRow], gram[c]];
      [this.pivot[c], this.pivot[maxRow]] = [this.pivot[maxRow], this.pivot[c]];
      for (let r = c + 1; r < k; r++) {
        const f = gram[r][c] / gram[c][c];
        gram[r][c] = f;
        for (let cc = c + 1; cc < k; cc++) gram[r][cc] -= f * gram[c][cc];
      }
    }
  }

  apply(v: Float64Array): void {
    const k = this.cols.length;
    const rhs = new Array(k).fill(0);
    for (let a = 0; a < k; a++) {
      let s = 0;
      for (let i = 0; i < this.n; i++) s += this.cols[a][i] * v[i];
      rhs[a] = s;
    }

    const y = new Array(k).fill(0);
    for (let r = 0; r < k; r++) {
      let s = rhs[this.pivot[r]];
      for (let c = 0; c < r; c++) s -= this.gramLu[r][c] * y[c];
      y[r] = s;
    }
    const beta = new Array(k).fill(0);
    for (let r = k - 1; r >= 0; r--) {
      let s = y[r];
      for (let c = r + 1; c < k; c++) s -= this.gramLu[r][c] * beta[c];
      beta[r] = s / this.gramLu[r][r];
    }

    for (let a = 0; a < k; a++) {
      const col = this.cols[a];
      const b = beta[a];
      if (b === 0) continue;
      for (let i = 0; i < this.n; i++) v[i] -= b * col[i];
    }
  }
}

/** VCR sTime and shared-memory ET are both session-elapsed but need not share an epoch. */
function estimateTimeOffset(packets: VcrPacket[], telemetry: TelSample[]): number {
  const probe = packets
    .map(p => ({ t: p.sTime, v: decodePacketSpeedKmh(p.payload, 8) }))
    .filter(p => p.v !== undefined && p.v > 5) as { t: number; v: number }[];

  const stride = Math.max(1, Math.floor(probe.length / 1500));
  const sampled = probe.filter((_, i) => i % stride === 0);

  const score = (offset: number): number => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of sampled) {
      const y = interpolate(telemetry, p.t + offset, 'speedKmh');
      if (y === undefined) continue;
      xs.push(p.v);
      ys.push(y);
    }
    return xs.length < 50 ? -1 : correlationOf(xs, ys);
  };

  let best = 0;
  let bestScore = -1;
  for (let off = -180; off <= 180; off += 0.1) {
    const s = score(off);
    if (s > bestScore) {
      bestScore = s;
      best = off;
    }
  }
  for (let off = best - 0.15; off <= best + 0.15; off += 0.002) {
    const s = score(off);
    if (s > bestScore) {
      bestScore = s;
      best = off;
    }
  }

  console.log(`  best speed correlation r=${bestScore.toFixed(4)} at offset ${best.toFixed(3)} s`);
  return best;
}

interface Candidate {
  label: string;
  read: (view: DataView, base: number, u32: Uint32Array, u32Base: number) => number;
}

function buildCandidates(): Candidate[] {
  const list: Candidate[] = [];

  for (let o = 0; o < PACKET_SIZE; o++) {
    list.push({ label: `u8  @${o}`, read: (v, b) => v.getUint8(b + o) });
    list.push({ label: `i8  @${o}`, read: (v, b) => v.getInt8(b + o) });
  }
  for (let o = 0; o + 2 <= PACKET_SIZE; o++) {
    list.push({ label: `u16 @${o}`, read: (v, b) => v.getUint16(b + o, true) });
    list.push({ label: `i16 @${o}`, read: (v, b) => v.getInt16(b + o, true) });
  }
  for (let o = 0; o + 4 <= PACKET_SIZE; o++) {
    list.push({ label: `u32 @${o}`, read: (v, b) => v.getUint32(b + o, true) });
    list.push({ label: `i32 @${o}`, read: (v, b) => v.getInt32(b + o, true) });
    list.push({ label: `f32 @${o}`, read: (v, b) => v.getFloat32(b + o, true) });
  }

  const widths = [4, 5, 6, 7, 8, 10, 12, 16];
  for (let o = 0; o + 4 <= PACKET_SIZE; o++) {
    for (let shift = 0; shift <= 24; shift++) {
      for (const w of widths) {
        if (shift + w > 32) continue;
        const mask = w === 32 ? 0xffffffff : (1 << w) - 1;
        list.push({
          label: `bits@${o}>>${shift}&${w}b`,
          read: (_v, _b, u32, u32Base) => (u32[u32Base + o] >>> shift) & mask
        });
      }
    }
  }

  return list;
}

interface Target {
  name: string;
  get: (s: TelSample) => number | undefined;
  known?: string;
}

function buildTargets(): Target[] {
  const wheel = (i: number, key: string) => (s: TelSample) => {
    const w = (s.wheels as Record<string, unknown>[] | undefined)?.[i];
    const v = w?.[key];
    return typeof v === 'number' ? v : undefined;
  };
  const num = (key: string) => (s: TelSample) => (typeof s[key] === 'number' ? (s[key] as number) : undefined);

  return [
    { name: 'speedKmh', get: num('speedKmh'), known: 'offset 8 (5-byte velocity)' },
    { name: 'throttle', get: num('thr'), known: 'byte 5' },
    { name: 'brake', get: num('brk'), known: 'byte 36 bits 0-5' },
    { name: 'steering', get: num('str'), known: 'bytes 4-5 bits 0-9' },
    { name: 'gear', get: num('gear'), known: 'event header evType (NOT in payload)' },
    { name: 'rpm', get: num('rpm') },
    { name: 'fuel', get: num('fuel') },
    { name: 'waterTempC', get: num('waterTempC') },
    { name: 'oilTempC', get: num('oilTempC') },
    { name: 'turboBoost', get: num('turboBoost') },
    { name: 'batteryCharge', get: num('batteryCharge') },
    { name: 'boostRpm', get: num('boostRpm') },
    { name: 'boostTorque', get: num('boostTorque') },
    { name: 'engineTorque', get: num('torque') },
    { name: 'rearBrakeBias', get: num('rearBrakeBias') },
    { name: 'frontDownforce', get: num('frontDownforce') },
    { name: 'brakeTemp_FL', get: wheel(0, 'brakeTempC') },
    { name: 'brakeTemp_RR', get: wheel(3, 'brakeTempC') },
    { name: 'tireWear_FL', get: wheel(0, 'wear') },
    { name: 'tirePress_FL', get: wheel(0, 'pressure') },
    { name: 'tireLoad_FL', get: wheel(0, 'load') },
    { name: 'carcassTemp_FL', get: wheel(0, 'carcassTempC') },
    { name: 'rideHeight_FL', get: wheel(0, 'rideHeight') },
    { name: 'wheelRot_FL', get: wheel(0, 'rotation') }
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
  };

  const vcrPath = opt('--vcr');
  const telPath = opt('--telemetry');
  const maxSamples = Number(opt('--samples') ?? 2500);
  const topN = Number(opt('--top') ?? 6);
  const minSpeed = opt('--minSpeed') !== undefined ? Number(opt('--minSpeed')) : undefined;
  const maxSpeed = opt('--maxSpeed') !== undefined ? Number(opt('--maxSpeed')) : undefined;

  if (!vcrPath || !telPath) {
    console.error('Usage: tsx tools/analysis/correlateVcr.ts --vcr <file.Vcr> --telemetry <file.jsonl>');
    process.exit(1);
  }

  console.log('Reading replay metadata...');
  const meta = parseReplayMetadata(vcrPath);
  const player = meta.drivers.find(d => d.isPlayer) ?? meta.drivers[0];
  if (!player || typeof player.slot !== 'number') {
    throw new Error('Could not determine the player slot from replay metadata.');
  }
  console.log(`  player '${player.name}' slot ${player.slot}, ${meta.drivers.length} drivers`);

  const packets = readVcrPackets(vcrPath, player.slot);
  console.log(`  ${packets.length} pose packets for the player`);

  const telemetry = await loadTelemetry(telPath);
  console.log(`  ${telemetry.length} telemetry samples (ET ${telemetry[0]?.et.toFixed(1)}..${telemetry[telemetry.length - 1]?.et.toFixed(1)})`);

  console.log('\nEstimating time alignment...');
  const offset = estimateTimeOffset(packets, telemetry);

  // Pair each packet with the nearest telemetry sample after applying the estimated offset.
  const pairs: { payload: Buffer; sample: TelSample }[] = [];
  for (const p of packets) {
    const et = p.sTime + offset;
    if (et < telemetry[0].et || et > telemetry[telemetry.length - 1].et) continue;
    let lo = 0;
    let hi = telemetry.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (telemetry[mid].et <= et) lo = mid;
      else hi = mid;
    }
    const nearest = Math.abs(telemetry[lo].et - et) <= Math.abs(telemetry[hi].et - et) ? telemetry[lo] : telemetry[hi];
    if (Math.abs(nearest.et - et) <= 0.015) {
      const spd = nearest.speedKmh as number;
      if (minSpeed !== undefined && !(spd >= minSpeed)) continue;
      if (maxSpeed !== undefined && !(spd <= maxSpeed)) continue;
      pairs.push({ payload: p.payload, sample: nearest });
    }
  }
  if (minSpeed !== undefined || maxSpeed !== undefined) {
    console.log(`  speed window: ${minSpeed ?? '-inf'}..${maxSpeed ?? '+inf'} km/h`);
  }
  console.log(`  ${pairs.length} aligned packet/telemetry pairs`);

  if (pairs.length < 200) {
    console.error('Too few aligned pairs - alignment probably failed.');
    process.exit(1);
  }

  const stride = Math.max(1, Math.floor(pairs.length / maxSamples));
  const used = pairs.filter((_, i) => i % stride === 0);
  const n = used.length;
  console.log(`  using ${n} samples for the sweep\n`);

  const bytes = Buffer.concat(used.map(p => p.payload));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32Stride = PACKET_SIZE - 3;
  const u32 = new Uint32Array(n * u32Stride);
  for (let i = 0; i < n; i++) {
    for (let o = 0; o < u32Stride; o++) {
      u32[i * u32Stride + o] = view.getUint32(i * PACKET_SIZE + o, true);
    }
  }

  const targets = buildTargets();

  const noControls = args.includes('--raw');
  let residualizer: Residualizer | undefined;
  if (!noControls) {
    const ones = new Float64Array(n).fill(1);
    const speed = new Float64Array(n);
    const time = new Float64Array(n);
    const time2 = new Float64Array(n);
    const t0 = used[0].sample.et;
    for (let i = 0; i < n; i++) {
      speed[i] = (used[i].sample.speedKmh as number) ?? 0;
      time[i] = used[i].sample.et - t0;
      time2[i] = time[i] * time[i];
    }

    // A near-constant regressor (e.g. speed inside a stationary window) carries no information
    // and only destabilises the solve.
    const varies = (v: Float64Array) => {
      let mean = 0;
      for (let i = 0; i < n; i++) mean += v[i];
      mean /= n;
      let ss = 0;
      for (let i = 0; i < n; i++) ss += (v[i] - mean) ** 2;
      return ss / n > 1e-6;
    };

    const cols: Float64Array[] = [ones];
    const names = ['intercept'];
    if (varies(speed)) {
      cols.push(speed);
      names.push('speed');
    }
    if (varies(time)) {
      cols.push(time, time2);
      names.push('time', 'time^2');
    }
    residualizer = new Residualizer(cols, n);
    console.log(`Controlling for: ${names.join(', ')} (use --raw to disable)\n`);
  }

  const active = targets
    .map(t => {
      const values = new Float64Array(n);
      let ok = true;
      for (let i = 0; i < n; i++) {
        const v = t.get(used[i].sample);
        if (v === undefined || !isFinite(v)) {
          ok = false;
          break;
        }
        values[i] = v;
      }
      if (!ok) return null;
      residualizer?.apply(values);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += values[i];
      const mean = sum / n;
      let ss = 0;
      for (let i = 0; i < n; i++) {
        values[i] -= mean;
        ss += values[i] * values[i];
      }
      return ss <= 1e-9 ? null : { target: t, centered: values, norm: Math.sqrt(ss) };
    })
    .filter(Boolean) as { target: Target; centered: Float64Array; norm: number }[];

  console.log(`Sweeping against ${active.length} channels...`);
  const candidates = buildCandidates();
  console.log(`  ${candidates.length} candidate extractions x ${n} samples\n`);

  const best = active.map(() => [] as { label: string; r: number }[]);
  const xs = new Float64Array(n);

  for (const cand of candidates) {
    let finite = true;
    for (let i = 0; i < n; i++) {
      const v = cand.read(view, i * PACKET_SIZE, u32, i * u32Stride);
      if (!isFinite(v) || Math.abs(v) > 1e12) {
        finite = false;
        break;
      }
      xs[i] = v;
    }
    if (!finite) continue;

    residualizer?.apply(xs);

    let sx = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sx += xs[i];
      sxx += xs[i] * xs[i];
    }
    const varX = sxx - (sx * sx) / n;
    if (varX <= 1e-9) continue;
    const normX = Math.sqrt(varX);
    const meanX = sx / n;

    for (let t = 0; t < active.length; t++) {
      const yc = active[t].centered;
      let sxy = 0;
      for (let i = 0; i < n; i++) sxy += (xs[i] - meanX) * yc[i];
      const r = sxy / (normX * active[t].norm);
      if (!isFinite(r)) continue;

      const bucket = best[t];
      if (bucket.length < topN || Math.abs(r) > Math.abs(bucket[bucket.length - 1].r)) {
        bucket.push({ label: cand.label, r });
        bucket.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
        if (bucket.length > topN) bucket.pop();
      }
    }
  }

  for (let t = 0; t < active.length; t++) {
    const { target } = active[t];
    console.log(`${target.name}${target.known ? `   [control: ${target.known}]` : ''}`);
    for (const hit of best[t]) {
      const flag = Math.abs(hit.r) > 0.9 ? ' <<<' : Math.abs(hit.r) > 0.7 ? ' <<' : '';
      console.log(`   r=${hit.r >= 0 ? ' ' : ''}${hit.r.toFixed(4)}  ${hit.label}${flag}`);
    }
    console.log();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
