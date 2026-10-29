import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';

export const MIN_CAMERA_DISTANCE = 4, MAX_CAMERA_DISTANCE = 7000;

/** Zoom about the current orbit target in both projection modes. */
export function zoomCamera(camera: PerspectiveCamera | OrthographicCamera, target: Vector3, direction: number): void {
  const factor = Math.pow(0.8, direction);
  if (camera instanceof OrthographicCamera) {
    camera.zoom = Math.max(0.1, Math.min(40, camera.zoom / factor));
    camera.updateProjectionMatrix();
  } else {
    const offset = camera.position.clone().sub(target);
    offset.setLength(Math.max(MIN_CAMERA_DISTANCE, Math.min(MAX_CAMERA_DISTANCE, offset.length() * factor)));
    camera.position.copy(target).add(offset);
  }
}

/** Camera-plane pan, scaled to the visible height, matching right-drag in OrbitControls. */
export function panCamera(camera: PerspectiveCamera | OrthographicCamera, target: Vector3, horizontal: number, vertical: number): void {
  const height = camera instanceof PerspectiveCamera
    ? 2 * camera.position.distanceTo(target) * Math.tan(camera.fov * Math.PI / 360) / camera.zoom
    : (camera.top - camera.bottom) / camera.zoom;
  camera.updateMatrixWorld();
  const offset = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(horizontal * height * 0.1)
    .add(new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(-vertical * height * 0.1));
  camera.position.add(offset); target.add(offset);
}
