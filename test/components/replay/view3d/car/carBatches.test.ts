import { describe, expect, it } from 'vitest';
import { BatchedMesh, BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import { batchCarParts } from '../../../../../src/components/replay/view3d/car/carBatches.js';

/** A car envelope: a body and a wing in carbon, a wheel (carbon, turning) under a spin node, a lone tyre, a window and a lamp. */
function car() {
  const envelope = new Group(), carbon = new MeshStandardMaterial(), box = new BoxGeometry(1, 1, 1);
  const part = (name: string, material: MeshStandardMaterial | MeshBasicMaterial, x: number) => {
    const mesh = new Mesh(box, material); mesh.name = name; mesh.position.x = x; mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  };
  const body = part('body', carbon, 0), wing = part('wing', carbon, -2), spin = new Group(), rim = part('rim', carbon, 0);
  spin.name = 'spin'; spin.position.set(1, 0, 1); spin.add(rim);
  const tyre = part('tyre', new MeshStandardMaterial(), 1), glass = part('glass', new MeshStandardMaterial({ transparent: true }), 0);
  const lamp = part('lamp', new MeshBasicMaterial(), 0), glass2 = part('glass2', glass.material, 0);
  envelope.add(body, wing, spin, tyre, glass, glass2, lamp);
  envelope.position.set(1000, 0, -500);
  return { envelope, body, wing, rim, spin, tyre, glass };
}

const batchesOf = (envelope: Group) => envelope.children.filter((child): child is BatchedMesh => child instanceof BatchedMesh);

describe('batchCarParts', () => {
  it('draws the opaque parts that share a material as one batch, and leaves single, see-through and unlit parts alone', () => {
    const { envelope, body, wing, rim, tyre, glass } = car();
    batchCarParts(envelope);
    const batches = batchesOf(envelope);
    expect(batches).toHaveLength(1);
    expect(batches[0].material).toBe(body.material);
    expect(batches[0].castShadow).toBe(true);
    // The batched parts stay as stand-ins no camera draws; the others draw as before.
    for (const mesh of [body, wing, rim]) { expect(mesh.layers.mask).toBe(0); expect(mesh.castShadow).toBe(false); }
    for (const mesh of [tyre, glass]) expect(mesh.layers.mask).toBe(1);
    const at = new Matrix4();
    expect(new Vector3().setFromMatrixPosition(batches[0].getMatrixAt(2, at)).toArray()).toEqual([1, 0, 1]);
  });

  it('follows a turning wheel and a hidden part, in the envelope\'s frame', () => {
    const { envelope, rim, spin, wing } = car();
    const batches = batchCarParts(envelope), batch = batchesOf(envelope)[0], at = new Matrix4();
    spin.rotation.y = Math.PI / 2; wing.visible = false; envelope.position.set(-40, 3, 9);
    batches.sync();
    expect(batch.getVisibleAt(1)).toBe(false);
    expect(batch.getMatrixAt(2, at).equals(new Matrix4().copy(spin.matrix).multiply(rim.matrix))).toBe(true);
    wing.visible = true; batches.sync();
    expect(batch.getVisibleAt(1)).toBe(true);
    batches.dispose();
  });
});
