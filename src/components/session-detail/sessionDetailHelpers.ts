import { DetailedSession } from '../../../server/types.js';
import { parseDateStringToTimestamp } from '../../utils/formatters.js';
import { matchesTrack } from '../../utils/paceCategory.js';

export const OPPONENT_COLORS = [
  '#38BDF8', // sky
  '#34D399', // emerald
  '#A78BFA', // purple
  '#F472B6', // pink
  '#FB923C', // orange
  '#E2E8F0', // slate
  '#4ADE80', // green
  '#2DD4BF', // teal
  '#818CF8', // indigo
  '#C084FC', // fuchsia
  '#F87171', // red
  '#94A3B8', // cool gray
];

export const PLAYER_HIGHLIGHT_COLOR = '#FBBF24'; // Vibrant Gold Accent

export interface CandidateRelatedSession {
  id?: string;
  sessionId?: string;
  sessionType?: string;
  sessionName?: string;
  trackVenue?: string;
  trackCourse?: string;
  timeString?: string;
  dateString?: string;
  timestamp?: number;
  filename?: string;
}

export function findClosestSession<T extends CandidateRelatedSession>(current: DetailedSession, candidates: T[]): T | null {
  if (candidates.length <= 1) return candidates[0] || null;

  const currentTime = current.timestamp || parseDateStringToTimestamp(current.timeString);
  let best: T = candidates[0];
  let minDiff = Infinity;

  for (const cand of candidates) {
    const candTime = cand.timestamp || parseDateStringToTimestamp(cand.timeString);
    const diff = Math.abs(currentTime - candTime);
    if (diff < minDiff) {
      minDiff = diff;
      best = cand;
    }
  }

  return best;
}

export function findRelatedSession<T extends CandidateRelatedSession>(
  current: DetailedSession | null,
  sessions: T[]
): { type: 'qualifying' | 'race'; target: T } | null {
  if (!current || !sessions || sessions.length === 0) return null;

  const currentType = (current.sessionType || '').toLowerCase();
  const currentName = (current.sessionName || '').toLowerCase();
  const isRace = currentType === 'race' || currentName.startsWith('r');
  const isQuali = currentType.includes('qual') || currentName.startsWith('q');
  const isPractice = currentType.includes('practice') || currentName.startsWith('p');

  // Race -> Quali; Quali -> Race; Practice -> Race or Quali
  const targetType: 'qualifying' | 'race' | null = isRace ? 'qualifying' : (isQuali || isPractice) ? 'race' : null;
  if (!targetType) return null;

  const targetSessions = sessions.filter((s) => {
    const sId = s.id || s.sessionId;
    if (sId === current.id) return false;
    const t = (s.sessionType || '').toLowerCase();
    const n = (s.sessionName || '').toLowerCase();
    if (targetType === 'qualifying') {
      return t.includes('qual') || n.startsWith('q');
    }
    if (targetType === 'race') {
      return t === 'race' || n.startsWith('r');
    }
    return false;
  });

  if (targetSessions.length === 0) {
    if (isPractice) {
      const qualiSessions = sessions.filter((s) => {
        const sId = s.id || s.sessionId;
        if (sId === current.id) return false;
        const t = (s.sessionType || '').toLowerCase();
        const n = (s.sessionName || '').toLowerCase();
        return t.includes('qual') || n.startsWith('q');
      });
      if (qualiSessions.length > 0) {
        const target = findClosestSession(current, qualiSessions);
        return target ? { type: 'qualifying', target } : null;
      }
    }
    return null;
  }

  // 1. Direct filename/ID pattern match: e.g. 2026_05_28_R1 <-> 2026_05_28_Q1
  const currentId = current.id;
  const directIdPattern = isRace
    ? currentId.replace(/([_.-])R(\d*)$/i, '$1Q$2')
    : currentId.replace(/([_.-])Q(\d*)$/i, '$1R$2');

  if (directIdPattern !== currentId) {
    const directMatch = targetSessions.find((s) => {
      const sId = s.id || s.sessionId;
      return sId === directIdPattern || s.filename === `${directIdPattern}.xml`;
    });
    if (directMatch) {
      return { type: targetType, target: directMatch };
    }
  }

  // 2. Same track match, closest in time
  const sameTrackSessions = targetSessions.filter(
    (s) =>
      matchesTrack(current.trackVenue, s.trackVenue, s.trackCourse) ||
      s.trackVenue?.toLowerCase() === current.trackVenue?.toLowerCase()
  );

  const candidatePool = sameTrackSessions.length > 0 ? sameTrackSessions : targetSessions;
  const bestMatch = findClosestSession(current, candidatePool);

  return bestMatch ? { type: targetType, target: bestMatch } : null;
}
