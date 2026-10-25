import { describe, expect, it } from 'vitest';
import type { LiveCaptureManifest } from '../../../shared/types/liveCapture.js';
import type { StoredLearningEvent } from '../../../shared/types/liveLearning.js';
import { buildLearningExamples, type LearningLap } from '../../../shared/domain/learning/examples.js';

const manifest: LiveCaptureManifest = {
  recordingId: 'recording-1', source: 'live-capture', schemaVersion: 1, normalizationVersion: 1,
  signConvention: 'iso8855', filename: 'capture.json', layoutKey: 'track-layout', trackName: 'Track',
  driverName: 'Driver', vehicleName: 'Car', vehicleModel: 'car-model', carClass: 'GT3', sessionCode: 1,
  sessionKind: 'race', startedAt: 1000, updatedAt: 2000, firstElapsedSeconds: 0, lastElapsedSeconds: 200,
  endedAt: 2000, status: 'completed', samples: 1000, droppedSamples: 0,
  anchors: [{ lapNumber: 5, startSeconds: 100, lapSeconds: 90 }], sessionId: 'session-1', gameVersion: '1.2.3',
};

const lap: LearningLap = {
  driverOrdinal: 0, lapOrdinal: 4, lapNumber: 5, lapSeconds: 90,
  isClean: true, isRepresentative: true, condition: 'dry',
};

function eventSet(kind: 'fuel' | 've' = 'fuel', forecastObservationId = 10, outcomeObservationId = 20): StoredLearningEvent[] {
  return [
    {
      observationId: forecastObservationId,
      event: { kind: 'learning-forecast', data: {
        version: 1, lapNumber: 5, lapStartSeconds: 100, forecastSeconds: 101, kind,
        predicted: kind === 'fuel' ? 2.5 : 3, predictionSource: 'measured', modelVersion: 2,
        condition: 'dry', compound: 'medium',
      } },
    },
    {
      observationId: outcomeObservationId,
      event: { kind: 'learning-outcome', data: {
        version: 1, lapNumber: 5, crossingSeconds: 190, kind,
        actual: kind === 'fuel' ? 2.4 : 2.8, measurementSource: 'live-usage-meter', exclusions: [],
      } },
    },
  ];
}

describe('buildLearningExamples', () => {
  it('builds eligible forecast/outcome examples with stable provenance and is idempotent', () => {
    const events = eventSet();
    const first = buildLearningExamples(manifest, 3, [lap], events);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      sessionId: 'session-1', lapNumber: 5, kind: 'fuel', predicted: 2.5, actual: 2.4,
      forecastObservationId: 10, outcomeObservationId: 20, matchVersion: 3,
      exclusions: [], modelVersion: 2, condition: 'dry',
    });
    expect(buildLearningExamples(manifest, 3, [lap], events)).toEqual(first);
  });

  it('keeps fuel and VE examples independent for the same lap', () => {
    const examples = buildLearningExamples(manifest, 1, [lap], [...eventSet('fuel'), ...eventSet('ve', 11, 21)]);
    expect(examples.map(({ kind }) => kind)).toEqual(['fuel', 've']);
    expect(new Set(examples.map(({ outcomeObservationId }) => outcomeObservationId)).size).toBe(2);
  });

  it('marks duplicate outcome and forecast events ambiguous without dropping provenance', () => {
    const events = eventSet();
    const duplicateForecast = { ...events[0]!, observationId: 12 };
    const duplicateOutcome = { ...events[1]!, observationId: 22 };
    const [example] = buildLearningExamples(manifest, 1, [lap], [...events, duplicateForecast, duplicateOutcome]);
    expect(example?.exclusions).toContain('ambiguous-outcome');
    expect(example?.exclusions).toContain('ambiguous-forecast');
    expect(example?.outcomeObservationId).toBe(20);
    expect(example?.forecastObservationId).toBe(10);
  });

  it('preserves outcome exclusions and adds timing, condition and flag exclusions', () => {
    const badLap = { ...lap, isClean: false, condition: 'unknown' };
    const events = eventSet();
    const outcome = events[1];
    if (!outcome || outcome.event.kind !== 'learning-outcome') throw new Error('Expected outcome fixture');
    const changedOutcome: StoredLearningEvent = {
      ...outcome,
      event: { ...outcome.event, data: { ...outcome.event.data, exclusions: ['source-exclusion'] } },
    };
    const [example] = buildLearningExamples(manifest, 1, [badLap], [events[0]!, changedOutcome]);
    expect(example?.exclusions).toEqual(expect.arrayContaining([
      'source-exclusion', 'lap-not-clean-representative', 'xml-condition-unknown',
      'forecast-condition-mismatch',
    ]));
  });

  it('keeps laps of a recording that dropped samples elsewhere', () => {
    // Portimão LMP3 race 2026-10-24: 26 of 42,721 samples lost in one 0.84 s gap before the start excluded every
    // lap of the race; the lap's forecast and outcome are intact.
    const [example] = buildLearningExamples({ ...manifest, samples: 42_721, droppedSamples: 26 }, 1, [lap], eventSet());
    expect(example?.exclusions).toEqual([]);
  });

  it('requires verified session ownership and unique observation IDs', () => {
    expect(() => buildLearningExamples({ ...manifest, sessionId: null }, 1, [lap], eventSet())).toThrow(/sessionId/);
    const events = eventSet();
    expect(() => buildLearningExamples(manifest, 1, [lap], [events[0]!, { ...events[1]!, observationId: 10 }])).toThrow(/unique/);
  });
});
