import { useMemo } from 'react';
import { DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';
import { selectCleanLapCandidates } from '../../../../shared/domain/lapComparison.js';

export type SessionPositionChartPoint = Record<string, string | number | boolean | null | undefined>;

export interface UseSessionChartDataParams {
  session: DetailedSession;
  selectedDriver: DriverData;
  isMultiClass: boolean;
}

export function useSessionChartData({ session, selectedDriver, isMultiClass }: UseSessionChartDataParams) {
  const classDrivers = useMemo(() => {
    return (session.drivers || []).filter((d) =>
      d.carClass === selectedDriver.carClass
    );
  }, [session.drivers, selectedDriver]);

  const {
    driversToPlot,
    maxClassLaps,
    maxPosInClass,
    avgLapTime,
    avgS1,
    avgS2,
    avgS3,
  } = useMemo(() => {
    const drivers = classDrivers.length > 0 ? classDrivers : session.drivers || [];
    const maxLaps = Math.max(...drivers.map((d) => (d.laps ? d.laps.length : 0)), 1);
    const maxPos = isMultiClass
      ? Math.max(drivers.length, 2)
      : Math.max(
          ...drivers.flatMap((d) => (d.laps || []).map((l) => l.position)).filter((p) => p > 0),
          drivers.length,
          1
        );

    const cleanLaps = selectCleanLapCandidates(selectedDriver.laps || []);

    const avgTime =
      cleanLaps.length > 0
        ? cleanLaps.reduce((sum, l) => sum + (l.lapTime || 0), 0) / cleanLaps.length
        : null;

    const s1L = (selectedDriver.laps || []).filter(
      (l) => l.s1 !== null && l.s1 > 0 && cleanLaps.includes(l)
    );
    const s1Avg = s1L.length > 0 ? s1L.reduce((sum, l) => sum + (l.s1 || 0), 0) / s1L.length : null;

    const s2L = (selectedDriver.laps || []).filter(
      (l) => l.s2 !== null && l.s2 > 0 && cleanLaps.includes(l)
    );
    const s2Avg = s2L.length > 0 ? s2L.reduce((sum, l) => sum + (l.s2 || 0), 0) / s2L.length : null;

    const s3L = (selectedDriver.laps || []).filter(
      (l) => l.s3 !== null && l.s3 > 0 && cleanLaps.includes(l)
    );
    const s3Avg = s3L.length > 0 ? s3L.reduce((sum, l) => sum + (l.s3 || 0), 0) / s3L.length : null;

    return {
      driversToPlot: drivers,
      maxClassLaps: maxLaps,
      maxPosInClass: maxPos,
      avgLapTime: avgTime,
      avgS1: s1Avg,
      avgS2: s2Avg,
      avgS3: s3Avg,
    };
  }, [classDrivers, session.drivers, selectedDriver, isMultiClass]);

  const positionChartData = useMemo(() => {
    return Array.from({ length: maxClassLaps }, (_, i) => {
      const lapNumber = i + 1;
      const point: SessionPositionChartPoint = { lapLabel: `Lap ${lapNumber}`, lapNumber };

      const driversOnLap = driversToPlot
        .map((d) => ({
          driver: d,
          lap: d.laps?.find((l) => l.lapNumber === lapNumber),
          overallPos: d.laps?.find((l) => l.lapNumber === lapNumber && l.position > 0)?.position ?? null,
        }))
        .filter((item): item is { driver: DriverData; lap: LapData; overallPos: number } => item.overallPos !== null);

      driversOnLap.sort((a, b) => a.overallPos - b.overallPos);

      driversOnLap.forEach((item, classIdx) => {
        const classPos = isMultiClass ? classIdx + 1 : item.overallPos;
        const isOutLap = Boolean(item.lap.isOutLap);
        point[item.driver.name] = classPos;
        point[`${item.driver.name}_isPit`] = item.lap.isPitStop;
        point[`${item.driver.name}_isOutLap`] = isOutLap;
        point[`${item.driver.name}_lapTime`] = item.lap.lapTime;
        point[`${item.driver.name}_isPlayer`] = item.driver.isPlayer;
        point[`${item.driver.name}_overallPos`] = item.overallPos;
      });

      return point;
    });
  }, [maxClassLaps, driversToPlot, isMultiClass]);

  const sessionChartData = useMemo(() => {
    return (selectedDriver.laps || []).map((l) => {
      // The parser infers a missing lap time from the elapsed time and marks out-laps.
      const isOutLap = Boolean(l.isOutLap);
      const resolvedLapTime = l.lapTime;
      const isInferred = Boolean(l.isInferred);

      return {
        lapLabel: `Lap ${l.lapNumber}`,
        lapNumber: l.lapNumber,
        lapTime: resolvedLapTime && resolvedLapTime > 0 ? resolvedLapTime : null,
        isInferred,
        avgLapTime,
        s1: l.s1 && l.s1 > 0 ? l.s1 : null,
        s2: l.s2 && l.s2 > 0 ? l.s2 : null,
        s3: l.s3 && l.s3 > 0 ? l.s3 : null,
        avgS1,
        avgS2,
        avgS3,
        topSpeed: l.topSpeed || null,
        twFL: l.tireWear?.fl ?? null,
        twFR: l.tireWear?.fr ?? null,
        twRL: l.tireWear?.rl ?? null,
        twRR: l.tireWear?.rr ?? null,
        twAvg: l.tireWear?.avg ?? null,
        fuel: l.fuel ?? null,
        fuelUsed: l.fuelUsed ?? null,
        virtualEnergy: l.virtualEnergy ?? null,
        virtualEnergyUsed: l.virtualEnergyUsed ?? null,
        isValid: l.isValid,
        isPitStop: l.isPitStop,
        isOutLap,
      };
    });
  }, [selectedDriver.laps, avgLapTime, avgS1, avgS2, avgS3]);

  return {
    driversToPlot,
    maxPosInClass,
    avgLapTime,
    avgS1,
    avgS2,
    avgS3,
    positionChartData,
    sessionChartData,
  };
}
