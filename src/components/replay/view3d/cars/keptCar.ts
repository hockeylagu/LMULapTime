import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import type { DrivenCar } from './drawnCar.js';

/**
 * The driven car a view leaves (the lap's car, the race's followed one built on its own), kept by the shell for the next view that
 * drives the same car: it shows at once, nothing parsed, built or compiled again (lap ↔ race). One car at most: keeping another
 * frees it, as does the shell. A car never shown (its view left while it built) is freed instead: the next view would take it
 * as shown, and its batched parts would draw nothing (a see-through body, its lamps and mirrors alone).
 */
export function createKeptCar() {
  let kept: DrivenCar | null = null;
  return {
    keep(car: DrivenCar) {
      car.drawn.car.removeFromParent();
      if (!car.shown) { if (kept !== car) car.dispose(); return; }
      if (kept !== car) kept?.dispose();
      kept = car;
    },
    /** The kept car when it is `body`'s (same entry and package), now the caller's; null otherwise (the kept car stays). */
    take(body: LoadedBody): DrivenCar | null {
      if (!kept || kept.body.vehicleId !== body.vehicleId || kept.body.resource.packageRevision !== body.resource.packageRevision) return null;
      const car = kept;
      kept = null; car.drawn.car.visible = true;
      return car;
    },
    dispose() { kept?.dispose(); kept = null; },
  };
}

export type KeptCar = ReturnType<typeof createKeptCar>;
