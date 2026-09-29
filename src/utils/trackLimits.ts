import { LapTrackLimit } from '../../shared/types/index.js';

export type TrackLimitSeverity = 'green' | 'yellow' | 'orange';

/**
 * Checks if a track limit incident was resolved with "No Further Action".
 */
export function isNoFurtherActionTrackLimit(tl: LapTrackLimit): boolean {
  if (tl.action && /no\s*further\s*action/i.test(tl.action)) {
    return true;
  }
  if (tl.description && /no\s*further\s*action/i.test(tl.description)) {
    return true;
  }
  if (tl.warningPoints === 0 && (!tl.action || !/warning/i.test(tl.action))) {
    return true;
  }
  return false;
}

/**
 * Extracts the points value from warningPoints, currentPoints, or description fallback.
 */
export function getTrackLimitPoints(tl: LapTrackLimit): number {
  if (tl.warningPoints !== undefined && !isNaN(tl.warningPoints)) {
    return tl.warningPoints;
  }
  if (tl.currentPoints !== undefined && !isNaN(tl.currentPoints)) {
    return tl.currentPoints;
  }
  if (tl.description) {
    const match = tl.description.match(/\+([0-9.]+)\s*pts/i);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return 0.25;
}

/**
 * Determines track limit severity color:
 * - 'green' if No Further Action
 * - 'yellow' for 0.25 or 0.50 points
 * - 'orange' for 0.75 and up
 */
export function getTrackLimitSeverity(tl: LapTrackLimit): TrackLimitSeverity {
  if (isNoFurtherActionTrackLimit(tl)) {
    return 'green';
  }

  const pts = getTrackLimitPoints(tl);

  if (pts >= 0.75 || (tl.currentPoints !== undefined && tl.currentPoints >= 0.75)) {
    return 'orange';
  }

  return 'yellow';
}

/**
 * Returns the highest severity among an array of track limits (orange > yellow > green).
 */
export function getWorstTrackLimitSeverity(tls?: LapTrackLimit[]): TrackLimitSeverity {
  if (!tls || tls.length === 0) return 'yellow';
  const severities = tls.map(getTrackLimitSeverity);
  if (severities.includes('orange')) return 'orange';
  if (severities.includes('yellow')) return 'yellow';
  return 'green';
}

/**
 * Returns Tailwind badge classes for a given track limit severity.
 */
export function getTrackLimitBadgeClasses(severity: TrackLimitSeverity): string {
  switch (severity) {
    case 'green':
      return 'bg-lmu-gain-strong/20 text-lmu-gain-soft border-lmu-gain-strong/40';
    case 'orange':
      return 'bg-lmu-orange-strong/20 text-lmu-orange-soft border-lmu-orange-strong/40';
    case 'yellow':
    default:
      return 'bg-lmu-warn-strong/20 text-lmu-warn-soft border-lmu-warn-strong/40';
  }
}

/**
 * Returns Tailwind pill classes for standings table summary.
 */
export function getTrackLimitStandingsPillClasses(severity: TrackLimitSeverity): string {
  switch (severity) {
    case 'green':
      return 'bg-lmu-gain-deep/60 text-lmu-gain-soft border-lmu-gain-strong/30';
    case 'orange':
      return 'bg-lmu-orange-deep/60 text-lmu-orange-soft border-lmu-orange-strong/40';
    case 'yellow':
    default:
      return 'bg-lmu-warn-deep/50 text-lmu-warn-soft border-lmu-warn-strong/30';
  }
}
