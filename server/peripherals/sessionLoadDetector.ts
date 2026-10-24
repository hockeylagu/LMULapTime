import type { LiveSnapshot } from '../../shared/types/live.js';
import type { PeripheralCar } from '../../shared/types/peripherals/peripherals.js';
import { knownCarClass, resolveVehicle } from '../../shared/domain/vehicleMapping.js';

/** One load spans all sessions of a weekend; returning to the garage never rearms it. */
export class SessionLoadDetector {
  public phase: 'idle' | 'pending' | 'handled' = 'idle';
  public key = '';
  public generation = 0;
  public skipReason: string | null = null;
  private garageSince = 0;
  private garage = false;

  public update(snapshot: LiveSnapshot, now: number): void {
    this.garage = snapshot.lifecycle === 'garage' && snapshot.session?.inRealtime === false;
    if (['offline', 'menu', 'loading'].includes(snapshot.lifecycle)) {
      if (this.phase !== 'idle') this.generation++;
      this.phase = 'idle';
      this.key = '';
      this.skipReason = null;
      return;
    }
    const session = snapshot.session;
    const key = session ? `${session.trackName}|${session.vehicleName}|${session.vehicleClass}` : '';
    if (this.phase === 'idle' || key !== this.key) {
      this.generation++;
      this.key = key;
      this.garageSince = now;
      this.phase = this.garage && key ? 'pending' : 'handled';
      this.skipReason = this.phase === 'handled' ? snapshot.lifecycle === 'garage' ? 'Garage safety could not be confirmed.' : 'Session was already on track when detected.' : null;
    }
    if (!this.garage && this.phase === 'pending') this.consume('Left the garage before preset selection.');
  }

  public safe(generation: number): boolean { return this.garage && this.generation === generation; }
  public ready(now: number): boolean { return this.phase === 'pending' && this.garage && now - this.garageSince >= 3000; }
  public consume(skipReason: string | null = null): void {
    if (this.phase !== 'pending') return;
    this.phase = 'handled';
    this.skipReason = skipReason;
  }
}

export function loadedCar(snapshot: LiveSnapshot): PeripheralCar | null {
  if (['offline', 'menu', 'loading'].includes(snapshot.lifecycle)) return null;
  const session = snapshot.session;
  if (!session) return null;
  const resolved = resolveVehicle(session.vehicleName);
  if (resolved) return { model: resolved.model, carClass: resolved.carClass ?? knownCarClass(session.vehicleClass) };
  const identity = snapshot.identity;
  return identity?.vehicleModel && identity.carClass === knownCarClass(session.vehicleClass)
    ? { model: identity.vehicleModel, carClass: identity.carClass } : null;
}
