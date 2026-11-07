import { Vector3, type Camera, type IUniform } from 'three';

/**
 * Where camera-facing cards turn to in a shadow pass: the viewing camera, so a card casts the shape that is drawn. Shared by the
 * near shadow pass (`trackShadowEye` as a card's `onBeforeShadow`) and the static shadow pass (sunShadows.ts).
 */
export const shadowEye: IUniform<Vector3> = { value: new Vector3() };

/** A card's `onBeforeShadow`: the shadow pass passes the viewing camera, whose position the cards turn toward. */
export function trackShadowEye(_renderer: unknown, _object: unknown, camera: Camera): void {
  shadowEye.value.setFromMatrixPosition(camera.matrixWorld);
}
