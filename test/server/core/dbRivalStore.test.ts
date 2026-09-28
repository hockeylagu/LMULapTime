import { describe, it, expect, beforeEach } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import type { RivalScope } from '../../../server/core/dbRivalStore.js';
import type { NewRivalTarget } from '../../../shared/domain/rivals.js';

const GT3: RivalScope = { layoutKey: 'monza_gp', carClass: 'LMGT3', carType: '' };
const MY_CAR: RivalScope = { ...GT3, carType: 'Ferrari 296 LMGT3' };

const driverTarget = (driverName: string, targetTime: number, setAt = 1): NewRivalTarget => ({
  kind: 'driver', driverName, targetTime, startTime: 100, pinned: false, setAt,
});

describe('rival store', () => {
  let db: SessionDatabase;
  const create = (scope: RivalScope, target: NewRivalTarget) =>
    db.applyRivalResolution(scope, { beaten: null, retimed: null, replaced: null, created: target, active: null });

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  it('keeps one active rival per board: the class board and the car board are apart', () => {
    const id = create(GT3, driverTarget('Rival', 99.7));
    expect(db.getActiveRival(GT3)).toMatchObject({ id, kind: 'driver', driverName: 'Rival', targetTime: 99.7, startTime: 100, status: 'active', pinned: false });
    expect(db.getActiveRival(MY_CAR)).toBeNull();
    expect(db.getActiveRival({ ...GT3, layoutKey: 'monza_curvagrande' })).toBeNull();
  });

  it('retimes, then ends a beaten rival and starts the next one in one step', () => {
    const first = create(GT3, driverTarget('Rival', 99.7));
    db.applyRivalResolution(GT3, { beaten: null, retimed: { id: first!, targetTime: 99.6 }, replaced: null, created: null, active: null });
    expect(db.getActiveRival(GT3)?.targetTime).toBe(99.6);

    const next = db.applyRivalResolution(GT3, {
      beaten: { id: first!, beatenTime: 99.55, beatenSessionId: 'r7', endedAt: 30 },
      retimed: null,
      replaced: null,
      created: driverTarget('Next', 99.3, 30),
      active: null,
    });
    expect(db.getActiveRival(GT3)).toMatchObject({ id: next, driverName: 'Next' });
    expect(db.getBeatenRivals(GT3)).toEqual([
      expect.objectContaining({ id: first, driverName: 'Rival', status: 'beaten', beatenTime: 99.55, beatenSessionId: 'r7', endedAt: 30 }),
    ]);
  });

  it('ends a rival out of reach as replaced, not beaten nor skipped, and starts the next one', () => {
    const far = create(GT3, driverTarget('Far', 99.2));
    const next = db.applyRivalResolution(GT3, {
      beaten: null, retimed: null, replaced: { id: far!, endedAt: 40 }, created: driverTarget('Near', 99.7, 40), active: null,
    });
    expect(db.getActiveRival(GT3)).toMatchObject({ id: next, driverName: 'Near' });
    expect(db.getBeatenRivals(GT3)).toEqual([]);
    expect([...db.getSkippedRivalDrivers(GT3)]).toEqual([]);
  });

  it('remembers the drivers skipped, and replaces the active rival with a pinned one', () => {
    create(GT3, driverTarget('Skip me', 99.7));
    db.endActiveRival(GT3, 'skipped', 10);
    expect(db.getActiveRival(GT3)).toBeNull();
    expect([...db.getSkippedRivalDrivers(GT3)]).toEqual(['Skip me']);

    create(GT3, driverTarget('Auto', 99.6));
    const pinned = db.pinRival(GT3, { ...driverTarget('Alien', 95, 20), pinned: true });
    expect(db.getActiveRival(GT3)).toMatchObject({ id: pinned, driverName: 'Alien', pinned: true });
    expect(db.getBeatenRivals(GT3)).toEqual([]);
    expect([...db.getSkippedRivalDrivers(GT3)]).toEqual(['Skip me']);
  });

  it('keeps the rivals when the session cache is cleared: they are the player history, not a cache', () => {
    create(GT3, driverTarget('Rival', 99.7));
    db.clearCache();
    expect(db.getActiveRival(GT3)?.driverName).toBe('Rival');
  });
});
