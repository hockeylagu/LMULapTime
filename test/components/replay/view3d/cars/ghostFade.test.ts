import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { ghostFader } from '../../../../../src/components/replay/view3d/cars/ghostFade.js';

/** A 4 m long, 2 m wide, 1 m tall ghost at 0.45 opacity, placed 100 m along x and turned a quarter. */
function ghostCar() {
  const material = new MeshStandardMaterial({ transparent: true, opacity: 0.45 });
  const ghost = new Group();
  ghost.add(new Mesh(new BoxGeometry(2, 1, 4), material));
  ghost.position.set(100, 0, 0);
  ghost.rotation.y = Math.PI / 2;
  return { ghost, material };
}

const cameraAt = (x: number, y: number, z: number) => {
  const camera = new PerspectiveCamera();
  camera.position.set(x, y, z);
  camera.updateMatrixWorld();
  return camera;
};

describe('ghostFader', () => {
  it('hides the ghost with the camera inside its body and fades it within a metre of it', () => {
    const { ghost, material } = ghostCar();
    const fade = ghostFader(ghost);

    // Turned a quarter, the ghost's length runs along x: 1.5 m ahead of its centre is still inside it.
    fade(cameraAt(101.5, 0.2, 0));
    expect(material.visible).toBe(false);
    expect(material.opacity).toBe(0);

    // Half a metre off its side (its width now runs along z).
    fade(cameraAt(100, 0, 1.5));
    expect(material.visible).toBe(true);
    expect(material.opacity).toBeCloseTo(0.225);

    fade(cameraAt(100, 0, 6));
    expect(material.opacity).toBeCloseTo(0.45);
  });
});
