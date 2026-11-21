import { vi } from 'vitest';
import type { SessionDatabase } from '../../server/core/db.js';
import type { LmuParser } from '../../server/sessions/parser.js';
import type { TelemetryCatalog } from '../../server/telemetry/telemetryCatalog.js';

/**
 * Fills a partial SessionDatabase mock with the members ServerContext reads on every pass, as an empty store would
 * answer them; the mock's own members win. Replay lookups answer from the parser's replay list.
 */
export function withSessionDbDefaults<T extends object>(mock: T, parser?: LmuParser): T & SessionDatabase {
  const metadata = new Map<string, string>();
  const replays = () => parser?.getReplaysList() ?? [];
  const defaults = {
    getMetadata: vi.fn((key: string) => metadata.get(key) ?? null),
    setMetadata: vi.fn((key: string, value: string) => { metadata.set(key, value); }),
    invalidateUnresolvedReplayDefaults: vi.fn(),
    reconcileReplayPlayerOwnership: vi.fn(),
    getReplayMatchingEntries: vi.fn(() => replays()),
    getReplayMatchingEntry: vi.fn((name: string) => replays().find(replay => replay.name === name)),
    getRecordingOwners: vi.fn(() => new Map<string, string>()),
    getStoredRecordingNames: vi.fn(() => new Set<string>()),
    updateSessionTelemetryFile: vi.fn(),
    clearTelemetryCache: vi.fn(),
    getRejectedReplayLinks: vi.fn(() => new Map()),
    getSessionsLinkedToRecording: vi.fn(() => []),
    getSessionXmlMtime: vi.fn(() => undefined),
    getSessionRevision: vi.fn(() => 0),
    getReplayMetadataRevision: vi.fn(() => 0),
    getTelemetryMetadataRevision: vi.fn(() => 0),
  };
  return Object.assign(mock, Object.fromEntries(Object.entries(defaults).filter(([key]) => !(key in mock)))) as T & SessionDatabase;
}

/** A TelemetryCatalog mock with no scan running; the overrides win. */
export function idleTelemetryCatalog<T extends object>(overrides: T = {} as T): T & TelemetryCatalog {
  const idle = { running: false, processed: 0, total: 0, currentFile: null, startedAt: null, finishedAt: null, result: null, error: null };
  const defaults = { getScanStatus: vi.fn(() => idle), clear: vi.fn(), refresh: vi.fn(() => Promise.resolve(0)) };
  return Object.assign(overrides, Object.fromEntries(Object.entries(defaults).filter(([key]) => !(key in overrides)))) as T & TelemetryCatalog;
}
