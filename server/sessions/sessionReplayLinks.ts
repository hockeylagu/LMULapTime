import fs from 'fs';
import type { LmuParser } from './parser.js';
import type { ReplayFileEntry } from './sessionXmlTypes.js';
import { pickReplayOwner, replayLinkRejection, ReplayMatchTarget } from './replayMatching.js';
import type { SessionDatabase } from '../core/db.js';
import { DetailedSession, RejectedReplayLink, ReplayLinkRejectionReason } from '../core/types.js';

type ReplayLinkStore = Pick<SessionDatabase, 'updateSessionMatchingReplay' | 'rejectSessionReplayLink'> &
  Partial<Pick<SessionDatabase, 'getRejectedReplayLinks' | 'getSessionsLinkedToRecording' | 'getSessionXmlMtime'>>;

/**
 * Keeps each session's replay link true to the matching rules (replayMatching.ts): links sessions
 * whose replay was cached after them, re-checks stored links, withdraws failing ones (recorded in
 * rejected_replay_links, never relinked) and gives a replay to one session only.
 */
export class SessionReplayLinks {
  public constructor(private readonly db: ReplayLinkStore) {}

  /** Links, re-checks and de-duplicates the replay links of `sessions` against the parser's replay index. */
  public linkSessions(sessions: DetailedSession[], parser: LmuParser, replaysByName: Pick<ReadonlyMap<string, ReplayFileEntry>, 'get'>): void {
    const rejectedLinks = typeof this.db.getRejectedReplayLinks === 'function'
      ? this.db.getRejectedReplayLinks(sessions.map(session => session.id))
      : new Map<string, RejectedReplayLink[]>();

    for (const session of sessions) {
      if (session.matchingReplayFile) {
        this.recheckStoredReplayMatch(session, parser, replaysByName);
      } else {
        // Sessions parsed before their replay was cached (the replay sync runs after the
        // session sync) are linked here. The XML mtime is the real session end; the last-lap
        // estimate can be 15+ minutes early (post-race cool-down), outside the match window.
        const matchedReplay = parser.findMatchingReplay(
          session.trackVenue,
          session.trackCourse,
          session.sessionName || session.sessionType,
          session.timestamp,
          this.xmlMtime(session) ?? this.estimateSessionEndMs(session)
        );
        // A replay withdrawn from this session is never linked to it again.
        const withdrawn = rejectedLinks.get(session.id)?.some(link => link.replayName === matchedReplay?.name);
        if (matchedReplay && !withdrawn) {
          session.matchingReplayFile = this.toReplayLink(matchedReplay);
          this.db.updateSessionMatchingReplay(session.id, session.matchingReplayFile);
        }
      }
    }
    this.enforceOneSessionPerReplay(sessions, replaysByName);
  }

  /** Write-once XML end time comes from ingestion; missing stored values fall back to disk and retry failures. */
  public xmlMtime(session: DetailedSession): number | undefined {
    const stored = this.db.getSessionXmlMtime?.(session.id, session.filePath);
    if (stored !== undefined) return stored;
    if (!session.filePath) return undefined;
    try {
      return fs.statSync(session.filePath).mtimeMs;
    } catch {
      return undefined;
    }
  }

  private estimateSessionEndMs(session: DetailedSession): number {
    let maxElapsed = 0;
    for (const d of session.drivers ?? []) {
      for (const l of d.laps ?? []) {
        if (typeof l.elapsedSeconds === 'number' && l.elapsedSeconds > maxElapsed) {
          maxElapsed = l.elapsedSeconds;
        }
      }
    }
    return session.timestamp + Math.round(maxElapsed * 1000);
  }

  private toReplayLink(replay: ReplayFileEntry): NonNullable<DetailedSession['matchingReplayFile']> {
    return {
      name: replay.name,
      path: replay.path,
      sizeBytes: replay.sizeBytes,
      eventTitle: replay.eventTitle,
      splitNo: replay.splitNo,
      eventType: replay.eventType,
      durationSec: replay.durationSec,
      hasRain: replay.hasRain,
      maxRainIntensity: replay.maxRainIntensity,
      weatherCondition: replay.weatherCondition,
      ambientTemp: replay.ambientTemp,
      trackTemp: replay.trackTemp,
    };
  }

