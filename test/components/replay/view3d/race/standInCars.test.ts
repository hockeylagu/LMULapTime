import { BoxGeometry, BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createStandInCars, standInGeometry } from '../../../../../src/components/replay/view3d/race/standInCars.js';

/** A car group as the far loader builds it: two parts under `body-envelope`, placed by their own matrices. */
function farCar(): Group {
  const car = new Group(), envelope = new Group();
  envelope.name = 'body-envelope'; envelope.position.y = 0.2;
  const body = new Mesh(new BoxGeometry(2, 1, 4.6), new MeshStandardMaterial()); body.position.y = 0.5;
  // A wing stored quantized, as the package's meshes may be: 1 m wide, from 1 m to 1.1 m up, 2 m back.
  const wing = new BufferGeometry();
  wing.setAttribute('position', new BufferAttribute(new Int16Array([-16384, 32767, 0, 16384, 32767, 0, 0, 29491, 0]), 3, true));
  const wingMesh = new Mesh(wing, new MeshStandardMaterial()); wingMesh.position.set(0, 0, -2); wingMesh.scale.set(1, 1.1, 1);
  envelope.add(body, wingMesh); car.add(envelope);
  return car;
}

describe('race stand-in cars', () => {
  it("merges a car's body parts into one geometry in the car's frame, its lowest point at the car's origin", () => {
    const geometry = standInGeometry(farCar());
    geometry.computeBoundingBox();
    const {min, max} = geometry.boundingBox!;
    // The body's bottom (0.2 m up the envelope) comes down to 0; the wing's top was 0.2 + 1.1 m up.
    expect(min.y).toBeCloseTo(0, 6); expect(max.y).toBeCloseTo(1.1, 3);
    [[min.x, -1], [max.x, 1], [min.z, -2.3], [max.z, 2.3]].forEach(([got, want]) => expect(got).toBeCloseTo(want, 3));
    expect(geometry.getAttribute('position').count).toBe(24 + 3); expect(geometry.getIndex()!.count).toBe(36 + 3);
    expect(geometry.getAttribute('normal')).toBeDefined();
  });

  it('draws a waiting car as its class stand-in once compiled (another class its stand-in), only the cars placed this frame', async () => {
    const root = new Group();
    let compiled!: () => void;
    const warm = () => new Promise<void>(resolve => { compiled = resolve; });
    const standIns = createStandInCars(root, 8, warm), at = new Matrix4().setPosition(new Vector3(3, 0, 4));
    standIns.begin();
    expect(standIns.place('GT3', at)).toBe(false); // No stand-in yet: the car draws nothing.
    standIns.offer('GT3', farCar());
    expect(standIns.place('GT3', at)).toBe(false); // Still compiling.
    compiled(); await Promise.resolve();
    const [mesh] = root.children as InstancedMesh[];
    standIns.begin();
    // A class without its own stand-in borrows the GT3 one.
    expect([standIns.place('GT3', at), standIns.place('GT3', at), standIns.place('Hypercar', at)]).toEqual([true, true, true]);
    standIns.end();
    expect([mesh.count, mesh.visible, mesh.castShadow]).toEqual([3, true, false]);
    expect(new Matrix4().fromArray(mesh.instanceMatrix.array, 0).equals(at)).toBe(true);
    // A second body of the class changes nothing; with every car loaded none draws.
    standIns.offer('GT3', farCar()); expect(root.children).toHaveLength(1);
    standIns.begin(); standIns.end();
    expect([mesh.count, mesh.visible]).toEqual([0, false]);
    standIns.dispose(); expect(root.children).toHaveLength(0);
  });
});
