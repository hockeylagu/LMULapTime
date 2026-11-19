import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { refreshReplayCornerPasses, type CornerPassStore } from '../../../server/corners/cornerPassService.js';
import type { CornerPass } from '../../../shared/types/corners/cornerPasses.js';
import type { CornerPassInput } from '../../../server/corners/cornerPassBuild.js';
import { placeTurns } from '../../../shared/domain/circuitTurns/placeTurns.js';
import { LAYOUT_TURN_LISTS } from '../../../shared/domain/circuitTurns/turnLists.js';

// A square of 100 m sides: four 90° bends, no turn list, so each bend is its own segment.
const SQUARE: Array<[number, number]> = [];
for (let i = 0; i < 400; i += 5) {
  const side = Math.floor(i / 100), along = i % 100;
  SQUARE.push(side === 0 ? [along, 0] : side === 1 ? [100, along] : side === 2 ? [100 - along, 100] : [0, 100 - along]);
}
const loadTrack = () => ({ centerline: SQUARE, projectionRevision: 'rev1', timingGates: { startFinish: { stationM: 50 } } });
const PASS: CornerPass = { slot: 3, lapNumber: 2, segment: 1, entrySec: 61.2345, minSpeedSec: 62.8, exitSec: 64.5,
  entrySpeedKmh: 201.04, minSpeedKmh: 88.26, exitSpeedKmh: null, minSpeedM: 140.04, brakeM: -12.3, turnInM: 60.2,
  throttleM: null, aheadSlot: 7, aheadGapSec: 0.8124, behindSlot: null, behindGapSec: null };

const databases: SessionDatabase[] = [];
afterEach(() => { databases.splice(0).forEach(db => db.close()); });

function store(signature: string | null = '4:100'): CornerPassStore {
  const db = new SessionDatabase(':memory:');
  databases.push(db);
  return {
    getReplayLapSignature: () => signature,
    listReplayLapRows: () => [],
    getCornerPassBuild: filename => db.getCornerPassBuild(filename),
    replaceCornerPasses: (filename, build, passes) => db.replaceCornerPasses(filename, build, passes),
  };
}

describe('refreshReplayCornerPasses', () => {
  it('builds once, then finds the stored passes current', async () => {
    const target = store();
    const build = vi.fn((_input: CornerPassInput) => Promise.resolve([PASS]));
    const metadata = { sceneDesc: 'SEBRINGWEC' };
    expect(await refreshReplayCornerPasses(target, 'a.Vcr', metadata, build, loadTrack)).toEqual({ status: 'built', passCount: 1 });
    expect(await refreshReplayCornerPasses(target, 'a.Vcr', metadata, build, loadTrack)).toEqual({ status: 'current' });
    expect(build).toHaveBeenCalledTimes(1);
    const input = build.mock.calls[0][0];
    expect(input.startStationM).toBe(50);
    // The layout's own turn list, placed on its centre line from the start line.
    const { turns } = placeTurns(SQUARE, LAYOUT_TURN_LISTS.sebring_full, 50);
    expect(input.segments).toEqual(turns.map(({ id, startM, endM }) => ({ id, startM, endM })));
  });

  it('skips a replay without stored laps or a known layout', async () => {
    const build = vi.fn(() => Promise.resolve([]));
    expect(await refreshReplayCornerPasses(store(null), 'a.Vcr', { sceneDesc: 'SEBRINGWEC' }, build, loadTrack)).toMatchObject({ status: 'skipped' });
    expect(await refreshReplayCornerPasses(store(), 'a.Vcr', { sceneDesc: 'NOWHERE' }, build, loadTrack)).toMatchObject({ status: 'skipped' });
    expect(build).not.toHaveBeenCalled();
  });
});

describe('corner pass rows', () => {
  it('store in lean units and read back', () => {
    const db = new SessionDatabase(':memory:');
    databases.push(db);
    db.replaceCornerPasses('a.Vcr', { versionKey: 'k', layoutKey: 'sebring_full' }, [PASS]);
    const [read] = db.listCornerPasses('a.Vcr');
    expect(read).toEqual({ ...PASS, entrySec: 61.235, minSpeedSec: 62.8, exitSec: 64.5, entrySpeedKmh: 201, minSpeedKmh: 88.3,
      minSpeedM: 140, aheadGapSec: 0.812 });
    expect(db.getCornerPassBuild('a.Vcr')).toEqual({ versionKey: 'k', layoutKey: 'sebring_full', passCount: 1 });
  });
});
