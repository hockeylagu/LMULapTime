import fs from 'fs';
import type { DetailedSession, ReplayMetadata } from '../core/types.js';
import type { TelemetryLink, TelemetryMetadataRecord } from '../core/dbTelemetryStore.js';
import type { ReplayFileEntry } from '../sessions/sessionXmlTypes.js';
import {
  DuckDbFileInfo,
  DuckDbMatch,
  findDuckDbForReplay,
  findDuckDbForSession,
  sessionEpochMs,
} from './telemetryMatcher.js';

// Which session or replay a DuckDB file records is decided once and stored in telemetry_metadata.
// Every view (session list, replay list, replay metadata, trajectory) reads the stored match
// through TelemetryLinks, so they can't disagree, and none of them matches files on its own.

/**
 * The matching rule the stored matches were decided under. Changing it clears the stored matches
 * once so they are decided again (SessionDatabase.resetTelemetryLinksForRule).
 */
export const TELEMETRY_LINK_RULE = 'one-to-one-v1';

const SESSION_WINDOW_SEC = 3600;
const REPLAY_WINDOW_SEC = 300;

export interface TelemetryLinkInput {
  /** Every catalogued file, including files no longer on disk. */
  files: DuckDbFileInfo[];
  stored: TelemetryMetadataRecord[];
  sessions: DetailedSession[];
  replays: ReplayFileEntry[];
  loadReplayMetadata: (replayName: string) => ReplayMetadata | null;
}

interface Proposal<T> {
  owner: T;
  key: string;
  match: DuckDbMatch;
}

/**
 * Hands free files out one to one. Each owner proposes its best free file; a file proposed by
 * several owners goes to the closest in time (the key breaks exact ties). Owners that lost propose
 * again among the files still free, until no file is handed out.
 */
function assignOneToOne<T>(
  owners: T[],
  free: Map<string, DuckDbFileInfo>,
  keyOf: (owner: T) => string,
  propose: (owner: T, pool: DuckDbFileInfo[]) => DuckDbMatch | null,
  assign: (owner: T, file: DuckDbFileInfo) => void
): void {
  let pending = owners;
  while (pending.length > 0 && free.size > 0) {
    const pool = [...free.values()];
    const byFile = new Map<string, Proposal<T>>();
    for (const owner of pending) {
      const match = propose(owner, pool);
      if (!match) continue;
      const key = keyOf(owner);
      const current = byFile.get(match.file.filename);
      if (!current || match.deltaSec < current.match.deltaSec || (match.deltaSec === current.match.deltaSec && key < current.key)) {
        byFile.set(match.file.filename, { owner, key, match });
      }
    }
    if (byFile.size === 0) return;
    const winners = new Set<T>();
    for (const proposal of byFile.values()) {
      free.delete(proposal.match.file.filename);
      winners.add(proposal.owner);
      assign(proposal.owner, proposal.match.file);
    }
    pending = pending.filter(owner => !winners.has(owner));
  }
}

const withinWindow = (fileMs: number, targetMs: number, windowSec: number): boolean =>
  fileMs <= 0 || targetMs <= 0 || Math.abs(fileMs - targetMs) <= windowSec * 1000;

/**
 * Decides the matches of files, sessions and replays that have none stored: sessions first, then
 * replays whose session has no file. A stored match is never revisited.
 */
