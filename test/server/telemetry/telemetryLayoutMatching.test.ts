import { describe, expect, it } from 'vitest';
import { findDuckDbForReplay, findDuckDbForSession, type DuckDbFileInfo, type TelemetrySessionCandidate } from '../../../server/telemetry/telemetryMatcher.js';
import type { ReplayMetadata } from '../../../shared/types/index.js';

const start = Date.parse('2026-10-11T00:08:19Z');
const file: DuckDbFileInfo = {
  filename: 'Bahrain International Circuit_P_2026-10-11T00_08_31Z.duckdb',
  filePath: 'bahrain.duckdb', mtimeMs: start, fileSizeBytes: 1024,
  trackName: 'Bahrain International Circuit', sessionType: 'P',
  timestampStr: '2026-10-11T00:08:31Z', timestampEpochMs: start + 12000,
  driverName: 'Samuel Lague',
};
const session: TelemetrySessionCandidate = {
  id: 'paddock', filePath: 'session.xml', timestamp: start,
  trackVenue: 'Bahrain International Circuit', trackCourse: 'Bahrain Paddock Circuit',
  sessionType: 'Practice', sessionName: 'P1', drivers: [{ name: 'Samuel Lague' }], playerDriverName: 'Samuel Lague',
};
const replay = {
  trackName: 'BahrainWEC_2023', trackCourse: 'Bahrain Paddock Circuit',
  sceneDesc: 'BAHRAINWEC_PADDOCK', sessionType: 'P', durationSec: 555,
  drivers: [{ name: 'Samuel Lague', isPlayer: true }],
} as ReplayMetadata;

describe('telemetry layout evidence', () => {
  it('uses the session course and replay scene for venue-only telemetry', () => {
    expect(findDuckDbForSession([file], session)?.file).toBe(file);
    expect(findDuckDbForReplay([file], replay, start + 555000)?.file).toBe(file);
    expect(findDuckDbForReplay([file], { ...replay, trackCourse: undefined }, start + 555000)?.file).toBe(file);
  });

  it.each(['Bahrain Outer Circuit', 'bahrain_wec', 'BAHRAINWEC', 'Monza'])('rejects conflicting explicit telemetry track %s', trackName => {
    const explicit = { ...file, trackName };
    expect(findDuckDbForSession([explicit], session)).toBeNull();
    expect(findDuckDbForReplay([explicit], replay, start + 555000)).toBeNull();
  });

  it('accepts an explicit matching layout and rejects a different venue', () => {
    const explicit = { ...file, trackName: 'Bahrain Paddock Circuit' };
    expect(findDuckDbForSession([explicit], session)?.file).toBe(explicit);
    expect(findDuckDbForReplay([explicit], replay, start + 555000)?.file).toBe(explicit);
    expect(findDuckDbForSession([file], { ...session, trackVenue: 'Monza', trackCourse: 'Grand Prix' })).toBeNull();
  });

  it('preserves driver, session type and timestamp rejection for a generic venue', () => {
    for (const rejected of [
      { ...file, driverName: 'Other Driver' }, { ...file, sessionType: 'R' },
      { ...file, timestampEpochMs: start + 7200000 },
    ]) {
      expect(findDuckDbForSession([rejected], session)).toBeNull();
      expect(findDuckDbForReplay([rejected], replay, start + 555000)).toBeNull();
    }
  });
});
