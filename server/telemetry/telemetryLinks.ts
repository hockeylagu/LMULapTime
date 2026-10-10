import fs from 'fs';
import type { DetailedSession, ReplayMetadata } from '../core/types.js';
import type { TelemetryLink, TelemetryMetadataRecord } from '../core/dbTelemetryStore.js';
import type { ReplayFileEntry } from '../sessions/sessionXmlTypes.js';
import {
  DuckDbFileInfo,
  findDuckDbForReplay,
  findDuckDbForSession,
  sessionEpochMs,
} from './telemetryMatcher.js';

// Which session or replay a DuckDB file records is decided once and stored in telemetry_metadata.
// Every view (session list, replay list, replay metadata, trajectory) reads the stored matches
// through TelemetryLinks, so they can't disagree, and none of them matches files on its own.
//
// LMU can write several files for one session: short 0-lap files seconds before the real one, and
// a new file when the car goes out again mid-session (lap numbers carry on across the files). A
// session therefore owns every file recorded while it ran; each file belongs to one session.

/**
 * The matching rule the stored matches were decided under. Changing it clears the stored matches
 * once so they are decided again (SessionDatabase.resetTelemetryLinksForRule).
 */
export const TELEMETRY_LINK_RULE = 'session-span-v2';

/** Clock slack between the file name's timestamp and the session or replay times. */
const SLACK_MS = 120_000;
/** Session length assumed when its end is unknown. */
const DEFAULT_SESSION_MS = 3600_000;
/** Any time distance: the span check below decides the timing, the matcher only track, type and driver. */
const ANY_DELTA_SEC = Number.MAX_SAFE_INTEGER;

/** The longest session a file may sit in: a 24-hour race with its formation and the XML save. */
const LONGEST_SESSION_MS = 26 * 3600_000;
/** Files decided together share one candidate window; a wider spread starts a new chunk. */
const CHUNK_SPREAD_MS = 6 * 3600_000;
const CHUNK_FILES = 10;

/**
 * Where the owner of a file recorded between fromMs and toMs can be (ownerAt's spans): sessions
 * that started up to the longest session before it, replays whose recording overlaps it.
 */
export function telemetryCandidateWindow(fromMs: number, toMs: number) {
  return {
    sessionsFromMs: fromMs - LONGEST_SESSION_MS - SLACK_MS, sessionsToMs: toMs + SLACK_MS,
    replaysFromMs: fromMs - SLACK_MS, replaysToMs: toMs + SLACK_MS,
  };
}

/** Time-ordered files in chunks small and close enough that their candidate windows stay bounded. */
export function *telemetryFileChunks(files: DuckDbFileInfo[]): Generator<DuckDbFileInfo[]> {
  let chunk: DuckDbFileInfo[] = [];
  for (const file of files) {
    if (chunk.length === CHUNK_FILES || (chunk.length > 0 && file.timestampEpochMs - chunk[0].timestampEpochMs > CHUNK_SPREAD_MS)) {
      yield chunk;
      chunk = [];
    }
    chunk.push(file);
  }
  if (chunk.length > 0) yield chunk;
}

export interface TelemetryLinkInput {
  /** Every catalogued file, including files no longer on disk. */
  files: DuckDbFileInfo[];
  stored: TelemetryMetadataRecord[];
  sessions: DetailedSession[];
  replays: ReplayFileEntry[];
  loadReplayMetadata: (replayName: string) => ReplayMetadata | null;
  /** When the session ended (its results XML was written), if known. */
  sessionEndMs?: (session: DetailedSession) => number | undefined;
  /** Replay name -> its linked session id, for replays whose session is not among the sessions given. */
  replayOwnerByName?: ReadonlyMap<string, string>;
}

interface Span<T> {
  owner: T;
  startMs: number;
  endMs: number;
}

