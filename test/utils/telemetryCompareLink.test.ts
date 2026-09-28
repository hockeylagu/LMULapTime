import { describe, it, expect } from 'vitest';
import { buildTelemetryComparePath } from '../../src/utils/telemetryCompareLink.js';

describe('buildTelemetryComparePath', () => {
  it('opens the target lap against the baseline, keeping the page selection', () => {
    const path = buildTelemetryComparePath(
      new URLSearchParams('track=Monza&carClass=LMGT3'),
      { replayName: 'Monza R1.Vcr', driverName: 'Me', lapNum: 7 },
      { replayName: 'Monza Q1.Vcr', sessionId: 's-q1', driverName: 'Rival', lapNum: 3 },
    );
    const [route, query] = path.split('?');
    expect(route).toBe('/telemetry');
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      track: 'Monza',
      carClass: 'LMGT3',
      replayName: 'Monza R1.Vcr',
      lap: '7',
      driverName: 'Me',
      baselineReplay: 'Monza Q1.Vcr',
      compareSessionId: 's-q1',
      compareDriver: 'Rival',
      compareLapNum: '3',
    });
  });
});
