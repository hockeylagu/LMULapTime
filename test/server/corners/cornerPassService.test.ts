import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import type { StoredSequenceMap } from '../../../server/core/replay/dbSequenceMapStore.js';
import {
  mapRuleHash, placeLayout, refreshReplayCornerPasses, sequenceSegments, type CornerPassStore,
} from '../../../server/corners/cornerPassService.js';
import type { CornerPass } from '../../../shared/types/corners/cornerPasses.js';
import type { CornerPassInput, CornerPassResult } from '../../../server/corners/cornerPassBuild.js';
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
  throttleM: null, aheadSlot: 7, aheadGapSec: 0.8124, minSpeedGear: null, peakBrake: null, brakeSec: 0, partThrottleSec: null, absSec: 0,
  coastSec: 0 };
const METADATA = { sceneDesc: 'SEBRINGWEC', drivers: [{ name: 'A', slot: 3, carClass: 'GT3' }, { name: 'B', slot: 4, carClass: 'LMP2' }] };

const databases: SessionDatabase[] = [];
afterEach(() => { databases.splice(0).forEach(db => db.close()); });

function database(): SessionDatabase {
  const db = new SessionDatabase(':memory:');
  databases.push(db);
  return db;
}

function store(db: SessionDatabase, signature: string | null = '4:100'): CornerPassStore {
  return {
    getReplayLapSignature: () => signature,
    listReplayLapRows: () => [],
    getCornerPassBuild: (filename, kind) => db.getCornerPassBuild(filename, kind),
    replaceCornerPasses: (filename, build, passes, kind) => db.replaceCornerPasses(filename, build, passes, kind),
    getSequenceMap: (layoutKey, carClass) => db.getSequenceMap(layoutKey, carClass),
  };
}

function gt3Map(hash: string, laps = 10): StoredSequenceMap {
  const layout = placeLayout('sebring_full', loadTrack)!;
  return {
    layoutKey: 'sebring_full', carClass: 'GT3', mapKey: `${mapRuleHash(layout.turnsKey)}:${hash}`, lengthM: layout.lengthM,
    sequences: [
      { turnIds: [1, 2], exitTurnIds: [], startM: 20, minM: 60, startSpreadM: { median: 2, max: 5 }, lapCount: 10, check: null },
      { turnIds: [3], exitTurnIds: [], startM: 380, minM: 395, startSpreadM: { median: 1, max: 3 }, lapCount: 10, check: { same: true, offsetM: -4 } },
    ],
    laps: Array.from({ length: laps }, (_, i) => ({ filename: 'b.Vcr', slot: i, lapNumber: 2, lapTimeSec: 90 + i, driver: `D${i}` })),
    checkLaps: [],
  };
}

const result = (sequencePasses: CornerPass[] = []): CornerPassResult => ({ passes: [PASS], sequencePasses });

describe('refreshReplayCornerPasses', () => {
  it('builds once, then finds the stored passes current', async () => {
    const target = store(database());
    const build = vi.fn((_input: CornerPassInput) => Promise.resolve(result()));
    expect(await refreshReplayCornerPasses(target, 'a.Vcr', METADATA, build, loadTrack)).toEqual({ status: 'built', passCount: 1, sequencePassCount: 0 });
    expect(await refreshReplayCornerPasses(target, 'a.Vcr', METADATA, build, loadTrack)).toEqual({ status: 'current' });
    expect(build).toHaveBeenCalledTimes(1);
    const input = build.mock.calls[0][0];
    expect(input.startStationM).toBe(50);
    // The layout's own turn list, placed on its centre line from the start line; no class has a map yet.
    const { turns } = placeTurns(SQUARE, LAYOUT_TURN_LISTS.sebring_full, 50);
    expect(input.segments).toEqual(turns.map(({ id, startM, endM }) => ({ id, startM, endM })));
    expect(input.sequences).toEqual([]);
  });

  it('skips a replay without stored laps or a known layout', async () => {
    const build = vi.fn(() => Promise.resolve(result()));
    expect(await refreshReplayCornerPasses(store(database(), null), 'a.Vcr', METADATA, build, loadTrack)).toMatchObject({ status: 'skipped' });
    expect(await refreshReplayCornerPasses(store(database()), 'a.Vcr', { ...METADATA, sceneDesc: 'NOWHERE' }, build, loadTrack))
      .toMatchObject({ status: 'skipped' });
    expect(build).not.toHaveBeenCalled();
  });

  it('builds the sequence passes of each class with a map, and again only them when the map changes', async () => {
    const db = database();
    const target = store(db);
    db.replaceSequenceMap(gt3Map('aaa'));
    const sequencePass = { ...PASS, segment: 3 };
    const build = vi.fn((_input: CornerPassInput) => Promise.resolve(result([sequencePass])));
    await refreshReplayCornerPasses(target, 'a.Vcr', METADATA, build, loadTrack);
    // GT3 has a map, LMP2 none: only slot 3 drives sequences, the last one across the line.
    const lengthM = placeLayout('sebring_full', loadTrack)!.lengthM;
    expect(build.mock.calls[0][0].sequences).toEqual([{ slots: [3], segments: [
      { id: 1, startM: 20, endM: 380 }, { id: 3, startM: 380, endM: 20 + lengthM },
    ] }]);
    expect(db.listCornerPasses('a.Vcr', 'sequences')).toHaveLength(1);
    const turnsBuild = db.getCornerPassBuild('a.Vcr');

    db.replaceSequenceMap(gt3Map('bbb'));
    expect(await refreshReplayCornerPasses(target, 'a.Vcr', METADATA, build, loadTrack)).toMatchObject({ status: 'built' });
    expect(build).toHaveBeenCalledTimes(2);
    expect(db.getCornerPassBuild('a.Vcr')).toEqual(turnsBuild);
    expect(db.getCornerPassBuild('a.Vcr', 'sequences')?.versionKey).toContain('GT3:');
  });

  it('ignores a map built on another placing of the turns', async () => {
    const db = database();
    db.replaceSequenceMap({ ...gt3Map('aaa'), mapKey: 'old:aaa' });
    const build = vi.fn((_input: CornerPassInput) => Promise.resolve(result()));
    await refreshReplayCornerPasses(store(db), 'a.Vcr', METADATA, build, loadTrack);
    expect(build.mock.calls[0][0].sequences).toEqual([]);
  });
});

