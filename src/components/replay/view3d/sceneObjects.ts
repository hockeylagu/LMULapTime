import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { defaultVehicleSize } from '../../../../shared/domain/vehicleDimensions.js';

export function makeCar(trajectory: ReplayTrajectoryData, color: string, ghost: boolean, model: Group | null = null): Group {
  const car = new Group(), dimensions = trajectory.vehicleData?.dimensions ?? defaultVehicleSize(trajectory.vehicleIdentity?.carClass);
  const material = new MeshStandardMaterial({ color, transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost, roughness: 0.7 });
  const envelope = model ? model.clone(true) : new Group();
  if (model) {
    envelope.traverse(object => {
      if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return;
      const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const copies = originals.map(source => {
        const copy = source.clone();
        if (copy instanceof MeshStandardMaterial && copy.name === 'body') copy.color.set(color);
        copy.transparent = ghost; copy.opacity = ghost ? 0.45 : 1; copy.depthWrite = !ghost;
        // Same-station laps can overlap exactly. Bias only fragment depth, never model coordinates.
        copy.polygonOffset = ghost; copy.polygonOffsetFactor = -1; copy.polygonOffsetUnits = -1;
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? copies : copies[0];
    });
  } else {
    const width = dimensions.widthM, length = dimensions.lengthM;
    const body = new Mesh(new BoxGeometry(width * 0.78, 0.5, length), material);
    body.position.y = 0.2;
    const cabin = new Mesh(new BoxGeometry(width * 0.55, 0.4, length * 0.37), material);
    cabin.position.set(0, 0.62, 0.1);
    const nose = new Mesh(new BoxGeometry(width * 0.6, 0.03, 0.45), new MeshStandardMaterial({color: '#f8f9fa', transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost}));
    nose.position.set(0, 0.46, -length * 0.35); envelope.add(body, cabin, nose);
    envelope.add(...estimatedWheels(trajectory.handlingCalibration?.wheelbaseM ?? length * 0.6, width, ghost));
  }
  const offset = trajectory.vehicleData?.replayOriginOffsetXZ ?? [0, 0];
  envelope.position.set(offset[0], 0, offset[1]);
  const marker = new Mesh(new SphereGeometry(0.65, 12, 8), material); marker.name = 'pose-marker'; marker.visible = false;
  envelope.name = 'body-envelope'; car.add(envelope, marker);
  return car;
}

const ESTIMATED_TYRE_RADIUS_M = 0.34, ESTIMATED_TYRE_WIDTH_M = 0.3;

/** Class-sized tyres/rims baked at the four corners, in the same layout as exported game meshes,
 * so the shared wheel rig spins, steers and grounds them. The hexagonal rim makes rotation visible. */
function estimatedWheels(wheelbaseM: number, widthM: number, ghost: boolean): Mesh[] {
  const parts = [
    {name: 'tyres', radius: ESTIMATED_TYRE_RADIUS_M, width: ESTIMATED_TYRE_WIDTH_M, segments: 20, color: '#1b1d22'},
    {name: 'rims', radius: ESTIMATED_TYRE_RADIUS_M * 0.62, width: ESTIMATED_TYRE_WIDTH_M + 0.01, segments: 6, color: '#9aa3ad'},
  ];
  return parts.map(part => {
    const corners: BufferGeometry[] = [];
    for (const z of [-wheelbaseM / 2, wheelbaseM / 2]) for (const x of [1, -1]) {
      const wheel = new CylinderGeometry(part.radius, part.radius, part.width, part.segments).toNonIndexed();
      wheel.rotateZ(Math.PI / 2); wheel.translate(x * (widthM / 2 - ESTIMATED_TYRE_WIDTH_M / 2), 0, z);
      corners.push(wheel);
    }
    const geometry = mergeGeometries(corners); corners.forEach(corner => corner.dispose());
    const mesh = new Mesh(geometry, new MeshStandardMaterial({color: part.color, roughness: 0.8, transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost}));
    mesh.name = part.name;
    return mesh;
  });
}
