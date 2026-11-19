import { describe, expect, it, vi } from 'vitest';
import type { MapLapRef, StoredSequenceMap } from '../../../server/core/replay/dbSequenceMapStore.js';
import type { SequenceLapInput } from '../../../server/corners/cornerPassBuild.js';
import { placeLayout } from '../../../server/corners/cornerPassService.js';
import { compareSequenceMaps, fastestMapLaps, queueCornerWork, refreshSequenceMaps, type SequenceMapStore } from '../../../server/corners/sequenceMapService.js';
import { buildSequenceMap } from '../../../shared/domain/cornerSequences/sequenceMap.js';
import type { SequenceLap } from '../../../shared/domain/cornerSequences/sequenceMap.js';
import type { ReplayMetadata } from '../../../shared/types/index.js';

// A square of 100 m sides on a layout with no turn list: its four bends are the turns.
const SQUARE: Array<[number, number]> = [];
for (let i = 0; i < 400; i += 5) {
  const side = Math.floor(i / 100), along = i % 100;
  SQUARE.push(side === 0 ? [along, 0] : side === 1 ? [100, along] : side === 2 ? [100 - along, 100] : [0, 100 - along]);
}
const loadTrack = () => ({ centerline: SQUARE, projectionRevision: 'rev1', timingGates: { startFinish: { stationM: 50 } } });
const LAYOUT = placeLayout('square', loadTrack)!;

/** Every lap the same: braking 30 m before each turn's apex, slowest at it. */
const readLaps = vi.fn((input: SequenceLapInput): Promise<SequenceLap[]> => Promise.resolve(input.laps.map(() => ({
  points: LAYOUT.turns.flatMap((turn, i) => [
    { type: 'max' as const, distM: turn.apexM - 30, speedKmh: 200, index: 2 * i },
    { type: 'min' as const, distM: turn.apexM, speedKmh: 100, index: 2 * i + 1 },
  ]),
}))));

interface Replay { metadata: Pick<ReplayMetadata, 'drivers' | 'hasRain'>; laps: Array<{ slot: number; lapNumber: number; lapTimeSec: number; passes: number }> }

type Check = { agrees: boolean; detail: string; fresh: MapLapRef[] };

function fakeStore(replays: Record<string, Replay>): SequenceMapStore & { maps: Map<string, StoredSequenceMap>; checks: Map<string, Check> } {
  const maps = new Map<string, StoredSequenceMap>();
  const checks = new Map<string, Check>();
  return {
    maps, checks,
    getSequenceMapFreshLaps: (layoutKey, carClass) => checks.get(`${layoutKey}|${carClass}`)?.fresh ?? [],
    recordSequenceMapCheck: (layoutKey, carClass, check, fresh) => { checks.set(`${layoutKey}|${carClass}`, { ...check, fresh: [...fresh] }); },
    getReplayLapSignature: () => '1:1',
    listReplayLapRows: () => [],
    getCornerPassBuild: () => null,
    replaceCornerPasses: () => undefined,
    getSequenceMap: (layoutKey, carClass) => maps.get(`${layoutKey}|${carClass}`) ?? null,
    replaceSequenceMap: map => {
      maps.set(`${map.layoutKey}|${map.carClass}`, map);
      checks.delete(`${map.layoutKey}|${map.carClass}`);
    },
    getStoredReplayMetadata: filename => (replays[filename]?.metadata ?? null) as ReplayMetadata | null,
    listLayoutPassReplays: () => Object.keys(replays),
    listSequenceCandidateLaps: filename => replays[filename]?.laps ?? [],
    getReplayLapBlobs: (_filename, laps) => laps.map(lap => ({ ...lap, blob: Buffer.alloc(0) })),
  };
}

const turns = LAYOUT.turns.length;
const race = (drivers: number, lapTime: number, hasRain = false): Replay => ({
  metadata: { hasRain, drivers: Array.from({ length: drivers }, (_, slot) => ({ name: `D${slot}`, slot, carClass: 'GT3', isPlayer: slot === 0 })) },
  laps: Array.from({ length: drivers }, (_, slot) => [2, 3].map(lapNumber => ({ slot, lapNumber, lapTimeSec: lapTime + slot + lapNumber / 10, passes: turns })))
    .flat(),
});

describe('queueCornerWork', () => {
  it('runs corner work one at a time, in the order asked, past a failure', async () => {
    const order: string[] = [];
    let release = () => {};
    const first = queueCornerWork(() => new Promise<void>(resolve => { release = () => { order.push('first'); resolve(); }; }));
    const failing = queueCornerWork(() => { order.push('failing'); return Promise.reject(new Error('no laps')); });
    const last = queueCornerWork(() => { order.push('last'); return Promise.resolve('done'); });
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await first;
    await expect(failing).rejects.toThrow('no laps');
    await expect(last).resolves.toBe('done');
    expect(order).toEqual(['first', 'failing', 'last']);
  });
});

describe('fastestMapLaps', () => {
  it('takes one lap per driver first, then a second, then any', () => {
    const laps = [{ driver: 'A', lapTimeSec: 90 }, { driver: 'A', lapTimeSec: 90.1 }, { driver: 'A', lapTimeSec: 90.2 }, { driver: 'B', lapTimeSec: 95 }];
    expect(fastestMapLaps(laps, 2).map(lap => lap.lapTimeSec)).toEqual([90, 95]);
    expect(fastestMapLaps(laps, 3).map(lap => lap.lapTimeSec)).toEqual([90, 95, 90.1]);
    expect(fastestMapLaps(laps, 10).map(lap => lap.lapTimeSec)).toEqual([90, 95, 90.1, 90.2]);
  });
});