/**
 * The owner running when the file started: among owners whose span holds the file's timestamp,
 * the one that started last. The 0-lap sessions LMU saves after a session start after its files.
 * Restarted races can retain the same XML start: prefer the first of those sessions that has
 * not ended when recording begins, before considering the end-time slack. This gives files
 * before the restart to the original attempt and files after it to the restarted race.
 * A file with no timestamp goes to its only candidate, if it has exactly one.
 */
function ownerAt<T>(file: DuckDbFileInfo, spans: Span<T>[], accepts: (owner: T) => boolean): T | undefined {
  if (file.timestampEpochMs <= 0) {
    const candidates = spans.filter(span => accepts(span.owner));
    return candidates.length === 1 ? candidates[0].owner : undefined;
  }
  let best: Span<T> | undefined;
  for (const span of spans) {
    if (span.startMs <= 0) continue;
    if (file.timestampEpochMs < span.startMs - SLACK_MS || file.timestampEpochMs > span.endMs + SLACK_MS) continue;
    if (best && span.startMs < best.startMs) continue;
    if (!accepts(span.owner)) continue;
    if (best && span.startMs === best.startMs) {
      const ended = span.endMs < file.timestampEpochMs;
      const bestEnded = best.endMs < file.timestampEpochMs;
      if (ended !== bestEnded) {
        if (ended) continue;
      } else if (ended ? span.endMs <= best.endMs : span.endMs >= best.endMs) {
        continue;
      }
    }
    best = span;
  }
  return best?.owner;
}

/**
 * Decides the files with no stored match: each goes to the session it was recorded in, else to the
 * replay it was recorded in when that replay has no session with files. A stored match is never
 * revisited.
 */
export function decideTelemetryLinks(input: TelemetryLinkInput): TelemetryLink[] {
  const claimed = new Set(input.stored.filter(row => row.matchedSessionId || row.matchedReplayFilename).map(row => row.filename));
  const sessionsWithFiles = new Set(input.stored.map(row => row.matchedSessionId).filter((id): id is string => Boolean(id)));
  const links: TelemetryLink[] = [];

  const sessionSpans: Span<DetailedSession>[] = input.sessions.map(session => {
    const startMs = sessionEpochMs(session);
    const endMs = input.sessionEndMs?.(session) ?? startMs + DEFAULT_SESSION_MS;
    return { owner: session, startMs, endMs: Math.max(endMs, startMs) };
  });
  const replaySpans: Span<ReplayFileEntry>[] = input.replays.map(replay => ({
    owner: replay,
    startMs: replay.durationSec && replay.durationSec > 0 ? replay.mtime - Math.round(replay.durationSec * 1000) : replay.mtime,
    endMs: replay.mtime,
  }));
  const ownerOfReplay = new Map<string, string>(input.replayOwnerByName ?? []);
  for (const session of input.sessions) {
    if (session.matchingReplayFile) ownerOfReplay.set(session.matchingReplayFile.name, session.id);
  }
  const metadataCache = new Map<string, ReplayMetadata | null>();
  const metadataOf = (name: string) => {
    if (!metadataCache.has(name)) metadataCache.set(name, input.loadReplayMetadata(name));
    return metadataCache.get(name) ?? null;
  };

  for (const file of input.files) {
    if (claimed.has(file.filename)) continue;
    const session = ownerAt(file, sessionSpans, owner => findDuckDbForSession([file], owner, ANY_DELTA_SEC) !== null);
    if (session) {
      links.push({ filename: file.filename, sessionId: session.id, replayName: session.matchingReplayFile?.name ?? null });
      sessionsWithFiles.add(session.id);
      continue;
    }
    const replay = ownerAt(file, replaySpans, owner => {
      const owningSession = ownerOfReplay.get(owner.name);
      if (owningSession && sessionsWithFiles.has(owningSession)) return false;
      const metadata = metadataOf(owner.name);
      return metadata !== null && findDuckDbForReplay([file], metadata, owner.mtime, ANY_DELTA_SEC) !== null;
    });
    if (replay) {
      const owningSession = ownerOfReplay.get(replay.name);
      links.push({ filename: file.filename, sessionId: owningSession ?? null, replayName: replay.name });
      if (owningSession) sessionsWithFiles.add(owningSession);
    }
  }
  return links;
}

