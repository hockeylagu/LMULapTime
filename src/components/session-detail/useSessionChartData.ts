import { useMemo } from 'react';
import { DetailedSession, DriverData, LapData } from '../../../server/types.js';
import { formatTime } from '../../utils/formatters.js';
import { matchesCarClass } from '../../utils/paceCategory.js';

export interface UseSessionChartDataParams {
  session: DetailedSession;
  selectedDriver: DriverData;
  isMultiClass: boolean;
}

export function useSessionChartData({ session, selectedDriver, isMultiClass }: UseSessionChartDataParams) {
  const classDrivers = useMemo(() => {
    return (session.drivers || []).filter((d) =>
      matchesCarClass(d.carClass || '', d.carType || '', selectedDriver.carClass || selectedDriver.carType || '')
    );
  }, [session.drivers, selectedDriver]);

  const driversToPlot = classDrivers.length > 0 ? classDrivers : session.drivers || [];
  const maxClassLaps = Math.max(...driversToPlot.map((d) => (d.laps ? d.laps.length : 0)), 1);
  const maxPosInClass = isMultiClass
    ? Math.max(driversToPlot.length, 2)
    : Math.max(
        ...driversToPlot.flatMap((d) => (d.laps || []).map((l) => l.position)).filter((p) => p > 0),
        driversToPlot.length,
        1
      );

  const completedLaps = (selectedDriver.laps || []).filter((l) => l.lapTime !== null && l.lapTime > 0);
  const hasMultipleLaps = completedLaps.length > 1;

  const validFlyingLaps = completedLaps.filter((l) => l.isValid && (!hasMultipleLaps || l.lapNum > 1));
  const cleanLapsForAvg =
    validFlyingLaps.length > 0
      ? validFlyingLaps
      : completedLaps.filter((l) => !hasMultipleLaps || l.lapNum > 1).length > 0
      ? completedLaps.filter((l) => !hasMultipleLaps || l.lapNum > 1)
      : completedLaps;

  const avgLapTime =
    cleanLapsForAvg.length > 0
      ? cleanLapsForAvg.reduce((sum, l) => sum + (l.lapTime || 0), 0) / cleanLapsForAvg.length
      : null;

  const s1Laps = (selectedDriver.laps || []).filter(
    (l) => l.s1 !== null && l.s1 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
  );
  const avgS1 = s1Laps.length > 0 ? s1Laps.reduce((sum, l) => sum + (l.s1 || 0), 0) / s1Laps.length : null;

  const s2Laps = (selectedDriver.laps || []).filter(
    (l) => l.s2 !== null && l.s2 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
  );
  const avgS2 = s2Laps.length > 0 ? s2Laps.reduce((sum, l) => sum + (l.s2 || 0), 0) / s2Laps.length : null;

  const s3Laps = (selectedDriver.laps || []).filter(
    (l) => l.s3 !== null && l.s3 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
  );
  const avgS3 = s3Laps.length > 0 ? s3Laps.reduce((sum, l) => sum + (l.s3 || 0), 0) / s3Laps.length : null;

  const positionChartData = useMemo(() => {
    return Array.from({ length: maxClassLaps }, (_, i) => {
      const lapNum = i + 1;
      const point: any = { lapNum: `Lap ${lapNum}`, lapNumber: lapNum };

      const driversOnLap = driversToPlot
        .map((d) => ({
          driver: d,
          lap: d.laps?.find((l) => l.lapNum === lapNum),
          overallPos: d.laps?.find((l) => l.lapNum === lapNum && l.position > 0)?.position ?? null,
        }))
        .filter((item): item is { driver: DriverData; lap: LapData; overallPos: number } => item.overallPos !== null);

      driversOnLap.sort((a, b) => a.overallPos - b.overallPos);

      driversOnLap.forEach((item, classIdx) => {
        const classPos = isMultiClass ? classIdx + 1 : item.overallPos;
        const prevLap = item.driver.laps?.find((ol) => ol.lapNum === lapNum - 1);
        const prevIsValidPitStop = Boolean(
          prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0
        );
        const isOutLap = Boolean(item.lap.isOutLap || prevIsValidPitStop);
        point[item.driver.name] = classPos;
        point[`${item.driver.name}_isPit`] = item.lap.isPitStop;
        point[`${item.driver.name}_isOutLap`] = isOutLap;
        point[`${item.driver.name}_lapTime`] = item.lap.lapTimeString;
        point[`${item.driver.name}_isPlayer`] = item.driver.isPlayer;
        point[`${item.driver.name}_overallPos`] = item.overallPos;
      });

      return point;
    });
  }, [maxClassLaps, driversToPlot, isMultiClass]);

  const sessionChartData = useMemo(() => {
    return (selectedDriver.laps || []).map((l, idx, arr) => {
      const prevLap = idx > 0 ? arr[idx - 1] : null;
      const prevIsValidPitStop = Boolean(
        prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0
      );
      const isOutLap = Boolean(l.isOutLap || prevIsValidPitStop);

      let resolvedLapTime = l.lapTime;
      let resolvedLapTimeString = l.lapTimeString;
      let isInferred = Boolean(l.isInferred);

      if (
        (resolvedLapTime === null || resolvedLapTime <= 0) &&
        l.elapsedSeconds !== null &&
        l.elapsedSeconds !== undefined
      ) {
        if (prevLap?.elapsedSeconds !== null && prevLap?.elapsedSeconds !== undefined) {
          const deltaEt = parseFloat((l.elapsedSeconds - prevLap.elapsedSeconds).toFixed(3));
          const knownSectors = (l.s1 || 0) + (l.s2 || 0) + (l.s3 || 0);
          const maxAllowed = selectedDriver.bestLapTime ? Math.max(selectedDriver.bestLapTime * 3.5, 300) : 600;
          if (deltaEt > 0 && (knownSectors === 0 || deltaEt >= knownSectors) && deltaEt >= 10 && deltaEt <= maxAllowed) {
            resolvedLapTime = deltaEt;
            resolvedLapTimeString = formatTime(deltaEt);
            isInferred = true;
          }
        }
      }

      return {
        lapNum: `Lap ${l.lapNum}`,
        lapNumber: l.lapNum,
        lapTime: resolvedLapTime && resolvedLapTime > 0 ? resolvedLapTime : null,
        lapTimeString: resolvedLapTimeString,
        isInferred,
        avgLapTime,
        avgLapTimeString: formatTime(avgLapTime),
        s1: l.s1 && l.s1 > 0 ? l.s1 : null,
        s2: l.s2 && l.s2 > 0 ? l.s2 : null,
        s3: l.s3 && l.s3 > 0 ? l.s3 : null,
        avgS1,
        avgS2,
        avgS3,
        s1String: formatTime(l.s1),
        s2String: formatTime(l.s2),
        s3String: formatTime(l.s3),
        avgS1String: formatTime(avgS1),
        avgS2String: formatTime(avgS2),
        avgS3String: formatTime(avgS3),
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
  }, [selectedDriver.laps, avgLapTime, avgS1, avgS2, avgS3, selectedDriver.bestLapTime]);

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
