import { Mesh, ShaderMaterial, type Material, type Object3D, type Texture } from 'three';
import type { CarLamp } from '../../../../../shared/types/scenes/car.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { RenderPose } from '../replayPose.js';

type LampStatesRow = NonNullable<CarLamp['states']>;

/** A switching lamp's role and states, and its own texture copy per frame index that has a texture. */
export interface LampSwitch { role: CarLamp['role']; states: LampStatesRow; maps: Map<number, Texture> }

/**
 * App assumption, not package data (the user's choice, 2026-11-11): a pit lamp flashes at 4 Hz, lit then dark for equal halves,
 * while the pit limiter is on, as the race rules ask of pit-limiter lights. The package says neither what lights it nor how it
 * flashes, and its own animation method and rate are not used.
 */
export const PIT_FLASH_HZ = 4;

/** Whether a pit lamp is in the lit half of its flash at `timeSec` with the limiter on. */
export function pitFlashLit(pitLimiter: boolean, timeSec: number): boolean {
  return pitLimiter && Math.floor(timeSec * PIT_FLASH_HZ * 2) % 2 === 0;
}

/**
 * The frame a lamp shows: its brake frame while braking, else its headlights-on frame while the headlights are on, else its off
 * frame; a state the package leaves null falls back the same way. Each state is one frame (no cycling).
 */
export function lampStateFrame(states: LampStatesRow, headlights: boolean, braking: boolean): number | null {
  if (braking && states.brake !== null) return states.brake;
  if (headlights && states.on !== null) return states.on;
  return states.off;
}

/**
 * Whether a lamp switches with its car: headlight and brake lamps with the headlights and brake pedal, a pit lamp with a lit frame
 * flashing with the pit limiter. Rain lamps have lit frames too, but nothing says what lights them, so they stay on their off frame.
 */
export function switches(lamp: CarLamp): lamp is CarLamp & {states: LampStatesRow} {
  if (lamp.states === null) return false;
  return lamp.role === 'headlight' || lamp.role === 'brake' || (lamp.role === 'pit' && lamp.states.on !== null);
}

/** Every frame index a lamp can show: the ones whose texture the car loads. */
export function lampStateFrames(states: LampStatesRow): number[] {
  return [...new Set([states.off, states.on, states.brake].filter((index): index is number => index !== null))];
}

export interface LampStates { update(pose: RenderPose): void }

/**
 * Switches a car's lamps with its lap: headlights from the lap's headlight flag, brake lamps on any brake pedal, pit lamps flashing
 * while the pit limiter is on (dark: their off frame, or nothing when they have none). A frame without a texture draws nothing. Null
 * when no lamp of the car can switch.
 */
export function createLampStates(car: Object3D, points: ReplayTrajectoryPoint[]): LampStates | null {
  const lamps: Array<{material: ShaderMaterial; lamp: LampSwitch}> = [];
  const seen = new Set<Material>();
  car.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const material of (Array.isArray(object.material) ? object.material : [object.material]) as Material[]) {
      const lamp = material.userData.lampSwitch as LampSwitch | undefined;
      if (material instanceof ShaderMaterial && lamp && !seen.has(material)) { seen.add(material); lamps.push({material, lamp}); }
    }
  });
  if (!lamps.some(({lamp}) => lamp.states.on !== null || lamp.states.brake !== null)) return null;
  return {
    update(pose) {
      const point = points[pose.index], next = points[pose.index + 1] ?? point;
      const headlights = point?.headlights === true, braking = (point?.brake ?? 0) > 0;
      const timeSec = (point?.timeSec ?? 0) + ((next?.timeSec ?? 0) - (point?.timeSec ?? 0)) * pose.fraction;
      const flash = pitFlashLit(point?.pitLimiter === true, timeSec);
      for (const {material, lamp} of lamps) {
        const index = lamp.role === 'pit' ? (flash ? lamp.states.on : lamp.states.off) : lampStateFrame(lamp.states, headlights, braking), map = index === null ? undefined : lamp.maps.get(index);
        material.visible = map !== undefined;
        if (map) (material.uniforms.map as {value: Texture}).value = map;
      }
    },
  };
}
