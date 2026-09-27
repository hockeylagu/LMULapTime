import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionChartData } from '../../../../src/components/session-detail/chart/useSessionChartData';
import { formatTime } from '../../../../shared/domain/formatters';
import type { DetailedSession, DriverData, LapData } from '../../../../shared/types/index';

function lap(lapNum: number, lapTime: number | null, flags: Partial<LapData> = {}): LapData {
  const third = lapTime ? lapTime / 3 : null;
  return {
    lapNum, position: 1, lapTime, lapTimeString: lapTime ? `${lapTime}` : '--', s1: third, s2: third, s3: third,
    topSpeed: 300, fCompound: 'Medium', rCompound: 'Medium', isPitStop: false, isValid: true, ...flags,
  };
}

function driver(name: string, carClass: string, laps: LapData[], isPlayer = false): DriverData {
  return { name, carClass, carType: carClass === 'LMGT3' ? 'Porsche 911 GT3 R' : 'Ferrari 499P', isPlayer, laps } as DriverData;
}

const session = (drivers: DriverData[]) => ({ drivers }) as unknown as DetailedSession;

describe('useSessionChartData', () => {
  it('averages only clean flying laps: no start lap, pit in-lap, out-lap, invalid or unfinished lap', () => {
    const player = driver('Player', 'Hypercar', [
      lap(1, 130),                             // start lap
      lap(2, 100),
      lap(3, 110, { isPitStop: true }),        // pit in-lap
      lap(4, 140, { isOutLap: true }),         // out-lap
      lap(5, 90, { isValid: false }),          // track limits
      lap(6, 102),
      lap(7, null),                            // unfinished
    ], true);

    const { result } = renderHook(() => useSessionChartData({ session: session([player]), selectedDriver: player, isMultiClass: false }));

    expect(result.current.avgLapTime).toBe(101);
    expect(result.current.avgS1).toBeCloseTo(101 / 3, 6);
    expect(result.current.sessionChartData.map(point => point.isOutLap)).toEqual([false, false, false, true, false, false, false]);
    expect(result.current.sessionChartData[6]).toMatchObject({ lapTime: null, s1: null });
  });

  it('shows the lap time and inferred flag the parser stored, without estimating it again', () => {
    const player = driver('Player', 'Hypercar', [lap(1, 120), lap(2, 118.5, { isInferred: true, isPitStop: true })], true);

    const { result } = renderHook(() => useSessionChartData({ session: session([player]), selectedDriver: player, isMultiClass: false }));

    expect(result.current.sessionChartData[1]).toMatchObject({ lapTime: 118.5, isInferred: true, isPitStop: true });
    expect(result.current.sessionChartData[0].isInferred).toBe(false);
  });

  it('has no averages without a clean lap', () => {
    const player = driver('Player', 'Hypercar', [lap(1, 130), lap(2, 140, { isOutLap: true })], true);
    const { result } = renderHook(() => useSessionChartData({ session: session([player]), selectedDriver: player, isMultiClass: false }));
    expect(result.current.avgLapTime).toBeNull();
    expect(result.current.sessionChartData[0].avgLapTimeString).toBe(formatTime(null));
  });

  it("ranks the selected driver's class on its own in a multi-class session", () => {
    const hyper1 = driver('Hyper One', 'Hypercar', [lap(1, 100, { position: 1 }), lap(2, 100, { position: 2 })], true);
    const gt3 = driver('GT3 Car', 'LMGT3', [lap(1, 120, { position: 2 }), lap(2, 120, { position: 3 })]);
    const hyper2 = driver('Hyper Two', 'Hypercar', [lap(1, 101, { position: 3 }), lap(2, 99, { position: 1 })]);

    const { result } = renderHook(() => useSessionChartData({ session: session([hyper1, gt3, hyper2]), selectedDriver: hyper1, isMultiClass: true }));

    expect(result.current.driversToPlot.map(d => d.name)).toEqual(['Hyper One', 'Hyper Two']);
    expect(result.current.positionChartData[0]).toMatchObject({ 'Hyper One': 1, 'Hyper Two': 2, 'Hyper Two_overallPos': 3 });
    expect(result.current.positionChartData[1]).toMatchObject({ 'Hyper One': 2, 'Hyper Two': 1 });
    expect(result.current.positionChartData[0]).not.toHaveProperty('GT3 Car');
  });
});

