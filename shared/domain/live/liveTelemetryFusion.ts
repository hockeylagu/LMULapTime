import type { ReplayTrajectoryData } from '../../types/replay.js';
import type { LiveEvidenceResponse, WheelPosition } from '../../types/liveEvidence.js';
import { detectWheelSlipEvents, WHEEL_POSITIONS, wheelSlipChannelIndexes, wheelSlipRatios } from './wheelSlip.js';

/** At most one 50 Hz source interval away; explicit clocks only, never a fitted/shifted trace. */
const MAX_OFFSET_SECONDS = 0.025;
const RAD_TO_DEG = 180 / Math.PI;

export function fuseLiveTelemetry(trajectory: ReplayTrajectoryData, response: LiveEvidenceResponse): ReplayTrajectoryData {
  const unaligned = (message: string): ReplayTrajectoryData => ({ ...trajectory, liveCaptureOverlay: { state: 'unaligned', message } });
  if (response.state === 'unavailable') return { ...trajectory, liveCaptureOverlay: { state: 'unavailable', message: response.message } };
  const evidence = response.evidence;
  if (trajectory.sessionId !== response.sessionId || trajectory.driverOrdinal !== response.driverOrdinal
    || trajectory.lapOrdinal !== response.lapOrdinal || trajectory.currentLap !== evidence.lapNumber) {
    return unaligned('Live capture locator does not match this trajectory');
  }
  if (trajectory.signConvention !== 'iso8855' || evidence.signConvention !== 'iso8855') return unaligned('Signed channel conventions are not verified');
  const base = trajectory.timeReference === 'lap' ? 0
    : trajectory.timeReference === 'session' && Number.isFinite(trajectory.lapStartTimeSec) ? trajectory.lapStartTimeSec : undefined;
  if (base === undefined) return unaligned('The trajectory has no explicit lap clock');
  if (trajectory.timeReference === 'session' && Math.abs(base - evidence.startSeconds) > MAX_OFFSET_SECONDS) {
    return unaligned('Replay and live game-clock anchors do not agree within 25 ms');
  }
  const clockOrigin = trajectory.timeReference === 'session' ? evidence.startSeconds : 0;
  const lap = trajectory.laps?.find(item => item.lapNumber === evidence.lapNumber);
  const duration = lap?.validatedTimeSec ?? lap?.lapTimeSec;
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0
    || Math.abs(duration - evidence.durationSeconds) > 0.05) return unaligned('Live and trajectory lap durations do not match');
  const indexOf = (name: string, unit: string) => evidence.channels.findIndex(channel => channel.name === name
    && channel.unit === unit && channel.frame === 'iso8855-vehicle');
  const yawIndex = indexOf('yaw_rate_radps', 'rad/s');
  const forwardIndex = indexOf('velocity_forward_mps', 'm/s');
  const leftIndex = indexOf('velocity_left_mps', 'm/s');
  const samples = evidence.points;
  if (samples.some((point, index) => !Number.isFinite(point.lapSeconds)
    || index > 0 && point.lapSeconds <= samples[index - 1].lapSeconds)) return unaligned('Live sample clock is not strictly increasing');
  const wheelIndexes = wheelSlipChannelIndexes(evidence.channels);
  const sampleRatios = wheelIndexes ? samples.map(sample => wheelSlipRatios(sample.values, wheelIndexes)) : null;
  const wheelSlipEvents = sampleRatios ? detectWheelSlipEvents(samples.map((sample, index) => ({
    lapSeconds: sample.lapSeconds, ratios: sampleRatios[index] }))) : [];
  const eventWheels = (kind: 'lockup' | 'wheelspin', lapSeconds: number): WheelPosition[] => WHEEL_POSITIONS.filter(wheel =>
    wheelSlipEvents.some(event => event.kind === kind && event.wheel === wheel
      && event.startLapSeconds <= lapSeconds && lapSeconds <= event.endLapSeconds));
  let yawPoints = 0;
  let slipPoints = 0;
  let wheelSlipPoints = 0;
  let maxOffsetSeconds = 0;
  const points = trajectory.points.map(point => {
    if (!Number.isFinite(point.timeSec)) return point;
    const time = point.timeSec! - clockOrigin;
    if (time < 0 || time > evidence.durationSeconds || !samples.length) return point;
    if (time < samples[0].lapSeconds - 1e-9 || time > samples[samples.length - 1].lapSeconds + 1e-9) return point;
    let low = 0;
    let high = samples.length;
    while (low < high) { const mid = (low + high) >>> 1; if (samples[mid].lapSeconds < time) low = mid + 1; else high = mid; }
    const beforeIndex = Math.max(0, low - 1);
    const afterIndex = Math.min(samples.length - 1, low);
    const sampleIndex = Math.abs(samples[beforeIndex].lapSeconds - time) <= Math.abs(samples[afterIndex].lapSeconds - time) ? beforeIndex : afterIndex;
    const sample = samples[sampleIndex];
    const offsetSeconds = sample.lapSeconds - time;
    if (Math.abs(offsetSeconds) > MAX_OFFSET_SECONDS + 1e-9) return point;
    const yaw = sample.values[yawIndex];
    const forward = sample.values[forwardIndex];
    const left = sample.values[leftIndex];
    const hasYaw = typeof yaw === 'number' && Number.isFinite(yaw);
    // Beta is ill-conditioned at low/negative forward velocity; keep the existing estimate there.
    const hasSlip = typeof forward === 'number' && Number.isFinite(forward) && forward >= 5
      && typeof left === 'number' && Number.isFinite(left);
    const ratios = sampleRatios?.[sampleIndex];
    const hasWheelSlip = ratios !== undefined && ratios.some(ratio => ratio !== null);
    if (!hasYaw && !hasSlip && !hasWheelSlip) return point;
    if (hasYaw) yawPoints++;
    if (hasSlip) slipPoints++;
    if (hasWheelSlip) wheelSlipPoints++;
    maxOffsetSeconds = Math.max(maxOffsetSeconds, Math.abs(offsetSeconds));
    return { ...point, ...(hasYaw ? { yawRateDeg: yaw * RAD_TO_DEG } : {}),
      ...(hasSlip ? { slipAngleDeg: Math.atan2(left, forward) * RAD_TO_DEG } : {}),
      // Event membership uses the live sample's clock, the same clock the events were detected on.
      ...(hasWheelSlip ? { liveWheelSlip: { ratios, lockup: eventWheels('lockup', sample.lapSeconds),
        wheelspin: eventWheels('wheelspin', sample.lapSeconds) } } : {}),
      liveDynamics: { recordingId: evidence.recordingId, sampleIndex: sample.sampleIndex, offsetSeconds,
        yawRate: hasYaw, slipAngle: hasSlip, wheelSlip: hasWheelSlip } };
  });
  return { ...trajectory, points, liveCaptureOverlay: { state: 'applied', recordingId: evidence.recordingId,
    gameVersion: evidence.gameVersion, normalizationVersion: evidence.normalizationVersion, yawPoints, slipPoints,
    wheelSlipPoints, wheelSlipEvents, totalPoints: points.length, maxOffsetSeconds, recordingDroppedSamples: evidence.coverage.recordingDroppedSamples,
    captureGaps: evidence.coverage.gaps.length } };
}
