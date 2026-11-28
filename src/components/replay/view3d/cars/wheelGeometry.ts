import { Box3, Matrix4, Vector3, type BufferGeometry, type Group, type Mesh, type Object3D } from 'three';
import { frameWithin } from './carParts.js';

/** One wheel of a textured car GLB: `wheel_<corner>` at the rolling hub, holding `steer_<corner>` (yaw) holding `spin_<corner>` (roll). */
export interface WheelRig { corner: number; pivot: Object3D; steer: Object3D; spin: Object3D; hub: Vector3; radiusM: number }

const CORNERS = ['fl', 'fr', 'rl', 'rr'];

/**
 * A wheel's size in its car's frame, from the model's local matrices (`frameWithin`). The world's axes turn with the car: a wheel
 * measured along them came out smaller on a car at an angle (0.27 m for a 0.34 m wheel in a race's full models, which then rode
 * 7 cm low with their tyres in the road).
 */
function wheelSize(spin: Object3D, envelope: Object3D): Vector3 {
  const bounds = new Box3(), part = new Box3(), toEnvelope = new Matrix4();
  spin.traverse(object => {
    const geometry = (object as Mesh).geometry as BufferGeometry | undefined;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    bounds.union(part.copy(geometry.boundingBox!).applyMatrix4(frameWithin(object, envelope, toEnvelope)));
  });
  return bounds.getSize(new Vector3());
}

/** The four wheel rigs of a car model (corner order FL, FR, RL, RR). A car without all four, or with an implausible wheel, is an error. */
export function attachWheelRigs(envelope: Group): WheelRig[] {
  return CORNERS.map((name, corner) => {
    const pivot = envelope.getObjectByName(`wheel_${name}`), steer = envelope.getObjectByName(`steer_${name}`), spin = envelope.getObjectByName(`spin_${name}`);
    if (!pivot || !steer || !spin || !spin.children.length) throw Error(`Car model has no wheel rig ${name}`);
    const hubData: unknown = pivot.userData.wheelPivot;
    if (!Array.isArray(hubData) || hubData.length !== 3 || !hubData.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) throw Error(`Car wheel rig ${name} has no pivot`);
    const hub = new Vector3(hubData[0] as number, hubData[1] as number, hubData[2] as number);
    if (pivot.position.distanceTo(hub) > 0.0001) throw Error(`Car wheel rig ${name} is not at its pivot`);
    const size = wheelSize(spin, envelope), radiusM = (size.y + size.z) / 4;
    if (!(radiusM >= 0.15 && radiusM <= 0.6)) throw Error(`Car wheel rig ${name} has an implausible radius ${radiusM.toFixed(2)} m`);
    return { corner, pivot, steer, spin, hub, radiusM };
  });
}
