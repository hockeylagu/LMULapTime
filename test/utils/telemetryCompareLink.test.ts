import { describe, it, expect } from 'vitest';
import { buildTelemetryComparePath } from '../../src/utils/telemetryCompareLink.js';

describe('buildTelemetryComparePath', () => {
  it('opens the target lap against the baseline, keeping the page selection', () => {
    const path = buildTelemetryComparePath(
      new URLSearchParams('track=Monza&carClass=LMGT3'),
      { sessionId: 's-r1', driverOrdinal: 1, lapOrdinal: 6, driverName: 'Me', lapNum: 7 },
      { sessionId: 's-q1', driverOrdinal: 2, lapOrdinal: 2, driverName: 'Rival', lapNum: 3 },
    );
    const [route, query] = path.split('?');
    expect(route).toBe('/telemetry');
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      track: 'Monza',
      carClass: 'LMGT3',
      sessionId: 's-r1',
      driverOrdinal: '1',
      lapOrdinal: '6',
      baselineSessionId: 's-q1',
      baselineDriverOrdinal: '2',
      baselineLapOrdinal: '2',
      compareDriver: 'Rival',
    });
  });

  it('opens a lap alone, dropping a comparison the page carried', () => {
    const path = buildTelemetryComparePath(
      new URLSearchParams('track=Monza&baselineSessionId=s-old&baselineDriverOrdinal=1&baselineLapOrdinal=2&compareDriver=X'),
      { sessionId: 's-r1', driverOrdinal: 1, lapOrdinal: 6, driverName: 'Me', lapNum: 7 },
      null,
    );
    expect(Object.fromEntries(new URLSearchParams(path.split('?')[1]))).toEqual({
      track: 'Monza', sessionId: 's-r1', driverOrdinal: '1', lapOrdinal: '6',
    });
  });

  it('opens on a corner when one is named, and drops a corner the page carried otherwise', () => {
    const lap = { sessionId: 's-r', driverOrdinal: 0, lapOrdinal: 0, lapNum: 1 };
    const onCorner = buildTelemetryComparePath(new URLSearchParams(), lap, lap, 5);
    expect(new URLSearchParams(onCorner.split('?')[1]).get('corner')).toBe('5');
    const noCorner = buildTelemetryComparePath(new URLSearchParams('corner=3'), lap, lap);
    expect(new URLSearchParams(noCorner.split('?')[1]).has('corner')).toBe(false);
  });
});
