import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { interpolatePointAtDistance } from '../../../utils/replayComparison.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
import { HandlingBalanceEvent } from '../../../utils/handlingBalanceDetection.js';

export interface CornerHandlingBand {
  id: string;
  type: 'understeer' | 'oversteer';
  isTireScrub: boolean;
  label: string;
  xStart: number;
  xEnd: number;
  width: number;
  peakDeg: number;
}

export interface ActiveHandling {
  label: string;
  color: string;
  deg: number;
}

export interface CornerSpeedProfile {
  primaryPath: string;
  baselinePath: string;
  minPct: number;
  scrubPct: number | null;
  currentSpeed: number | null;
  currentHandling: ActiveHandling | null;
}

/** The handling events inside a corner, placed in the graph's 0-1000 x units. */
export function buildHandlingBands(handlingEvents: HandlingBalanceEvent[], corner: CornerSegmentComparison): CornerHandlingBand[] {
  const span = Math.max(1, corner.exitDistM - corner.entryDistM);
  const result: CornerHandlingBand[] = [];
  for (const ev of handlingEvents) {
    if (ev.endDistM < corner.entryDistM || ev.startDistM > corner.exitDistM) continue;

    const clampedStartM = Math.max(corner.entryDistM, ev.startDistM);
    const clampedEndM = Math.min(corner.exitDistM, ev.endDistM);

    const xStart = ((clampedStartM - corner.entryDistM) / span) * 1000;
    const xEnd = ((clampedEndM - corner.entryDistM) / span) * 1000;
    const width = Math.max(4, xEnd - xStart);

    result.push({
      id: ev.id,
      type: ev.type,
      isTireScrub: Boolean(ev.isTireScrub),
      label: ev.isTireScrub ? 'SCRUB' : ev.type === 'understeer' ? 'US' : 'OS',
      xStart: Number(xStart.toFixed(1)),
      xEnd: Number(xEnd.toFixed(1)),
      width: Number(width.toFixed(1)),
      peakDeg: ev.peakDeg,
    });
  }
  return result;
}

export interface CornerSpeedProfileInput {
  corner: CornerSegmentComparison;
  primaryPoints: ReplayTrajectoryPoint[];
  primaryDists: number[];
  baselinePoints?: ReplayTrajectoryPoint[];
  baselineDists?: number[];
  currentIndex?: number;
  currentDistM?: number;
  handlingEvents: HandlingBalanceEvent[];
}

/** The speed traces of a corner as SVG paths, and the scrub position with its live speed and handling badge. */
export function computeCornerSpeedProfile(input: CornerSpeedProfileInput): CornerSpeedProfile {
  const { corner, primaryPoints, primaryDists, baselinePoints, baselineDists, currentIndex, currentDistM, handlingEvents } = input;
  const span = Math.max(1, corner.exitDistM - corner.entryDistM);
  const primarySpeeds: { dist: number; speed: number }[] = [];
  const baselineSpeeds: { dist: number; speed: number }[] = [];

  let minSpd = corner.primaryMinSpeedKmh;
  let maxSpd = Math.max(corner.primaryEntrySpeedKmh, corner.primaryExitSpeedKmh);

  if (baselinePoints && baselineDists && baselinePoints.length > 0) {
    if (corner.baselineMinSpeedKmh !== undefined) minSpd = Math.min(minSpd, corner.baselineMinSpeedKmh);
    if (corner.baselineEntrySpeedKmh !== undefined) maxSpd = Math.max(maxSpd, corner.baselineEntrySpeedKmh);
    if (corner.baselineExitSpeedKmh !== undefined) maxSpd = Math.max(maxSpd, corner.baselineExitSpeedKmh);
  }

  const spdPadding = Math.max(10, (maxSpd - minSpd) * 0.15);
  const chartMin = Math.max(0, minSpd - spdPadding);
  const chartMax = maxSpd + spdPadding;
  const spdRange = Math.max(1, chartMax - chartMin);

  for (let i = 0; i < primaryPoints.length; i++) {
    const d = primaryDists[i];
    if (d >= corner.entryDistM && d <= corner.exitDistM) {
      primarySpeeds.push({ dist: d, speed: primaryPoints[i].speedKmh ?? 0 });
    }
  }

  if (baselinePoints && baselineDists && baselinePoints.length > 0) {
    for (let i = 0; i < baselinePoints.length; i++) {
      const d = baselineDists[i];
      if (d >= corner.entryDistM && d <= corner.exitDistM) {
        baselineSpeeds.push({ dist: d, speed: baselinePoints[i].speedKmh ?? 0 });
      }
    }
  }

  const toPath = (speeds: { dist: number; speed: number }[]) => {
    if (speeds.length < 2) return '';
    return speeds.map((pt, i) => {
      const x = Number((((pt.dist - corner.entryDistM) / span) * 1000).toFixed(1));
      const y = Number((100 - ((pt.speed - chartMin) / spdRange) * 100).toFixed(1));
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  let scrubPct: number | null = null;
  let currentSpeed: number | null = null;
  let currentHandling: ActiveHandling | null = null;

  if (currentDistM !== undefined && currentDistM >= corner.entryDistM && currentDistM <= corner.exitDistM) {
    scrubPct = Math.min(100, Math.max(0, ((currentDistM - corner.entryDistM) / span) * 100));
    const pt = currentIndex !== undefined ? primaryPoints[currentIndex] : undefined;
    currentSpeed = typeof pt?.speedKmh === 'number'
      ? Math.round(pt.speedKmh)
      : Math.round(interpolatePointAtDistance(primaryPoints, primaryDists, currentDistM).speedKmh);

    // Check if current position falls into any handling event
    const ev = handlingEvents.find(e => currentDistM >= e.startDistM && currentDistM <= e.endDistM);
    if (ev) {
      const color = ev.isTireScrub ? 'text-lmu-loss-soft border-lmu-loss-strong/60 bg-lmu-loss-deep/90' : ev.type === 'understeer' ? 'text-lmu-info-soft border-lmu-info-strong/60 bg-lmu-info-deep/90' : 'text-lmu-warn-soft border-lmu-warn-strong/60 bg-lmu-warn-deep/90';
      currentHandling = { label: ev.isTireScrub ? 'SCRUB' : ev.type === 'understeer' ? 'US' : 'OS', color, deg: ev.peakDeg };
    }
  }

  return {
    primaryPath: toPath(primarySpeeds),
    baselinePath: baselineSpeeds.length > 0 ? toPath(baselineSpeeds) : '',
    minPct: Math.min(97, Math.max(3, ((corner.minDistM - corner.entryDistM) / span) * 100)),
    scrubPct,
    currentSpeed,
    currentHandling,
  };
}
