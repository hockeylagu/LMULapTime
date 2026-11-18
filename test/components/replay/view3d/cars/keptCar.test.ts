import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import type { DrivenCar } from '../../../../../src/components/replay/view3d/cars/drawnCar.js';
import { createKeptCar } from '../../../../../src/components/replay/view3d/cars/keptCar.js';

const body = (vehicleId: string, packageRevision = 'p1') => ({vehicleId, resource: {packageRevision}}) as unknown as LoadedBody;
function driven(of: LoadedBody, shown = true) {
  const car = new Group(), parent = new Group();
  parent.add(car);
  return {body: of, drawn: {car}, shown, dispose: vi.fn()} as unknown as DrivenCar & {dispose: ReturnType<typeof vi.fn>};
}

describe('createKeptCar', () => {
  it('hands the kept car to the next view of the same entry and package, shown', () => {
    const kept = createKeptCar(), car = driven(body('a'));
    kept.keep(car);
    expect(car.drawn.car.parent).toBeNull();
    car.drawn.car.visible = false;
    expect(kept.take(body('a', 'p2'))).toBeNull();
    expect(kept.take(body('b'))).toBeNull();
    expect(kept.take(body('a'))).toBe(car);
    expect(car.drawn.car.visible).toBe(true);
    expect(kept.take(body('a'))).toBeNull();
    expect(car.dispose).not.toHaveBeenCalled();
  });

  it('frees the kept car when another is kept, or with the shell', () => {
    const kept = createKeptCar(), first = driven(body('a')), second = driven(body('b'));
    kept.keep(first); kept.keep(first);
    expect(first.dispose).not.toHaveBeenCalled();
    kept.keep(second);
    expect(first.dispose).toHaveBeenCalledOnce();
    kept.dispose();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it('frees a car its view left before showing it, and keeps the shown one it had', () => {
    // A view left while its car built: the next view would take it as shown, its batched body drawing nothing.
    const kept = createKeptCar(), shown = driven(body('a')), unshown = driven(body('a'), false);
    kept.keep(shown);
    kept.keep(unshown);
    expect([unshown.drawn.car.parent, unshown.dispose.mock.calls.length, shown.dispose.mock.calls.length]).toEqual([null, 1, 0]);
    expect(kept.take(body('a'))).toBe(shown);
  });
});