  private relinkSession(session: DetailedSession, replay: ReplayFileEntry): void {
    console.log(`[Replay Links] Re-matched session ${session.id}: ${session.matchingReplayFile?.name} -> ${replay.name}`);
    session.matchingReplayFile = this.toReplayLink(replay);
    this.db.updateSessionMatchingReplay(session.id, session.matchingReplayFile);
  }

  /**
   * Re-validates a stored match against the current matching rules, which older builds did not
   * enforce (e.g. every session of a practice run linked to the one replay LMU saved at its end).
   * A match that fails them is replaced by the session's own replay when there is one, and withdrawn
   * otherwise (recorded in rejected_replay_links). A valid match is only replaced by a replay saved
   * within SAME_SAVE_WINDOW_MS of the XML: LMU saves both within about a second at session end, and
   * the stored match can predate that replay being cached (the replay sync runs after the session sync).
   */
  private recheckStoredReplayMatch(session: DetailedSession, parser: LmuParser, replaysByName: Pick<ReadonlyMap<string, ReplayFileEntry>, 'get'>): void {
    const SAME_SAVE_WINDOW_MS = 60_000;
    const stored = session.matchingReplayFile;
    if (!stored) return;
    // Without the replay's timing or the XML's mtime the match cannot be judged: keep it.
    const current = replaysByName.get(stored.name);
    const xmlMtime = this.xmlMtime(session);
    if (!current || xmlMtime === undefined) return;

    const target = this.matchTarget(session, xmlMtime);
    const rejection = replayLinkRejection(current, target);
    if (!rejection && Math.abs(current.mtime - xmlMtime) <= SAME_SAVE_WINDOW_MS) return;

    const candidate = parser.findMatchingReplay(
      target.trackVenue, target.trackCourse, target.sessionCode, target.sessionTimestampMs, target.xmlFileMtimeMs
    );
    const isOwnReplay = candidate && candidate.name !== stored.name &&
      (rejection || Math.abs(candidate.mtime - xmlMtime) <= SAME_SAVE_WINDOW_MS);
    if (candidate && isOwnReplay) {
      this.relinkSession(session, candidate);
      return;
    }
    if (rejection) this.withdrawReplayLink(session, rejection);
  }

  private matchTarget(session: DetailedSession, xmlFileMtimeMs: number): ReplayMatchTarget {
    return {
      trackVenue: session.trackVenue,
      trackCourse: session.trackCourse,
      sessionCode: session.sessionName || session.sessionType,
      sessionTimestampMs: session.timestamp,
      xmlFileMtimeMs,
    };
  }

  private withdrawReplayLink(session: DetailedSession, reason: ReplayLinkRejectionReason): void {
    const stored = session.matchingReplayFile;
    if (!stored) return;
    console.log(`[Replay Links] Withdrew replay ${stored.name} from session ${session.id} (${reason})`);
    this.db.rejectSessionReplayLink(session.id, stored, reason);
    delete session.matchingReplayFile;
  }

  /**
   * A replay records one session. LMU can save a single replay for a run of sessions (restarting a
   * practice keeps the file), so several sessions can each pass the matching rules against it: the
   * closest one keeps it and the others lose it. A replay the index does not know cannot be judged.
   */
  private enforceOneSessionPerReplay(sessions: DetailedSession[], replaysByName: Pick<ReadonlyMap<string, ReplayFileEntry>, 'get'>): void {
    const claimsByReplay = new Map<string, DetailedSession[]>();
    for (const session of sessions) {
      const name = session.matchingReplayFile?.name;
      if (!name) continue;
      const claims = claimsByReplay.get(name) ?? [];
      claims.push(session);
      claimsByReplay.set(name, claims);
    }
    for (const [name, claims] of claimsByReplay) {
      const byId = new Map((this.db.getSessionsLinkedToRecording?.(name) ?? []).map(session => [session.id, session] as const));
      for (const session of claims) byId.set(session.id, session);
      claimsByReplay.set(name, [...byId.values()]);
    }
    for (const [name, claims] of claimsByReplay) {
      const replay = replaysByName.get(name);
      if (claims.length < 2 || !replay) continue;
      const ownerId = pickReplayOwner(replay, claims.map(session => ({
        id: session.id,
        target: this.matchTarget(session, this.xmlMtime(session) ?? this.estimateSessionEndMs(session)),
      })));
      for (const session of claims) {
        if (session.id !== ownerId) this.withdrawReplayLink(session, 'owned-by-other-session');
      }
    }
  }
}
