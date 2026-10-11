import { describe, expect, it, vi } from 'vitest';
import type { ReplayMetadata, ReplayTrajectoryData } from '../../../../server/core/types.js';
import { readReplaySessionContext } from '../../../../server/core/sessionRows/replayContext.js';
import { composeReplayMetadata } from '../../../../server/replay/replayMetadataService.js';
import { applyPureOfficialLapValidation } from '../../../../server/replay/decode/replayTransforms.js';
import { driver, lap, memoryDb, roundTrip, session } from './builders.js';

function fixture() {
  return session([
    driver('Rival', [lap(7), lap(8, { lapTime: null, isValid: false })]),
    driver('Player', [lap(3, { isOutLap: true }), lap(4)], { isPlayer: true }),
    driver('Other', Array.from({ length: 1000 }, (_, index) => lap(index + 1)), {
      incidents: [{ type: 'contact', description: 'Not needed by telemetry' }],
    }),
  ], { matchingReplayFile: { name: 'Archived.Vcr', path: 'archive', sizeBytes: 100, hasRain: true }, totalLapsCount: 1004 });
}

describe('targeted replay session reads', () => {
  it('preserves composed metadata and all driver/lap source ordinals without events or passes', () => {
    const db = memoryDb();
    try {
      const { stored } = roundTrip(fixture(), db);
      const prepare = vi.spyOn(db, 'prepare');
      const context = readReplaySessionContext(db, 'session-a.xml', 'all')!;
      expect(context.drivers.map(item => item.driverOrdinal)).toEqual([0, 1, 2]);
      expect(context.drivers[0].laps.map(item => [item.lapNum, item.lapOrdinal])).toEqual([[7, 0], [8, 1]]);
      expect(context.playerDriver).toBe(context.drivers[1]);
      const metadata: ReplayMetadata = { filename: 'Archived.Vcr', filePath: 'archive', fileSizeBytes: 100,
        mtimeMs: 1, timeSliceCount: 1, totalEvents: 0, durationSec: 10,
        drivers: [{ name: 'Player', slot: 1, isPlayer: true }, { name: 'Rival', slot: 2 }] };
      expect(composeReplayMetadata({ metadata, replayName: 'Archived.Vcr', matchedSession: context }))
        .toEqual(composeReplayMetadata({ metadata, replayName: 'Archived.Vcr', matchedSession: stored! }));
      expect(prepare.mock.calls.every(([sql]) => !/session_events|session_lap_passes|SELECT \*/.test(sql)
        || sql.includes('SELECT * FROM session_recordings'))).toBe(true);
    } finally { db.close(); }
  });

  it('loads only the selected and primary driver timing histories and preserves validation', () => {
    const db = memoryDb();
    try {
      const { stored } = roundTrip(fixture(), db);
      const context = readReplaySessionContext(db, 'session-a', 0)!;
      expect(context.drivers.map(item => item.laps.length)).toEqual([2, 2, 0]);
      const trajectory = { laps: [{ lapNumber: 7, lapTimeSec: 107 }], points: [] } as unknown as ReplayTrajectoryData;
      expect(applyPureOfficialLapValidation(trajectory, context, context.drivers[0]))
        .toEqual(applyPureOfficialLapValidation(trajectory, stored!, stored!.drivers[0]));
      expect(context.drivers[0]).not.toHaveProperty('incidents');
      expect(context.drivers[0].laps[0]).not.toHaveProperty('traffic');
      expect(context.drivers[0].laps[0]).not.toHaveProperty('fuel');
    } finally { db.close(); }
  });

  it('reads no lap rows for traffic and keeps missing sessions and absent players safe', () => {
    const db = memoryDb();
    try {
      roundTrip(session([driver('Rival', [lap(1)])]), db);
      const prepare = vi.spyOn(db, 'prepare');
      const context = readReplaySessionContext(db, 'session-a', 'none')!;
      expect(context.drivers[0]).toMatchObject({ name: 'Rival', carClass: 'Hyper', laps: [] });
      expect(context.playerDriver).toBeUndefined();
      expect(prepare.mock.calls.some(([sql]) => /session_laps|session_events|session_lap_passes/.test(sql))).toBe(false);
      expect(readReplaySessionContext(db, 'missing', 'all')).toBeNull();
      expect(readReplaySessionContext(db, 'session-a', 99)?.drivers[0].laps).toHaveLength(1);
    } finally { db.close(); }
  });
});
