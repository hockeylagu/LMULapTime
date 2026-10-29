import { expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { makeCar } from '../../../../src/components/replay/view3d/sceneObjects.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';

const lap: ReplayTrajectoryData = {replayName: 'test', points: [], pointsCount: 0, bounds: {minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1}};

it('preserves real model and tyre placement and gives primary/ghost independent materials', () => {
  const source = new Group(), bodyMaterial = new MeshStandardMaterial({color: '#ffffff'}); bodyMaterial.name = 'body';
  const body = new Mesh(new BoxGeometry(2, 1, 4), bodyMaterial); body.name = 'body';
  const rubberMaterial = new MeshStandardMaterial({color: '#111111'}); rubberMaterial.name = 'tyres';
  const tyre = new Mesh(new BoxGeometry(0.3, 0.65, 0.65), rubberMaterial); tyre.name = 'tyres'; tyre.position.set(0.8, 0.27, -1.4);
  source.add(body, tyre);
  const primary = makeCar(lap, '#38bdf8', false, source), ghost = makeCar(lap, '#ffb703', true, source);
  const actualBody = primary.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const ghostBody = ghost.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
  expect(actualBody.material).not.toBe(ghostBody.material); expect(actualBody.material).not.toBe(bodyMaterial);
  expect(actualBody.material.color.getHexString()).toBe('38bdf8'); expect(ghostBody.material.color.getHexString()).toBe('ffb703');
  expect(actualBody.material.opacity).toBe(1); expect(ghostBody.material.opacity).toBe(0.45); expect(bodyMaterial.opacity).toBe(1);
  expect(actualBody.material.polygonOffset).toBe(false); expect(ghostBody.material.polygonOffset).toBe(true);
  expect(primary.getObjectByName('tyres')?.position.toArray()).toEqual([0.8, 0.27, -1.4]);
  const actualTyre = primary.getObjectByName('tyres') as Mesh<BoxGeometry, MeshStandardMaterial>;
  expect(actualTyre.material.color.getHexString()).toBe('111111');
  expect(primary.getObjectByName('body-envelope')?.scale.toArray()).toEqual([1, 1, 1]);
  expect(source.getObjectByName('tyres')?.position).toEqual(new Vector3(0.8, 0.27, -1.4));
});
