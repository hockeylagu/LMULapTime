import type { ReplayTrajectoryData } from '../../../shared/types/index.js';
import { type RawTrajectoryPoint, type VcrTimingEvent, type DetectedLapInternal, detectLapsFromTelemetry } from './replayLapBuilder.js';
import { buildTrajectoryPoints } from './replayLapPoints.js';
import { replayWeatherCondition } from '../../../shared/domain/lapConditions.js';
import { nearestSelectedIndex, selectFeatureSamples } from './trajectoryDownsampler.js';
import { ReplayProgressTracker } from '../replayProgress.js';
import type { ExtractReplayTrajectoryOptions } from './replayTrajectory.js';

export interface ReplayFinalizeContext {
  filename: string;
  driverSlot?: number;
  driverName?: string;
  timings: VcrTimingEvent[];
  events: Pick<ReplayTrajectoryData, 'penalties' | 'contacts' | 'pitEvents' | 'flagEvents' | 'standingsHistory' | 'weatherEvents'>;
  maxSessionRain: number;
  currentAmbientTemp?: number;
  tireCompounds?: [number, number, number, number];
}

export function finalizeReplayDriver(
  driverRawPoints: RawTrajectoryPoint[], context: ReplayFinalizeContext,
  options: ExtractReplayTrajectoryOptions, onLapResult?: (lap: ReplayTrajectoryData) => ReplayTrajectoryData,
): ReplayTrajectoryData | undefined {
  const { filename, driverSlot: targetSlot, driverName, timings: vcrTimingEvents, maxSessionRain, currentAmbientTemp } = context;
  const { penalties: replayPenalties = [], contacts: replayContacts = [], pitEvents: replayPitEvents = [],
    flagEvents: replayFlagEvents = [], standingsHistory = [], weatherEvents: replayWeatherEvents = [] } = context.events;
  const startTimeMs = Date.now();
  const tracker = new ReplayProgressTracker(0, options.onProgress, options);
  const maxPoints = options.maxPoints !== undefined ? options.maxPoints : 1200;

  // Stage 5: Lap Classification & Split Timing Correlation
  tracker.report('lap_analysis', 88);
  const lapAnalysis = detectLapsFromTelemetry(driverRawPoints, vcrTimingEvents, targetSlot, replayPitEvents, maxPoints);
  const { detectedLaps, pitIntervals, lapsSummary } = lapAnalysis;
  const targetPitEvents = targetSlot !== undefined ? replayPitEvents.filter(e => e.driverSlot === targetSlot) : [];

  if (!options.silent) {
    const cleanFlying = detectedLaps.filter(l => l.isValid && !l.isOutLap && !l.isPitStop);
    const outLaps = detectedLaps.filter(l => l.isOutLap);
    const best = detectedLaps.find(l => l.isBest);
    const bestStr = best
      ? `Best: Lap ${best.lapNumber} (${best.lapTimeSec.toFixed(3)}s [S1: ${best.s1Sec}s, S2: ${best.s2Sec}s, S3: ${best.s3Sec}s])`
      : 'Best: N/A';
    console.log(
      `[VCR Parser] [5/6] Lap Analysis: ${detectedLaps.length} laps detected (${cleanFlying.length} flying, ${outLaps.length} out-laps) | ${bestStr}`
    );
  }

  // Stage 6: Trajectory Downsampling & Finalization
  tracker.report('downsampling', 95);

  function buildLapResult(chosenLap: DetectedLapInternal): ReplayTrajectoryData {
    const lapRawPts = driverRawPoints.slice(chosenLap.startIdx, chosenLap.endIdx + 1);
    const rawPointsCount = lapRawPts.length;
    const lapDuration = chosenLap.lapTimeSec || (driverRawPoints.length > 0 ? Math.max(0.001, driverRawPoints[chosenLap.endIdx].sTime - driverRawPoints[chosenLap.startIdx].sTime) : 0);
    const rawSampleRateHz = lapDuration > 0 && rawPointsCount > 1
      ? Math.round((rawPointsCount - 1) / lapDuration)
      : 0;

    const lapPoints = buildTrajectoryPoints(lapRawPts, pitIntervals, targetPitEvents);
    const selected = maxPoints > 0 && lapPoints.length > maxPoints ? selectFeatureSamples(lapPoints, maxPoints) : null;
    const finalPoints = selected ? selected.map(i => lapPoints[i]) : lapPoints;

    const lapSpan = Math.max(1, chosenLap.endIdx - chosenLap.startIdx);
    const sectorFrame = (sectorIdx: number): number => {
      if (selected) return nearestSelectedIndex(selected, sectorIdx - chosenLap.startIdx);
      const fraction = (sectorIdx - chosenLap.startIdx) / lapSpan;
      return Math.min(finalPoints.length - 1, Math.round(fraction * finalPoints.length));
    };
    const s1Frame = sectorFrame(chosenLap.s1Idx);
    const s2Frame = sectorFrame(chosenLap.s2Idx);

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of finalPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    if (!isFinite(minX)) {
      minX = 0; maxX = 0; minZ = 0; maxZ = 0;
    }

    const result: ReplayTrajectoryData = {
      replayName: filename,
      driverSlot: targetSlot,
      driverName,
      pointsCount: finalPoints.length,
      rawPointsCount,
      rawSampleRateHz,
      maxPoints: options.maxPoints,
      isFullResolution: finalPoints.length >= rawPointsCount,
      currentLap: chosenLap.lapNumber,
      timeReference: 'session',
      lapStartTimeSec: chosenLap.startTimeSec ?? lapRawPts[0]?.sTime,
      laps: lapsSummary,
      sectors: { s1Frame, s2Frame },
      bounds: {
        minX: Number(minX.toFixed(4)),
        maxX: Number(maxX.toFixed(4)),
        minZ: Number(minZ.toFixed(4)),
        maxZ: Number(maxZ.toFixed(4)),
        spanX: Number((maxX - minX).toFixed(4)),
        spanZ: Number((maxZ - minZ).toFixed(4)),
      },
      points: finalPoints,
      signConvention: 'iso8855',
      penalties: replayPenalties.length > 0 ? replayPenalties : undefined,
      contacts: replayContacts.length > 0 ? replayContacts : undefined,
      pitEvents: replayPitEvents.length > 0 ? replayPitEvents : undefined,
      flagEvents: replayFlagEvents.length > 0 ? replayFlagEvents : undefined,
      standingsHistory: standingsHistory.length > 0 ? standingsHistory : undefined,
      sessionRunningOrder: standingsHistory.length > 0 ? standingsHistory[standingsHistory.length - 1].order : undefined,
      wheelTelemetryAvailable: Boolean(finalPoints.some(p => p.wheelSpeeds !== undefined || p.brakeTemps !== undefined)),
      energyTelemetryAvailable: Boolean(finalPoints.some(p => p.virtualEnergy !== undefined)),
      weatherEvents: replayWeatherEvents.length > 0 ? replayWeatherEvents : undefined,
      weatherCondition: replayWeatherCondition(maxSessionRain),
      maxRainIntensity: maxSessionRain > 0 ? maxSessionRain : undefined,
      ambientTemp: currentAmbientTemp,
      tireCompounds: context.tireCompounds,
    };
    return onLapResult ? onLapResult(result) : result;
  }

  let chosen = detectedLaps.find(l => l.lapNumber === options.lapNumber);
  if (!chosen) {
    chosen = detectedLaps.find(l => l.isBest) || detectedLaps[0];
  }

  const allLapsData = options.allLaps ? detectedLaps.map(l => buildLapResult(l)) : undefined;
  const result = allLapsData
    ? allLapsData.find(r => r.currentLap === chosen!.lapNumber)!
    : buildLapResult(chosen);

  if (allLapsData) {
    result.allLapsData = allLapsData;
  }

  tracker.report('downsampling', 100);

  if (!options.silent) {
    const elapsedMs = Date.now() - startTimeMs;
    const wheels = result.wheelTelemetryAvailable ? 'yes' : 'no';
    const energy = result.energyTelemetryAvailable ? 'yes' : 'no';
    console.log(
      `[VCR Parser] [6/6] Finalized: Lap ${result.currentLap} downsampled to ${result.pointsCount} pts (raw: ${result.rawPointsCount} @ ${result.rawSampleRateHz}Hz) | Bounds: ${result.bounds.spanX}m x ${result.bounds.spanZ}m | Telemetry: wheels=${wheels}, energy=${energy} (${elapsedMs}ms)`
    );
  }


  return result;
}