describe('refreshSequenceMaps', () => {
  it('builds a class map from its fastest dry laps that pass every turn, then keeps it once full', async () => {
    const replays: Record<string, Replay> = { 'a.Vcr': race(6, 100), 'wet.Vcr': race(6, 80, true), 'b.Vcr': race(6, 101) };
    replays['b.Vcr'].laps[0].passes = turns - 1;
    const store = fakeStore(replays);
    expect(await refreshSequenceMaps(store, 'square', ['GT3'], { readLaps, loadTrack })).toEqual(['GT3']);
    const map = store.maps.get('square|GT3')!;
    // One lap per driver of the six (the wet race left out), then the second laps, up to 10.
    expect(map.laps).toHaveLength(10);
    expect(map.laps.every(lap => lap.filename !== 'wet.Vcr')).toBe(true);
    expect(map.laps.some(lap => lap.filename === 'b.Vcr' && lap.slot === 0 && lap.lapNumber === 2)).toBe(false);
    expect(map.sequences.length).toBeGreaterThan(0);
    // The driver's own laps (slot 0) check it.
    expect(map.checkLaps.map(lap => lap.slot)).toEqual([0, 0, 0]);
    expect(map.sequences.every(sequence => sequence.check?.same)).toBe(true);

    // Full: two new fast laps change nothing and check nothing.
    const built = map.mapKey;
    replays['c.Vcr'] = race(1, 50);
    readLaps.mockClear();
    expect(await refreshSequenceMaps(store, 'square', ['GT3'], { readLaps, loadTrack })).toEqual([]);
    expect(readLaps).not.toHaveBeenCalled();
    // Two more: the map is checked against the fastest laps now, flagged, and left as it is.
    replays['c.Vcr'] = race(2, 50);
    expect(await refreshSequenceMaps(store, 'square', ['GT3'], { readLaps, loadTrack })).toEqual([]);
    expect(readLaps).toHaveBeenCalledTimes(1);
    expect(store.checks.get('square|GT3')).toMatchObject({ agrees: true, detail: '' });
    expect(store.maps.get('square|GT3')!.mapKey).toBe(built);
    // Counted again from the laps of that check.
    expect(await refreshSequenceMaps(store, 'square', ['GT3'], { readLaps, loadTrack })).toEqual([]);
    expect(readLaps).toHaveBeenCalledTimes(1);
    expect(await refreshSequenceMaps(store, 'square', null, { readLaps, loadTrack, remap: true })).toEqual(['GT3']);
    expect(store.checks.has('square|GT3')).toBe(false);
    expect(store.maps.get('square|GT3')!.laps[0].filename).toBe('c.Vcr');
  });

  it('grows a map short of laps and makes none from fewer than three', async () => {
    const replays: Record<string, Replay> = { 'a.Vcr': race(1, 100) };
    const store = fakeStore(replays);
    expect(await refreshSequenceMaps(store, 'square', ['GT3'], { readLaps, loadTrack })).toEqual([]);
    replays['b.Vcr'] = race(2, 100);
    expect(await refreshSequenceMaps(store, 'square', ['GT3'], { readLaps, loadTrack })).toEqual(['GT3']);
    expect(store.maps.get('square|GT3')!.laps).toHaveLength(6);
    replays['c.Vcr'] = race(2, 99);
    expect(await refreshSequenceMaps(store, 'square', ['GT3'], { readLaps, loadTrack })).toEqual(['GT3']);
    expect(store.maps.get('square|GT3')!.laps).toHaveLength(10);
  });
});

describe('compareSequenceMaps', () => {
  it('says in words how a fresh map groups or starts a sequence otherwise', () => {
    const turns = LAYOUT.turns;
    const lap = (startBack: number, joinFirstTwo: boolean) => ({
      points: turns.flatMap((turn, i) => joinFirstTwo && i === 1 ? [{ type: 'min' as const, distM: turn.apexM, speedKmh: 90, index: 2 * i + 1 }] : [
        { type: 'max' as const, distM: turn.apexM - startBack, speedKmh: 200, index: 2 * i },
        { type: 'min' as const, distM: turn.apexM, speedKmh: 100, index: 2 * i + 1 },
      ]).filter((point, k, all) => k === 0 || point.type !== all[k - 1].type),
    });
    const sequenceTurns = turns.map(({ id, apexM }) => ({ id, apexM }));
    const map = (startBack: number, join: boolean) => buildSequenceMap(sequenceTurns, [lap(startBack, join), lap(startBack, join), lap(startBack, join)], LAYOUT.lengthM);
    const stored = { ...map(30, false), sequences: map(30, false).sequences.map(sequence => ({ ...sequence, check: null })) };
    expect(compareSequenceMaps(stored, map(30, false), turns)).toEqual({ agrees: true, detail: '' });
    expect(compareSequenceMaps(stored, map(45, false), turns).detail).toMatch(/: start 15 m earlier/);
    const joined = compareSequenceMaps(stored, map(30, true), turns);
    expect(joined.agrees).toBe(false);
    expect(joined.detail).toMatch(/: now /);
  });
});