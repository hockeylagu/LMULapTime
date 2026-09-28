import { matchesTrack } from '../../shared/domain/paceCategory.js';
import { getCircuitSpecification, type CircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import type { ReplayLinkRejectionReason } from '../../shared/types/index.js';
import type { StoredReplayFileInfo } from '../core/replay/dbReplayMetadataStore.js';
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

/** The replay's layout: its recorded engine scene when known (ground truth), else its filename's track. */
function replayLayoutSpec(replay: ReplayFileEntry): CircuitSpecification {
  if (replay.sceneDesc) {
    const byScene = getCircuitSpecification(undefined, undefined, replay.sceneDesc);
    if (byScene.layoutKey !== 'unknown') return byScene;
  }
  return getCircuitSpecification(replay.trackName);
}

/**
 * Same layout, never just the same facility: when both layouts are known they must be equal (Monza GP
 * is not Curva Grande, Sebring is not the School circuit). Names are only compared when a layout is
 * unknown.
 */
function isSameLayout(replay: ReplayFileEntry, target: ReplayMatchTarget): boolean {
  const replaySpec = replayLayoutSpec(replay);
  const sessionSpec = getCircuitSpecification(target.trackVenue, target.trackCourse);
  if (replaySpec.layoutKey !== 'unknown' && sessionSpec.layoutKey !== 'unknown') {
    return replaySpec.layoutKey === sessionSpec.layoutKey;
  }
  if (matchesTrack(replay.trackName, target.trackVenue, target.trackCourse)) return true;
  if (replaySpec.layoutKey !== 'unknown' || sessionSpec.layoutKey !== 'unknown') return false;

  const normVcrTrack = replay.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normXmlCourse = (target.trackCourse || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normXmlVenue = target.trackVenue.toLowerCase().replace(/[^a-z0-9]/g, '');
  return Boolean(
    (normXmlCourse && (normXmlCourse.includes(normVcrTrack) || normVcrTrack.includes(normXmlCourse))) ||
    (!target.trackCourse && (normXmlVenue.includes(normVcrTrack) || normVcrTrack.includes(normXmlVenue)))
  );
}

/** Why `replay` cannot be the recording of the target session, or null when it can. */
export function replayLinkRejection(replay: ReplayFileEntry, target: ReplayMatchTarget): ReplayLinkRejectionReason | null {
  if (!matchesSessionCode(replay.sessionCode, target.sessionCode || '')) return 'session-type';
  if (replayTimeDistanceMs(replay, target) > REPLAY_MATCH_WINDOW_MS) return 'time-window';
  if (!isSameLayout(replay, target)) return 'layout';
  return null;
}

/** The replay recorded for the target session: same layout, exact session code first, then the closest in time. */
export function findMatchingReplay(replays: readonly ReplayFileEntry[], target: ReplayMatchTarget): ReplayFileEntry | undefined {
  const normSession = (target.sessionCode || '').toLowerCase();
  const candidates = replays.filter(replay => replayLinkRejection(replay, target) === null);
  candidates.sort((a, b) => {
    const aExactCode = a.sessionCode.toLowerCase() === normSession ? 0 : 1;
    const bExactCode = b.sessionCode.toLowerCase() === normSession ? 0 : 1;
    if (aExactCode !== bExactCode) return aExactCode - bExactCode;
    return replayTimeDistanceMs(a, target) - replayTimeDistanceMs(b, target);
  });
  return candidates[0];
}

/** The replay index entry for a stored replay row (the filename names the track and session code). */
export function replayIndexEntryFromStored(stored: StoredReplayFileInfo & { filename: string }): ReplayFileEntry {
  const match = stored.filename.match(/^(.+?)\s+([PQR]\d+)\b/i);
  const metadata = stored.metadata;
  return {
    name: stored.filename,
    path: stored.file_path,
    sizeBytes: stored.file_size,
    trackName: match ? match[1].trim() : (metadata.trackVenue || metadata.trackCourse || metadata.trackName || stored.filename.replace(/\.vcr$/i, '')),
    sessionCode: match ? match[2].toUpperCase() : (metadata.sessionType || ''),
    mtime: stored.file_mtime,
    eventTitle: metadata.eventInfo?.eventTitle,
    splitNo: metadata.eventInfo?.splitNo,
    eventType: metadata.eventInfo?.eventType,
    durationSec: metadata.durationSec,
    sceneDesc: metadata.sceneDesc || metadata.eventInfo?.sceneDesc || undefined,
    hasRain: metadata.hasRain,
    maxRainIntensity: metadata.maxRainIntensity,
    weatherCondition: metadata.weatherCondition,
    ambientTemp: metadata.ambientTemp,
    trackTemp: metadata.trackTemp,
  };
}

/**
 * The one session a replay records when several claim it (LMU can save a single replay for a run of
 * sessions): an exact session code first, then the closest in time; the id breaks exact ties.
 */
export function pickReplayOwner(replay: ReplayFileEntry, claimants: ReadonlyArray<{ id: string; target: ReplayMatchTarget }>): string | undefined {
  const rank = (claimant: { id: string; target: ReplayMatchTarget }) => ({
    code: replay.sessionCode.toLowerCase() === (claimant.target.sessionCode || '').toLowerCase() ? 0 : 1,
    distance: replayTimeDistanceMs(replay, claimant.target),
  });
  const ranked = claimants.map(claimant => ({ id: claimant.id, ...rank(claimant) }));
  ranked.sort((a, b) => a.code - b.code || a.distance - b.distance || a.id.localeCompare(b.id));
  return ranked[0]?.id;
}
