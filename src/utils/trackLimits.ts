import { LapTrackLimit } from '../../shared/types/index.js';

/** How much a track limit costs: cleared (no further action), a warning, or serious (0.75 points and up). */
export type TrackLimitSeverity = 'cleared' | 'warning' | 'serious';

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
 * Determines track limit severity:
 * - 'cleared' if No Further Action
 * - 'warning' for 0.25 or 0.50 points
 * - 'serious' for 0.75 and up
 */
export function getTrackLimitSeverity(tl: LapTrackLimit): TrackLimitSeverity {
  if (isNoFurtherActionTrackLimit(tl)) {
    return 'cleared';
  }

  const pts = getTrackLimitPoints(tl);

  if (pts >= 0.75 || (tl.currentPoints !== undefined && tl.currentPoints >= 0.75)) {
    return 'serious';
  }

  return 'warning';
}

/**
 * Returns the highest severity among an array of track limits (serious > warning > cleared).
 */
export function getWorstTrackLimitSeverity(tls?: LapTrackLimit[]): TrackLimitSeverity {
  if (!tls || tls.length === 0) return 'warning';
  const severities = tls.map(getTrackLimitSeverity);
  if (severities.includes('serious')) return 'serious';
  if (severities.includes('warning')) return 'warning';
  return 'cleared';
}

/**
 * Returns Tailwind badge classes for a given track limit severity: neutral when cleared (nothing
 * was gained or lost), warn for a warning, loss once the points are serious.
 */
export function getTrackLimitBadgeClasses(severity: TrackLimitSeverity): string {
  switch (severity) {
    case 'cleared':
      return 'bg-lmu-raised text-lmu-text-soft border-lmu-rule';
    case 'serious':
      return 'bg-lmu-loss-strong/20 text-lmu-loss-soft border-lmu-loss-strong/40';
    case 'warning':
    default:
      return 'bg-lmu-warn-strong/20 text-lmu-warn-soft border-lmu-warn-strong/40';
  }
}

/**
 * Returns Tailwind pill classes for standings table summary.
 */
export function getTrackLimitStandingsPillClasses(severity: TrackLimitSeverity): string {
  switch (severity) {
    case 'cleared':
      return 'bg-lmu-raised text-lmu-text-soft border-lmu-rule';
    case 'serious':
      return 'bg-lmu-loss-deep/60 text-lmu-loss-soft border-lmu-loss-strong/40';
    case 'warning':
    default:
      return 'bg-lmu-warn-deep/50 text-lmu-warn-soft border-lmu-warn-strong/30';
  }
}
