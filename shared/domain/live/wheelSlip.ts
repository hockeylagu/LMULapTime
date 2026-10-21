import type { LiveEvidenceChannel, WheelPosition, WheelSlipEvent, WheelSlipRatios } from '../../types/liveEvidence.js';

export const WHEEL_POSITIONS: readonly WheelPosition[] = ['fl', 'fr', 'rl', 'rr'];
/**
 * ABS holds GT3 front slip near 6–9 % (COTA race: native ABS flags against live patch slip, p90 8.7 %,
 * p99 10.7 %), so 15 % is beyond what ABS/TC allow. Not yet checked on a car without ABS.
 */
export const WHEEL_SLIP_EVENT_RATIO = 0.15;
/** Five consecutive 100 Hz samples: single-sample kerb spikes are not events. */
export const WHEEL_SLIP_MIN_EVENT_SECONDS = 0.04;
/** Same-wheel spans this close are one event (ABS/TC cycling around the threshold). */
const MERGE_GAP_SECONDS = 0.05;
/** Matches the capture gap rule: no event spans missing samples. */
const MAX_SAMPLE_GAP_SECONDS = 0.1;
/** The ratio is undefined for an airborne (zero ground velocity), slow or reversing wheel. */
const MIN_GROUND_SPEED_MPS = 5;

export interface WheelSlipChannelIndexes { patch: number; ground: number }

/** Null unless every wheel has both longitudinal channels (version-1 recordings have none). */
export function wheelSlipChannelIndexes(channels: readonly LiveEvidenceChannel[]): WheelSlipChannelIndexes[] | null {
  const indexOf = (name: string) => channels.findIndex(channel => channel.name === name
    && channel.unit === 'm/s' && channel.frame === 'iso8855-wheel');
  const indexes = WHEEL_POSITIONS.map(wheel => ({
    patch: indexOf(`${wheel}_patch_longitudinal_mps`), ground: indexOf(`${wheel}_ground_longitudinal_mps`),
  }));
  return indexes.every(index => index.patch >= 0 && index.ground >= 0) ? indexes : null;
}

/**
 * SAE sign: positive when the tyre turns faster than the road (wheelspin), negative when slower
 * (braking, lockup). Forward-positive patch velocity is the tyre surface sliding forward over the road.
 */
export function wheelSlipRatios(values: ReadonlyArray<number | null>, indexes: readonly WheelSlipChannelIndexes[]): WheelSlipRatios {
  const ratio = ({ patch, ground }: WheelSlipChannelIndexes): number | null => {
    const patchVelocity = values[patch];
    const groundVelocity = values[ground];
    if (typeof patchVelocity !== 'number' || !Number.isFinite(patchVelocity)
      || typeof groundVelocity !== 'number' || !Number.isFinite(groundVelocity) || groundVelocity < MIN_GROUND_SPEED_MPS) return null;
    return -patchVelocity / groundVelocity;
  };
  return [ratio(indexes[0]), ratio(indexes[1]), ratio(indexes[2]), ratio(indexes[3])];
}

/** Lockup and wheelspin spans per wheel, ordered by start time. Samples must be in lap-time order. */
export function detectWheelSlipEvents(samples: ReadonlyArray<{ lapSeconds: number; ratios: WheelSlipRatios }>): WheelSlipEvent[] {
  const events: WheelSlipEvent[] = [];
  WHEEL_POSITIONS.forEach((wheel, wheelIndex) => {
    for (const kind of ['lockup', 'wheelspin'] as const) {
      const sign = kind === 'lockup' ? -1 : 1;
      const spans: WheelSlipEvent[] = [];
      let span: WheelSlipEvent | null = null;
      // Only a measured dip below the threshold may be merged across, never a missing or unavailable sample.
      let mergeable = false;
      let previousSeconds = -Infinity;
      for (const sample of samples) {
        const ratio = sample.ratios[wheelIndex];
        if (sample.lapSeconds - previousSeconds > MAX_SAMPLE_GAP_SECONDS || ratio === null) { span = null; mergeable = false; }
        previousSeconds = sample.lapSeconds;
        if (ratio === null) continue;
        if (ratio * sign < WHEEL_SLIP_EVENT_RATIO) { span = null; continue; }
        if (!span) {
          const last = spans[spans.length - 1];
          span = mergeable && last && sample.lapSeconds - last.endLapSeconds <= MERGE_GAP_SECONDS
            ? last : { kind, wheel, startLapSeconds: sample.lapSeconds, endLapSeconds: sample.lapSeconds, peakSlipRatio: ratio };
          if (span !== last) spans.push(span);
          mergeable = true;
        }
        span.endLapSeconds = sample.lapSeconds;
        if (ratio * sign > span.peakSlipRatio * sign) span.peakSlipRatio = ratio;
      }
      events.push(...spans.filter(item => item.endLapSeconds - item.startLapSeconds >= WHEEL_SLIP_MIN_EVENT_SECONDS - 1e-9));
    }
  });
  return events.sort((a, b) => a.startLapSeconds - b.startLapSeconds || WHEEL_POSITIONS.indexOf(a.wheel) - WHEEL_POSITIONS.indexOf(b.wheel));
}
