import { Box3, DataTexture, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, RGBAFormat, type Object3D } from 'three';

/** How far the darkening spreads beyond the body, its strength under the body, and the lift that keeps it off the road. */
const SPREAD_M = 0.5, STRENGTH = 0.6, LIFT_M = 0.02, CORNER_M = 0.3, TEXELS_PER_M = 24;

/**
 * Grounds the car: the standard real-time contact shadow under the car's footprint, a ground-plane quad whose alpha falls from STRENGTH inside the body outline (a rounded rectangle over the model's
 * bounds) to nothing SPREAD_M beyond it. It sits on the model's lowest point (the tyre contact plane) and moves with the body.
 */
export function createContactShadow(model: Object3D): Mesh<PlaneGeometry, MeshBasicMaterial> {
  model.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(model, true).applyMatrix4(model.matrixWorld.clone().invert());
  const halfX = (bounds.max.x - bounds.min.x) / 2, halfZ = (bounds.max.z - bounds.min.z) / 2;
  const sizeX = 2 * (halfX + SPREAD_M), sizeZ = 2 * (halfZ + SPREAD_M);
  const width = Math.max(8, Math.round(sizeX * TEXELS_PER_M)), height = Math.max(8, Math.round(sizeZ * TEXELS_PER_M));
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      // Signed distance to the rounded footprint (negative inside), in metres.
      const x = Math.abs(((column + 0.5) / width - 0.5) * sizeX) - (halfX - CORNER_M), z = Math.abs(((row + 0.5) / height - 0.5) * sizeZ) - (halfZ - CORNER_M);
      const distance = Math.hypot(Math.max(x, 0), Math.max(z, 0)) + Math.min(Math.max(x, z), 0) - CORNER_M;
      const t = Math.min(Math.max((distance + CORNER_M) / (SPREAD_M + CORNER_M), 0), 1);
      data.fill(Math.round(255 * STRENGTH * (1 - t * t * (3 - 2 * t))), (row * width + column) * 4, (row * width + column) * 4 + 4);
    }
  }
  const alpha = new DataTexture(data, width, height, RGBAFormat);
  alpha.magFilter = LinearFilter; alpha.minFilter = LinearFilter; alpha.needsUpdate = true;
  const material = new MeshBasicMaterial({color: 0x000000, alphaMap: alpha, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4});
  material.addEventListener('dispose', () => { alpha.dispose(); });
  const shadow = new Mesh(new PlaneGeometry(sizeX, sizeZ), material);
  shadow.name = 'contact-shadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set((bounds.min.x + bounds.max.x) / 2, bounds.min.y + LIFT_M, (bounds.min.z + bounds.max.z) / 2);
  // Drawn after the road and before the racing line (renderOrder 2), which stays readable over it.
  shadow.renderOrder = 1; shadow.castShadow = false; shadow.receiveShadow = false;
  return shadow;
}
