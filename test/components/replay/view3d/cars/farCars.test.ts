import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, RepeatWrapping, Scene, Texture } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createFarCarLoader } from '../../../../../src/components/replay/view3d/cars/farCars.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import type { CarTextures } from '../../../../../src/components/replay/view3d/cars/carModels.js';

type Role = 'paint' | 'appearance' | 'vertexColour';

/** Node has no FileReader, which the exporter reads its binary chunks with: a Blob-backed stand-in. */
class BlobFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void { void blob.arrayBuffer().then(bytes => { this.result = bytes; this.onloadend?.(); }); }
  readAsDataURL(blob: Blob): void { void blob.arrayBuffer().then(bytes => { this.result = `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`; this.onloadend?.(); }); }
}

/** A mesh of two triangles per option value (0 always, 1 wing_a, 2 wing_b), its material carrying the role. */
function primitive(role: Role | undefined, materialName: string): Mesh {
  const geometry = new BufferGeometry(), options = [0, 1, 2], position: number[] = [], option: number[] = [], index: number[] = [];
  options.forEach((value, triangle) => {
    for (let corner = 0; corner < 3; corner++) { position.push(triangle, corner, 0); option.push(value); index.push(triangle * 3 + corner); }
  });
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute('_LMU_OPTION', new BufferAttribute(new Float32Array(option), 1));
  geometry.setIndex(new BufferAttribute(new Uint16Array(index), 1));
  const material = new MeshStandardMaterial({name: materialName});
  material.userData = role ? {lmuFar: role, materialName} : {materialName};
  return new Mesh(geometry, material);
}

async function glb(roles: Array<Role | undefined>): Promise<ArrayBuffer> {
  const scene = new Scene(), far = new Group();
  far.name = 'far'; far.userData.lmuFar = {fromM: 60, optionNodes: ['wing_a', 'wing_b']};
  roles.forEach((role, at) => far.add(primitive(role, `mat${at}`)));
  scene.add(far);
  return await new GLTFExporter().parseAsync(scene, {binary: true}) as ArrayBuffer;
}

let sha = 0;
const reads: string[] = [];
function body(file: ArrayBuffer, appearance: Record<string, unknown>, vehicleId = 'CAR_A', farSha = `sha${sha++}`): LoadedBody {
  return {
    vehicleId,
    resource: {folder: 'car', far: {sha256: farSha, fromM: 60}, textures: [], vehicleIds: [vehicleId]},
    descriptor: {appearances: [{alias: vehicleId, albedo: 'paint.ktx2', optionNodes: ['wing_b'], materialTextures: {}, ...appearance}]},
    farFile: async () => { reads.push(farSha); return file; },
  } as unknown as LoadedBody;
}

function textures() {
  const load = vi.fn(async (_path: string, _interior: boolean, _start: unknown) => new Texture());
  return {load, carTextures: {load, copied: vi.fn()} as unknown as CarTextures};
}

describe('createFarCarLoader', () => {
  beforeAll(() => { vi.stubGlobal('FileReader', BlobFileReader); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('keeps the always-shown and shown option triangles, without the option attribute', async () => {
    const {carTextures} = textures();
    const model = await createFarCarLoader(carTextures).model(body(await glb(['vertexColour']), {}));
    const geometry = (model.children[0] as Mesh).geometry;
    // Triangles of option 0 (vertices 0-2) and wing_b (option 2, vertices 6-8); wing_a (vertices 3-5) is hidden.
    expect(model.children).toHaveLength(1);
    expect(Array.from(geometry.index!.array)).toEqual([0, 1, 2, 6, 7, 8]);
    expect(geometry.getAttribute('_lmu_option')).toBeUndefined();
    expect(geometry.getAttribute('position')).toBeDefined();
  });

  it('textures paint and retextured appearance primitives and leaves the others on the template material', async () => {
    const {carTextures, load} = textures();
    const file = await glb(['paint', 'appearance', 'appearance', 'vertexColour']);
    const model = await createFarCarLoader(carTextures).model(body(file, {materialTextures: {mat1: 'livery.ktx2'}}));
    const parts = model.children as Mesh[], materials = parts.map(part => part.material as MeshStandardMaterial);
    expect(parts).toHaveLength(4);
    expect(load.mock.calls.map(call => call[0]).sort()).toEqual(['livery.ktx2', 'paint.ktx2']);
    expect(materials[0].map).toBeInstanceOf(Texture);
    expect([materials[0].map?.wrapS, materials[0].map?.wrapT, materials[0].map?.channel]).toEqual([RepeatWrapping, RepeatWrapping, 0]);
    expect(materials[1].map).toBeInstanceOf(Texture);
    expect(materials[2].map).toBeNull();
    expect(materials[3].map).toBeNull();
    expect(materials[2].userData).toMatchObject({lmuFar: 'appearance', materialName: 'mat2'});
    expect(materials[3]).not.toBe(materials[0]);
    for (const part of parts) expect([part.castShadow, part.receiveShadow]).toEqual([false, false]);
  });

  it('shares materials and geometries between cars of a livery and parses the far file once', async () => {
    const {carTextures} = textures(), loader = createFarCarLoader(carTextures);
    const first = body(await glb(['paint', 'vertexColour']), {}), second = body(await glb(['paint', 'vertexColour']), {}, 'CAR_A', first.resource.far.sha256);
    const [a, b] = await Promise.all([loader.model(first), loader.model(second)]);
    const partsA = a.children as Mesh[], partsB = b.children as Mesh[];
    expect(reads.filter(read => read === first.resource.far.sha256)).toHaveLength(1);
    expect(a).not.toBe(b);
    partsA.forEach((part, at) => { expect(part.material).toBe(partsB[at].material); expect(part.geometry).toBe(partsB[at].geometry); });
  });

  it('rejects a primitive without a role, a missing appearance and a paint appearance without albedo', async () => {
    const {carTextures} = textures(), loader = createFarCarLoader(carTextures);
    await expect(loader.model(body(await glb([undefined]), {}))).rejects.toThrow('has no role');
    const file = await glb(['paint']);
    await expect(loader.model(body(file, {alias: 'OTHER'}))).rejects.toThrow('no appearance for CAR_A');
    await expect(loader.model(body(file, {albedo: undefined}))).rejects.toThrow('no paint albedo');
  });
});
