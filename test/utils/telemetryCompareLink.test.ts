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

  it('opens a lap alone, dropping a comparison the page carried', () => {
    const path = buildTelemetryComparePath(
      new URLSearchParams('track=Monza&baselineReplay=Old.Vcr&compareSessionId=s-old&compareDriver=X&compareLapNum=2'),
      { replayName: 'Monza R1.Vcr', driverName: 'Me', lapNum: 7 },
      null,
    );
    expect(Object.fromEntries(new URLSearchParams(path.split('?')[1]))).toEqual({
      track: 'Monza', replayName: 'Monza R1.Vcr', lap: '7', driverName: 'Me',
    });
  });

  it('opens on a corner when one is named, and drops a corner the page carried otherwise', () => {
    const lap = { replayName: 'R.Vcr', lapNum: 1 };
    const onCorner = buildTelemetryComparePath(new URLSearchParams(), lap, lap, 5);
    expect(new URLSearchParams(onCorner.split('?')[1]).get('corner')).toBe('5');
    const noCorner = buildTelemetryComparePath(new URLSearchParams('corner=3'), lap, lap);
    expect(new URLSearchParams(noCorner.split('?')[1]).has('corner')).toBe(false);
  });
});
