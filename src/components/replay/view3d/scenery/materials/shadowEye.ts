import { Vector3, type Camera, type IUniform } from 'three';

/**
 * Where camera-facing cards turn to in a shadow pass: the viewing camera, so a card casts the shape that is drawn
 * (shadows/shadowCasterPass.ts sets it before each pass).
 */
export const shadowEye: IUniform<Vector3> = { value: new Vector3() };

/** Turns the cards toward `camera`, the camera the frame is seen from. */
export function trackShadowEye(camera: Camera): void {
  shadowEye.value.setFromMatrixPosition(camera.matrixWorld);
}
