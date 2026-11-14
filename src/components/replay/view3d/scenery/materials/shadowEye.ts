import { Vector3, Vector4, type Camera, type IUniform, type OrthographicCamera } from 'three';

/**
 * Where camera-facing cards turn to in a shadow pass: the viewing camera, so a card casts the shape that is drawn
 * (shadows/shadowCasterPass.ts sets it before each pass).
 */
export const shadowEye: IUniform<Vector3> = { value: new Vector3() };

/** Turns the cards toward `camera`, the camera the frame is seen from. */
export function trackShadowEye(camera: Camera): void {
  shadowEye.value.setFromMatrixPosition(camera.matrixWorld);
}

/**
 * How cards turn, in the main and shadow passes alike: under an orthographic camera (the overhead view) every card faces the
 * camera's own way (xyz, w = 1), so the cards hold still as the camera moves with the car; under a perspective camera (w = 0) each
 * turns toward the eye. The camera's way is its backward axis less its up axis, level: behind it when it looks ahead, below the
 * screen's top when it looks straight down.
 */
export const cardFacing: IUniform<Vector4> = { value: new Vector4() };
const axisX = new Vector3(), axisY = new Vector3(), axisZ = new Vector3();

/** Sets the cards' turn for the frame `camera` draws. */
export function trackCardFacing(camera: Camera): void {
  const facing = cardFacing.value;
  if (!(camera as OrthographicCamera).isOrthographicCamera) { facing.w = 0; return; }
  camera.updateMatrixWorld();
  camera.matrixWorld.extractBasis(axisX, axisY, axisZ);
  axisZ.sub(axisY).setY(0);
  if (axisZ.lengthSq() < 1e-8) { facing.w = 0; return; }
  axisZ.normalize();
  facing.set(axisZ.x, 0, axisZ.z, 1);
}
