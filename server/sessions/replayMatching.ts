import { matchesTrack } from '../../shared/domain/paceCategory.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import type { ReplayLinkRejectionReason } from '../../shared/types/index.js';
import { ReplayFileEntry } from './sessionXmlTypes.js';

/** The session a replay is matched against: its XML start timestamp and the XML file's mtime (session end). */
export interface ReplayMatchTarget {
  trackVenue: string;
  trackCourse: string;
  sessionCode: string;
  sessionTimestampMs: number;
  xmlFileMtimeMs: number;
}

// A replay and its session XML are both written at session end; 10 minutes absorbs slow saves.
export const REPLAY_MATCH_WINDOW_MS = 600_000;

function matchesSessionCode(replayCodeRaw: string, sessionCodeRaw: string): boolean {
  const replayCode = replayCodeRaw.toLowerCase();
  const sessionCode = sessionCodeRaw.toLowerCase();
  if (replayCode === sessionCode) return true;
  if ((sessionCode === 'practice' || sessionCode.startsWith('p')) && replayCode.startsWith('p')) return true;
  if ((sessionCode === 'qualifying' || sessionCode.startsWith('q')) && replayCode.startsWith('q')) return true;
  if ((sessionCode === 'race' || sessionCode.startsWith('r')) && replayCode.startsWith('r')) return true;
  return false;
}

/**
 * How far apart the replay and the session are in time. A replay's mtime is when the VCR was saved,
 * i.e. the END of the recorded session, so it is compared with the XML mtime (also written at session
 * end); start-to-start uses the replay duration. Comparing replay end with session start is only a
 * fallback for replays without a known duration: in back-to-back races it lands on the PREVIOUS
 * race's replay, which ends minutes before the next race starts.
 */
export function replayTimeDistanceMs(replay: ReplayFileEntry, target: ReplayMatchTarget): number {
  const diffEnd = Math.abs(replay.mtime - target.xmlFileMtimeMs);
  if (!replay.durationSec) {
    return Math.min(diffEnd, Math.abs(replay.mtime - target.sessionTimestampMs));
  }
  const replayStart = replay.mtime - Math.round(replay.durationSec * 1000);
  return Math.min(diffEnd, Math.abs(replayStart - target.sessionTimestampMs));
}

function isExactTrackMatch(replay: ReplayFileEntry, target: ReplayMatchTarget): boolean {
  return matchesTrack(replay.trackName, target.trackVenue, target.trackCourse);
}

// Generic-vs-specific same-circuit match, only used when no exact-layout replay is available.
function isFallbackTrackMatch(replay: ReplayFileEntry, target: ReplayMatchTarget): boolean {
  const replaySpec = getCircuitSpecification(replay.trackName);
  const sessionSpec = getCircuitSpecification(target.trackVenue, target.trackCourse);

  if (replaySpec.layoutKey !== 'unknown' && sessionSpec.layoutKey !== 'unknown') {
    if (replaySpec.circuitId !== sessionSpec.circuitId) return false;
    return Boolean(replaySpec.isDefaultLayout || sessionSpec.isDefaultLayout);
  }

  if (replaySpec.layoutKey === 'unknown' && sessionSpec.layoutKey === 'unknown') {
    const normVcrTrack = replay.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normXmlCourse = (target.trackCourse || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normXmlVenue = target.trackVenue.toLowerCase().replace(/[^a-z0-9]/g, '');
    return Boolean(
      (normXmlCourse && (normXmlCourse.includes(normVcrTrack) || normVcrTrack.includes(normXmlCourse))) ||
      (!target.trackCourse && (normXmlVenue.includes(normVcrTrack) || normVcrTrack.includes(normXmlVenue)))
    );
  }

  return false;
}

/** Why `replay` cannot be the recording of the target session, or null when it can. */
export function replayLinkRejection(replay: ReplayFileEntry, target: ReplayMatchTarget): ReplayLinkRejectionReason | null {
  if (!matchesSessionCode(replay.sessionCode, target.sessionCode || '')) return 'session-type';
  if (replayTimeDistanceMs(replay, target) > REPLAY_MATCH_WINDOW_MS) return 'time-window';
  if (!isExactTrackMatch(replay, target) && !isFallbackTrackMatch(replay, target)) return 'layout';
  return null;
}

/** The replay recorded for the target session: exact layout first, then the closest in time. */
export function findMatchingReplay(replays: readonly ReplayFileEntry[], target: ReplayMatchTarget): ReplayFileEntry | undefined {
  const normSession = (target.sessionCode || '').toLowerCase();
  const sessionScoped = replays.filter(replay =>
    matchesSessionCode(replay.sessionCode, normSession) && replayTimeDistanceMs(replay, target) <= REPLAY_MATCH_WINDOW_MS
  );

  // 1. Exact track/layout match takes priority whenever one exists.
  const exactCandidates = sessionScoped.filter(replay => isExactTrackMatch(replay, target));
  if (exactCandidates.length > 0) {
    exactCandidates.sort((a, b) => {
      const aExactCode = a.sessionCode.toLowerCase() === normSession ? 0 : 1;
      const bExactCode = b.sessionCode.toLowerCase() === normSession ? 0 : 1;
      if (aExactCode !== bExactCode) return aExactCode - bExactCode;
      return replayTimeDistanceMs(a, target) - replayTimeDistanceMs(b, target);
    });
    return exactCandidates[0];
  }

  // 2. Fall back to generic-vs-specific same-circuit matches only when no exact-layout replay is available.
  const fallbackCandidates = sessionScoped.filter(replay => isFallbackTrackMatch(replay, target));
  if (fallbackCandidates.length === 0) return undefined;
  fallbackCandidates.sort((a, b) => replayTimeDistanceMs(a, target) - replayTimeDistanceMs(b, target));
  return fallbackCandidates[0];
}
