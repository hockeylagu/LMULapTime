import { CIRCUIT_SPECIFICATIONS, type CircuitSpecification } from '../../shared/domain/circuitDefinitions.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import type { ReplayLinkRejectionReason } from '../../shared/types/index.js';
import type { StoredReplayFileInfo } from '../core/replay/dbReplayMetadataStore.js';
import { ReplayFileEntry } from './sessionXmlTypes.js';

/** The session a replay is matched against: its XML start timestamp and the XML file's mtimeMs (session end). */
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
 * How far apart the replay and the session are in time. A replay's mtimeMs is when the VCR was saved,
 * i.e. the END of the recorded session, so it is compared with the XML mtimeMs (also written at session
 * end); start-to-start uses the replay duration. Comparing replay end with session start is only a
 * fallback for replays without a known duration: in back-to-back races it lands on the PREVIOUS
 * race's replay, which ends minutes before the next race starts.
 */
export function replayTimeDistanceMs(replay: ReplayFileEntry, target: ReplayMatchTarget): number {
  const diffEnd = Math.abs(replay.mtimeMs - target.xmlFileMtimeMs);
  if (!replay.durationSec) {
    return Math.min(diffEnd, Math.abs(replay.mtimeMs - target.sessionTimestampMs));
  }
  const replayStart = replay.mtimeMs - Math.round(replay.durationSec * 1000);
  return Math.min(diffEnd, Math.abs(replayStart - target.sessionTimestampMs));
}

/** The replay's layout: its recorded engine scene when known (ground truth), else its filename's track. */
function replayLayoutSpec(replay: ReplayFileEntry): CircuitSpecification {
  const sceneSpec = getCircuitSpecification(undefined, undefined, replay.sceneDesc);
  if (Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, sceneSpec.layoutKey)) return sceneSpec;
  const venue = replay.trackVenue || replay.trackName;
  return getCircuitSpecification(venue, replay.trackCourse);
}

/**
 * Same layout, never just the same facility: when both layouts are known they must be equal (Monza GP
 * is not Curva Grande, Sebring is not the School circuit). Names are only compared when a layout is
 * unknown.
 */
function isSameLayout(replay: ReplayFileEntry, target: ReplayMatchTarget): boolean {
  const replaySpec = replayLayoutSpec(replay);
  const sessionSpec = getCircuitSpecification(target.trackVenue, target.trackCourse);
  const replayKnown = Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, replaySpec.layoutKey);
  const sessionKnown = Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, sessionSpec.layoutKey);
  if (replayKnown && sessionKnown) {
    return replaySpec.layoutKey === sessionSpec.layoutKey;
  }
  return !replayKnown && !sessionKnown && Boolean(replay.trackVenue) && replay.trackVenue === target.trackVenue
    && (replay.trackCourse ?? '') === (target.trackCourse ?? '');
}

/** Identity constraints that remain judgeable when the source XML has no stored mtimeMs. */
export function replayLinkIdentityRejection(replay: ReplayFileEntry, target: ReplayMatchTarget): ReplayLinkRejectionReason | null {
  if (!matchesSessionCode(replay.sessionCode, target.sessionCode || '')) return 'session-type';
  return isSameLayout(replay, target) ? null : 'layout';
}

/** Why `replay` cannot be the recording of the target session, or null when it can. */
export function replayLinkRejection(replay: ReplayFileEntry, target: ReplayMatchTarget): ReplayLinkRejectionReason | null {
  if (!matchesSessionCode(replay.sessionCode, target.sessionCode || '')) return 'session-type';
  if (replayTimeDistanceMs(replay, target) > REPLAY_MATCH_WINDOW_MS) return 'time-window';
  return isSameLayout(replay, target) ? null : 'layout';
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
    fileSizeBytes: stored.file_size_bytes,
    trackName: match ? match[1].trim() : (metadata.trackVenue || metadata.trackCourse || metadata.trackName || stored.filename.replace(/\.vcr$/i, '')),
    trackVenue: metadata.trackVenue,
    trackCourse: metadata.trackCourse,
    sessionCode: match ? match[2].toUpperCase() : (metadata.sessionType || ''),
    mtimeMs: stored.file_mtime_ms,
    eventTitle: metadata.eventInfo?.eventTitle,
    splitNo: metadata.eventInfo?.splitNo,
    eventType: metadata.eventInfo?.eventType,
    durationSec: metadata.durationSec,
    sceneDesc: metadata.sceneDesc || undefined,
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
