import { InstancedMesh, Matrix4, type Box3, type Object3D } from 'three';
import { CONTACT_SHADOW_LIFT_M, CONTACT_SHADOW_ORDER, CONTACT_SHADOW_SPREAD_M, contactShadowQuad } from '../car/carContactShadow.js';

/** The footprint the shared quad is drawn for (half width, half length, metres): each car scales it to its own. */
const HALF_X = 1, HALF_Z = 2.4;

/**
 * The contact shadow (`contactShadowQuad`) under the race cars that have no own one (far models and grey stand-ins), in one
 * instanced draw: a car turning near trades it for its full model's contact shadow and its sun shadow, so these no longer appear
 * from nothing. Each frame its owner places the cars (`begin`, `place`, `end`); only those draw.
 */
export interface BlobShadows {
  begin(): void;
  /**
   * The shadow under a car whose frame is `carMatrix` (in the blobs' parent), the road `roadY` metres up that frame; `footprint` is
   * the car's bounds in its frame (only x and z are read).
   */
  place(carMatrix: Matrix4, roadY: number, footprint: Box3): void;
  end(): void;
  dispose(): void;
}

/** `capacity` shadows at most; `warm` compiles them before they join `root`, once a first car needs one (the shell is started by then). */
export function createBlobShadows(root: Object3D, capacity: number, warm: (object: Object3D) => Promise<void>): BlobShadows {
  const {geometry, material} = contactShadowQuad(HALF_X, HALF_Z);
  const mesh = new InstancedMesh(geometry, material, capacity);
  // Its instances move every frame and only the placed ones draw: their bounds are not kept.
  mesh.name = 'race-blob-shadows'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.count = 0;
  mesh.renderOrder = CONTACT_SHADOW_ORDER;
  let ready = false, warming = false, disposed = false;
  const local = new Matrix4(), placed = new Matrix4();
  const scale = (half: number, nominal: number) => (half + CONTACT_SHADOW_SPREAD_M) / (nominal + CONTACT_SHADOW_SPREAD_M);
  return {
    begin() { mesh.count = 0; },
    place(carMatrix, roadY, {min, max}) {
      if (!ready && !warming) {
        warming = true;
        warm(mesh).then(() => { if (disposed) return; root.add(mesh); ready = true; }, () => { warming = false; });
      }
      if (!ready || mesh.count >= capacity) return;
      local.makeScale(scale((max.x - min.x) / 2, HALF_X), 1, scale((max.z - min.z) / 2, HALF_Z))
        .setPosition((min.x + max.x) / 2, roadY + CONTACT_SHADOW_LIFT_M, (min.z + max.z) / 2);
      mesh.setMatrixAt(mesh.count++, placed.multiplyMatrices(carMatrix, local));
    },
    end() { mesh.visible = mesh.count > 0; if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true; },
    dispose() {
      disposed = true;
      mesh.removeFromParent(); geometry.dispose(); mesh.dispose(); material.dispose();
    },
  };
}