export function decideTelemetryLinks(input: TelemetryLinkInput): TelemetryLink[] {
  const linkedSessions = new Set<string>();
  const linkedReplays = new Set<string>();
  const claimed = new Set<string>();
  for (const row of input.stored) {
    if (row.matchedSessionId) linkedSessions.add(row.matchedSessionId);
    if (row.matchedReplayFilename) linkedReplays.add(row.matchedReplayFilename);
    if (row.matchedSessionId || row.matchedReplayFilename) claimed.add(row.filename);
  }
  const free = new Map(input.files.filter(file => !claimed.has(file.filename)).map(file => [file.filename, file] as const));
  const links: TelemetryLink[] = [];

  const sessionIsLinked = (session: DetailedSession) => linkedSessions.has(session.id)
    || Boolean(session.matchingReplayFile && linkedReplays.has(session.matchingReplayFile.name));

  assignOneToOne(
    input.sessions.filter(session => !sessionIsLinked(session)),
    free,
    session => session.id,
    (session, pool) => {
      const startMs = sessionEpochMs(session);
      return findDuckDbForSession(pool.filter(file => withinWindow(file.timestampEpochMs, startMs, SESSION_WINDOW_SEC)), session, SESSION_WINDOW_SEC);
    },
    (session, file) => {
      const replayName = session.matchingReplayFile?.name;
      const withReplay = replayName && !linkedReplays.has(replayName) ? replayName : null;
      links.push({ filename: file.filename, sessionId: session.id, replayName: withReplay });
      linkedSessions.add(session.id);
      if (withReplay) linkedReplays.add(withReplay);
    }
  );

  const ownerOf = new Map<string, DetailedSession>();
  for (const session of input.sessions) {
    if (session.matchingReplayFile) ownerOf.set(session.matchingReplayFile.name, session);
  }
  const replayStartMs = (replay: ReplayFileEntry) => replay.durationSec && replay.durationSec > 0
    ? replay.mtime - Math.round(replay.durationSec * 1000)
    : replay.mtime;
  const nearFreeFile = (replay: ReplayFileEntry, pool: DuckDbFileInfo[]) => pool.filter(file =>
    withinWindow(file.timestampEpochMs, replay.mtime, REPLAY_WINDOW_SEC) || withinWindow(file.timestampEpochMs, replayStartMs(replay), REPLAY_WINDOW_SEC));
  const metadataCache = new Map<string, ReplayMetadata | null>();
  const metadataOf = (name: string) => {
    if (!metadataCache.has(name)) metadataCache.set(name, input.loadReplayMetadata(name));
    return metadataCache.get(name) ?? null;
  };

  assignOneToOne(
    input.replays.filter(replay => {
      if (linkedReplays.has(replay.name)) return false;
      const owner = ownerOf.get(replay.name);
      return !(owner && linkedSessions.has(owner.id)) && nearFreeFile(replay, [...free.values()]).length > 0;
    }),
    free,
    replay => replay.name,
    (replay, pool) => {
      const candidates = nearFreeFile(replay, pool);
      const metadata = candidates.length > 0 ? metadataOf(replay.name) : null;
      return metadata ? findDuckDbForReplay(candidates, metadata, replay.mtime, REPLAY_WINDOW_SEC) : null;
    },
    (replay, file) => {
      const owner = ownerOf.get(replay.name);
      const sessionId = owner && !linkedSessions.has(owner.id) ? owner.id : null;
      links.push({ filename: file.filename, sessionId, replayName: replay.name });
      linkedReplays.add(replay.name);
      if (sessionId) linkedSessions.add(sessionId);
    }
  );

  return links;
}

export interface TelemetryLinkSource {
  getTelemetryMetadata(): TelemetryMetadataRecord[];
  getTelemetryLapCacheFilenames(): Set<string>;
}

/**
 * The stored matches, as every view reads them. A matched file counts only while it can serve
 * telemetry: it is still on disk, or some of its laps are cached.
 */
export class TelemetryLinks {
  private readonly availability = new Map<string, boolean>();

  private constructor(
    private readonly rows: Map<string, TelemetryMetadataRecord>,
    private readonly bySession: Map<string, string>,
    private readonly byReplay: Map<string, string>,
    private readonly cachedFilenames: Set<string>
  ) {}

  public static load(source: TelemetryLinkSource): TelemetryLinks {
    const rows = new Map<string, TelemetryMetadataRecord>();
    const bySession = new Map<string, string>();
    const byReplay = new Map<string, string>();
    for (const row of source.getTelemetryMetadata()) {
      rows.set(row.filename, row);
      if (row.matchedSessionId) bySession.set(row.matchedSessionId, row.filename);
      if (row.matchedReplayFilename) byReplay.set(row.matchedReplayFilename, row.filename);
    }
    return new TelemetryLinks(rows, bySession, byReplay, source.getTelemetryLapCacheFilenames());
  }

  /** The session's file, else its replay's file. */
  public forSession(session: Pick<DetailedSession, 'id' | 'matchingReplayFile'>): string | undefined {
    const replayName = session.matchingReplayFile?.name;
    return this.available(this.bySession.get(session.id) ?? (replayName ? this.byReplay.get(replayName) : undefined));
  }

  /** The file of the session the replay belongs to, else the replay's own file. */
  public forReplay(replayName: string, owner?: Pick<DetailedSession, 'id'>): string | undefined {
    return this.available((owner ? this.bySession.get(owner.id) : undefined) ?? this.byReplay.get(replayName));
  }

  public row(filename: string): TelemetryMetadataRecord | undefined {
    return this.rows.get(filename);
  }

  public isOnDisk(filename: string): boolean {
    const row = this.rows.get(filename);
    return Boolean(row && fs.existsSync(row.filePath));
  }

  private available(filename: string | undefined): string | undefined {
    if (!filename) return undefined;
    let available = this.availability.get(filename);
    if (available === undefined) {
      available = this.cachedFilenames.has(filename) || this.isOnDisk(filename);
      this.availability.set(filename, available);
    }
    return available ? filename : undefined;
  }
}
