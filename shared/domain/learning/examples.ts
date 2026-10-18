import { LIVE_LEARNING_VERSION, type LiveLearningExample, type StoredLearningEvent } from '../../types/liveLearning.js';
import type { LiveCaptureManifest } from '../../types/liveCapture.js';

export interface LearningLap {
  driverOrdinal: number;
  lapOrdinal: number;
  lapNumber: number;
  lapSeconds: number | null;
  isClean: boolean;
  isRepresentative: boolean;
  condition: string | null;
}

function metricClose(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function buildLearningExamples(
  manifest: LiveCaptureManifest,
  matchVersion: number,
  laps: LearningLap[],
  events: StoredLearningEvent[],
): LiveLearningExample[] {
  if (!manifest.sessionId) throw new Error('Learning examples require a verified sessionId');

  const forecasts = new Map<string, StoredLearningEvent[]>();
  const outcomes = new Map<string, StoredLearningEvent[]>();
  const eventKey = (lapNumber: number, kind: string): string => `${lapNumber}\u0000${kind}`;
  const observationIds = new Set<number>();
  for (const stored of events) {
    if (observationIds.has(stored.observationId)) throw new Error('Learning observationId values must be unique');
    observationIds.add(stored.observationId);
    if (stored.event.kind === 'learning-forecast') {
      const key = eventKey(stored.event.data.lapNumber, stored.event.data.kind);
      forecasts.set(key, [...(forecasts.get(key) ?? []), stored]);
    } else if (stored.event.kind === 'learning-outcome') {
      const key = eventKey(stored.event.data.lapNumber, stored.event.data.kind);
      outcomes.set(key, [...(outcomes.get(key) ?? []), stored]);
    }
  }

  const examples: LiveLearningExample[] = [];
  for (const [key, outcomeEvents] of outcomes) {
    const outcome = outcomeEvents[0];
    if (!outcome || outcome.event.kind !== 'learning-outcome') continue;
    const lap = laps.find((candidate) => candidate.lapNumber === outcome.event.data.lapNumber);
    if (!lap) continue;
    const kind = outcome.event.data.kind;
    const forecastEvents = forecasts.get(key) ?? [];
    const forecastEvent = forecastEvents[0];
    const forecast = forecastEvent?.event.kind === 'learning-forecast' ? forecastEvent.event.data : null;
    const exclusions = [...outcome.event.data.exclusions];
    if (laps.filter(candidate => candidate.lapNumber === lap.lapNumber).length !== 1) exclusions.push('ambiguous-xml-lap');
    if (outcomeEvents.length !== 1) exclusions.push('ambiguous-outcome');
    if (forecastEvents.length > 1) exclusions.push('ambiguous-forecast');
    if (!lap.isClean || !lap.isRepresentative) exclusions.push('lap-not-clean-representative');
    if (lap.lapNumber <= 1) exclusions.push('start-lap');
    if (manifest.droppedSamples > 0) exclusions.push('capture-drops');
    if (!manifest.gameVersion || !manifest.layoutKey || !manifest.vehicleModel) exclusions.push('manifest-identity-unknown');

    const anchorMatches = manifest.anchors.filter((anchor) => anchor.lapNumber === lap.lapNumber);
    const anchor = anchorMatches[0];
    const lapStart = anchor?.startSeconds;
    const lapEnd = lapStart !== undefined && lap.lapSeconds !== null ? lapStart + lap.lapSeconds : null;
    if (!anchor || anchorMatches.length !== 1 || !Number.isFinite(lapStart)) exclusions.push('anchor-missing-or-ambiguous');
    if (lap.lapSeconds === null || !Number.isFinite(lap.lapSeconds) || lap.lapSeconds <= 0) exclusions.push('xml-duration-invalid');
    if (anchor?.lapSeconds === null || anchor?.lapSeconds === undefined || lap.lapSeconds === null
      || !metricClose(anchor.lapSeconds, lap.lapSeconds, 0.05)) exclusions.push('anchor-duration-mismatch');
    if (lap.condition !== 'dry' && lap.condition !== 'wet') exclusions.push('xml-condition-unknown');
    if (forecastEvents.length === 0) exclusions.push('missing-forecast');
    if (!forecast) exclusions.push('invalid-forecast');
    if (outcome.event.data.version !== LIVE_LEARNING_VERSION) exclusions.push('outcome-version-unsupported');
    if (!Number.isFinite(outcome.event.data.actual) || outcome.event.data.actual <= 0) exclusions.push('outcome-actual-invalid');
    if (forecast) {
      if (forecast.version !== LIVE_LEARNING_VERSION) exclusions.push('forecast-version-unsupported');
      if (forecast.kind !== kind) exclusions.push('forecast-kind-mismatch');
      if (forecast.predicted === null || !Number.isFinite(forecast.predicted) || forecast.predicted <= 0) exclusions.push('forecast-prediction-invalid');
      if (forecast.predictionSource === null) exclusions.push('forecast-prediction-source-unknown');
      if (!Number.isInteger(forecast.modelVersion) || forecast.modelVersion <= 0) exclusions.push('forecast-model-version-invalid');
      if (forecast.condition !== lap.condition) exclusions.push('forecast-condition-mismatch');
      if (!forecast.compound) exclusions.push('missing-compound');
      if (!Number.isFinite(forecast.forecastSeconds) || lapStart === undefined
        || forecast.forecastSeconds < lapStart || forecast.forecastSeconds - lapStart > 2) exclusions.push('forecast-time-invalid');
      if (lapStart === undefined || !metricClose(forecast.lapStartSeconds, lapStart, 0.05)) exclusions.push('forecast-anchor-start-mismatch');
    }
    const crossingSeconds = outcome.event.data.crossingSeconds;
    if (!Number.isFinite(crossingSeconds) || lapEnd === null || !metricClose(crossingSeconds, lapEnd, 0.05)) exclusions.push('outcome-crossing-mismatch');
    if (forecast && Number.isFinite(crossingSeconds) && crossingSeconds <= forecast.forecastSeconds) exclusions.push('outcome-before-forecast');

    examples.push({
      version: LIVE_LEARNING_VERSION,
      sessionId: manifest.sessionId,
      driverOrdinal: lap.driverOrdinal,
      lapOrdinal: lap.lapOrdinal,
      lapNumber: lap.lapNumber,
      recordingId: manifest.recordingId,
      forecastObservationId: forecastEvent?.observationId ?? null,
      outcomeObservationId: outcome.observationId,
      matchVersion,
      layoutKey: manifest.layoutKey,
      vehicleModel: manifest.vehicleModel,
      driverName: manifest.driverName,
      gameVersion: manifest.gameVersion,
      startedAt: manifest.startedAt,
      kind,
      condition: lap.condition,
      compound: forecast?.compound ?? null,
      modelVersion: forecast?.modelVersion ?? null,
      predictionSource: forecast?.predictionSource ?? null,
      predicted: forecast?.predicted ?? null,
      actual: outcome.event.data.actual,
      forecastSeconds: forecast?.forecastSeconds ?? null,
      crossingSeconds,
      exclusions: [...new Set(exclusions)],
    });
  }
  return examples.sort((a, b) => a.lapOrdinal - b.lapOrdinal || a.kind.localeCompare(b.kind));
}
