import { expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { makeCar } from '../../../../src/components/replay/view3d/sceneObjects.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';

const lap: ReplayTrajectoryData = {replayName: 'test', points: [], pointsCount: 0, bounds: {minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1}};

it('preserves real model and tyre placement and gives primary/ghost independent materials', () => {
  const source = new Group(), bodyMaterial = new MeshStandardMaterial({color: '#ffffff', roughness: 0.27, metalness: 0.12}); bodyMaterial.name = 'body';
  const body = new Mesh(new BoxGeometry(2, 1, 4), bodyMaterial); body.name = 'body';
  const rubberMaterial = new MeshStandardMaterial({color: '#111111'}); rubberMaterial.name = 'tyres';
  const tyre = new Mesh(new BoxGeometry(0.3, 0.65, 0.65), rubberMaterial); tyre.name = 'tyres'; tyre.position.set(0.8, 0.27, -1.4);
  source.add(body, tyre);
  const primary = makeCar(lap, '#38bdf8', false, source), ghost = makeCar(lap, '#ffb703', true, source);
  const actualBody = primary.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const ghostBody = ghost.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
  expect(actualBody.material).not.toBe(ghostBody.material); expect(actualBody.material).not.toBe(bodyMaterial);
  expect(actualBody.geometry).not.toBe(ghostBody.geometry); expect(actualBody.geometry).not.toBe(body.geometry);
  expect(actualBody.material.color.getHexString()).toBe('38bdf8'); expect(ghostBody.material.color.getHexString()).toBe('ffb703');
  expect(actualBody.material.opacity).toBe(1); expect(ghostBody.material.opacity).toBe(0.45); expect(bodyMaterial.opacity).toBe(1);
  expect(actualBody.material.polygonOffset).toBe(false); expect(ghostBody.material.polygonOffset).toBe(true);
  expect(actualBody.material.flatShading).toBe(false);
  expect(actualBody.material.roughness).toBe(0.27); expect(actualBody.material.metalness).toBe(0.12);
  expect(actualBody.material.envMap).toBeNull(); expect(actualBody.material.envMapIntensity).toBe(1);
  expect(ghostBody.material.roughness).toBe(0.7); expect(ghostBody.material.envMap).toBeNull();
  expect(primary.getObjectByName('tyres')?.position.toArray()).toEqual([0.8, 0.27, -1.4]);
  const actualTyre = primary.getObjectByName('tyres') as Mesh<BoxGeometry, MeshStandardMaterial>;
  expect(actualTyre.material.color.getHexString()).toBe('111111');
  expect(primary.getObjectByName('body-envelope')?.scale.toArray()).toEqual([1, 1, 1]);
  expect(source.getObjectByName('tyres')?.position).toEqual(new Vector3(0.8, 0.27, -1.4));
});

it('applies livery texture only to livery material when UV coordinates exist', () => {
  const source = new Group();
  const liveryMaterial = new MeshStandardMaterial({color: '#a6aeb8'}); liveryMaterial.name = 'livery';
  const geom = new BoxGeometry(2, 1, 4);
  const liveryMesh = new Mesh(geom, liveryMaterial); liveryMesh.name = 'livery';
  const bodyMaterial = new MeshStandardMaterial({color: '#ffffff'}); bodyMaterial.name = 'body';
  const bodyMesh = new Mesh(new BoxGeometry(1, 1, 1), bodyMaterial); bodyMesh.name = 'body';
  source.add(liveryMesh, bodyMesh);

  const texture = new Texture();
  const primary = makeCar(lap, '#38bdf8', false, source, texture);
  const actualLivery = primary.getObjectByName('livery') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const actualBody = primary.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;

  // Livery mesh has UVs (BoxGeometry provides UVs) so it receives texture and white color
  expect(actualLivery.material.map).toBe(texture);
  expect(actualLivery.material.color.getHexString()).toBe('ffffff');

  // Body mesh does not have 'livery' material name so it keeps lap color and no texture
  expect(actualBody.material.map).toBeNull();
  expect(actualBody.material.color.getHexString()).toBe('38bdf8');
});

it('leaves livery material untextured when UV coordinates are absent', () => {
  const source = new Group();
  const liveryMaterial = new MeshStandardMaterial({color: '#a6aeb8'}); liveryMaterial.name = 'livery';
  const geom = new BoxGeometry(2, 1, 4);
  geom.deleteAttribute('uv');
  const liveryMesh = new Mesh(geom, liveryMaterial); liveryMesh.name = 'livery';
  source.add(liveryMesh);

  const texture = new Texture();
  const primary = makeCar(lap, '#38bdf8', false, source, texture);
  const actualLivery = primary.getObjectByName('livery') as Mesh<BoxGeometry, MeshStandardMaterial>;

  expect(actualLivery.material.map).toBeNull();
  expect(actualLivery.geometry.attributes.uv).toBeUndefined();
});

it('preserves authored glass and paint materials and lets ghosts opt out of scene reflections', () => {
  const source = new Group();
  const glassMaterial = new MeshStandardMaterial({color: '#111111', roughness: 0.18, metalness: 0.05}); glassMaterial.name = 'glass';
  const glassMesh = new Mesh(new BoxGeometry(1, 1, 1), glassMaterial); glassMesh.name = 'glass';
  const liveryMaterial = new MeshStandardMaterial({color: '#ffffff', roughness: 0.35, metalness: 0.03}); liveryMaterial.name = 'livery';
  const liveryMesh = new Mesh(new BoxGeometry(1, 1, 1), liveryMaterial); liveryMesh.name = 'livery';
  source.add(glassMesh, liveryMesh);

  const primary = makeCar(lap, '#38bdf8', false, source);
  const ghost = makeCar(lap, '#ffb703', true, source);

  const primaryGlass = primary.getObjectByName('glass') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const ghostGlass = ghost.getObjectByName('glass') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const primaryLivery = primary.getObjectByName('livery') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const ghostLivery = ghost.getObjectByName('livery') as Mesh<BoxGeometry, MeshStandardMaterial>;

  expect(primaryGlass.material.roughness).toBe(0.18);
  expect(primaryGlass.material.metalness).toBe(0.05);
  expect(primaryGlass.material.envMap).toBeNull();
  expect(primaryGlass.material.envMapIntensity).toBe(1);
  expect(ghostGlass.material.roughness).toBe(0.7);
  expect(ghostGlass.material.envMap).toBeNull();
  expect(ghostGlass.material.envMapIntensity).toBe(0);

  expect(primaryLivery.material.roughness).toBe(0.35);
  expect(primaryLivery.material.metalness).toBe(0.03);
  expect(primaryLivery.material.envMap).toBeNull();
  expect(primaryLivery.material.envMapIntensity).toBe(1);
  expect(ghostLivery.material.roughness).toBe(0.7);
  expect(ghostLivery.material.envMap).toBeNull();

  const fallbackPrimary = makeCar(lap, '#38bdf8', false, null);
  const fallbackGhost = makeCar(lap, '#ffb703', true, null);
  const fallbackBody = fallbackPrimary.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const fallbackCabin = fallbackPrimary.getObjectByName('cabin') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const ghostFallbackBody = fallbackGhost.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const ghostFallbackCabin = fallbackGhost.getObjectByName('cabin') as Mesh<BoxGeometry, MeshStandardMaterial>;

  expect(fallbackBody.material.roughness).toBe(0.35);
  expect(fallbackBody.material.envMap).toBeNull();
  expect(fallbackBody.material.envMapIntensity).toBe(1);
  expect(fallbackCabin.material.roughness).toBe(0.18);
  expect(fallbackCabin.material.envMap).toBeNull();
  expect(fallbackCabin.material.envMapIntensity).toBe(1);

  expect(ghostFallbackBody.material.roughness).toBe(0.7);
  expect(ghostFallbackBody.material.envMap).toBeNull();
  expect(ghostFallbackCabin.material.roughness).toBe(0.7);
  expect(ghostFallbackCabin.material.envMap).toBeNull();
});