describe('sequenceSegments', () => {
  it('runs each sequence to the next start, the last one across the line', () => {
    const map = { sequences: gt3Map('x').sequences.slice().reverse() };
    expect(sequenceSegments(map, 1000)).toEqual([{ id: 1, startM: 20, endM: 380 }, { id: 3, startM: 380, endM: 1020 }]);
    expect(sequenceSegments({ sequences: [map.sequences[0]] }, 1000)).toEqual([{ id: 3, startM: 380, endM: 1380 }]);
  });
});

describe('corner pass rows', () => {
  it('store in lean units and read back, turns and sequences apart', () => {
    const db = database();
    db.replaceCornerPasses('a.Vcr', { versionKey: 'k', layoutKey: 'sebring_full' }, [PASS]);
    const [read] = db.listCornerPasses('a.Vcr');
    expect(read).toEqual({ ...PASS, entrySec: 61.235, minSpeedSec: 62.8, exitSec: 64.5, entrySpeedKmh: 201, minSpeedKmh: 88.3,
      minSpeedM: 140, aheadGapSec: 0.812 });
    expect(db.getCornerPassBuild('a.Vcr')).toEqual({ versionKey: 'k', layoutKey: 'sebring_full', passCount: 1 });
    expect(db.listCornerPasses('a.Vcr', 'sequences')).toEqual([]);
    expect(db.getCornerPassBuild('a.Vcr', 'sequences')).toBeNull();
    expect(db.listLayoutPassReplays('sebring_full')).toEqual(['a.Vcr']);
  });

  it('store a sequence map and read it back', () => {
    const db = database();
    const map = { ...gt3Map('aaa', 3), checkLaps: [{ filename: 'c.Vcr', slot: 0, lapNumber: 4, lapTimeSec: 95.5, driver: 'Me' }] };
    db.replaceSequenceMap(map);
    expect(db.getSequenceMap('sebring_full', 'GT3')).toEqual(map);
    expect(db.getSequenceMap('sebring_full', 'LMP2')).toBeNull();
    const [summary] = db.listSequenceMaps();
    expect(summary).toMatchObject({ layoutKey: 'sebring_full', carClass: 'GT3', lapCount: 3, sequenceCount: 2,
      ownCheck: { checked: 1, same: 1, startOff: 0 }, check: null });

    // A check of the full map, with the fastest laps it read; a new map drops it.
    const fresh = [{ filename: 'd.Vcr', slot: 2, lapNumber: 3, lapTimeSec: 89.9, driver: 'Fast' }];
    db.recordSequenceMapCheck('sebring_full', 'GT3', { agrees: false, detail: 'T3: start 18 m later' }, fresh);
    expect(db.getSequenceMapFreshLaps('sebring_full', 'GT3')).toEqual(fresh);
    expect(db.listSequenceMaps()[0].check).toMatchObject({ agrees: false, detail: 'T3: start 18 m later' });
    expect(db.getSequenceMap('sebring_full', 'GT3')).toEqual(map);
    db.replaceSequenceMap(map);
    expect(db.listSequenceMaps()[0].check).toBeNull();
    expect(db.getSequenceMapFreshLaps('sebring_full', 'GT3')).toEqual([]);
  });
});