export interface TelemetryLinkSource {
  getTelemetryMetadata(sessionId?: string): TelemetryMetadataRecord[];
  getTelemetryLapCacheFilenames(sessionId?: string): Set<string>;
}

/**
 * The stored matches, as every view reads them. A matched file counts only while it can serve
 * telemetry: it is still on disk, or some of its laps are cached.
 */
export class TelemetryLinks {
  private readonly availability = new Map<string, boolean>();

  private constructor(
    private readonly rows: Map<string, TelemetryMetadataRecord>,
    private readonly bySession: Map<string, string[]>,
    private readonly byReplay: Map<string, string[]>,
    private readonly cachedFilenames: Set<string>
  ) {}

  public static load(source: TelemetryLinkSource, sessionId?: string): TelemetryLinks {
    const rows = new Map<string, TelemetryMetadataRecord>();
    const bySession = new Map<string, string[]>();
    const byReplay = new Map<string, string[]>();
    const add = (map: Map<string, string[]>, key: string, filename: string) => map.set(key, [...(map.get(key) ?? []), filename]);
    for (const row of source.getTelemetryMetadata(sessionId)) {
      rows.set(row.filename, row);
      if (row.matchedSessionId) add(bySession, row.matchedSessionId, row.filename);
      if (row.matchedReplayFilename) add(byReplay, row.matchedReplayFilename, row.filename);
    }
    // File names end with the recording time: sorting them puts a session's files in order.
    for (const files of [...bySession.values(), ...byReplay.values()]) files.sort();
    return new TelemetryLinks(rows, bySession, byReplay, source.getTelemetryLapCacheFilenames(sessionId));
  }

  /** The files explicitly attached to this session, in recording order. */
  public filesForSession(session: Pick<DetailedSession, 'id'>): string[] {
    return this.availableOf(this.bySession.get(session.id));
  }

  /** The files of the session the replay belongs to, else the replay's own files, in recording order. */
  public filesForReplay(replayName: string, owner?: Pick<DetailedSession, 'id'>): string[] {
    const own = this.availableOf(owner ? this.bySession.get(owner.id) : undefined);
    return own.length > 0 ? own : this.availableOf(this.byReplay.get(replayName));
  }

  /** The session's main file (the one with the most laps), shown as its telemetry source. */
  public forSession(session: Pick<DetailedSession, 'id'>): string | undefined {
    return this.main(this.filesForSession(session));
  }

  /** The replay's main file (the one with the most laps), shown as its telemetry source. */
  public forReplay(replayName: string, owner?: Pick<DetailedSession, 'id'>): string | undefined {
    return this.main(this.filesForReplay(replayName, owner));
  }

  public row(filename: string): TelemetryMetadataRecord | undefined {
    return this.rows.get(filename);
  }

  public isOnDisk(filename: string): boolean {
    const row = this.rows.get(filename);
    return Boolean(row && fs.existsSync(row.filePath));
  }

  private main(files: string[]): string | undefined {
    let best: string | undefined;
    for (const filename of files) {
      if (best === undefined || (this.rows.get(filename)?.lapsCount ?? 0) > (this.rows.get(best)?.lapsCount ?? 0)) best = filename;
    }
    return best;
  }

  private availableOf(files: string[] | undefined): string[] {
    return (files ?? []).filter(filename => {
      let available = this.availability.get(filename);
      if (available === undefined) {
        available = this.cachedFilenames.has(filename) || this.isOnDisk(filename);
        this.availability.set(filename, available);
      }
      return available;
    });
  }
}
