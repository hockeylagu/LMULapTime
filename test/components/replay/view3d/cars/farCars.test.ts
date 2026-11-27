import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, NoColorSpace, RepeatWrapping, Scene, SRGBColorSpace, Texture, type ShaderMaterial } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFarCarLoader } from '../../../../../src/components/replay/view3d/cars/farCars.js';
import { composedTextures } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import type { CarTextures } from '../../../../../src/components/replay/view3d/cars/carModels.js';

type Role = 'paint' | 'appearance' | 'vertexColour' | 'lamp';

/** Node has no FileReader, which the exporter reads its binary chunks with: a Blob-backed stand-in. */
class BlobFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void { void blob.arrayBuffer().then(bytes => { this.result = bytes; this.onloadend?.(); }); }
  readAsDataURL(blob: Blob): void { void blob.arrayBuffer().then(bytes => { this.result = `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`; this.onloadend?.(); }); }
}

/**
 * A mesh of two triangles per option value (0 always, 1 wing_a, 2 wing_b), its material carrying the role; a primitive that is
 * neither paint nor a lamp carries its surface per vertex unless `surface` is off, and is marked glass when `glass` says so.
 */
function primitive(role: Role | undefined, materialName: string, surface: boolean, glass: boolean, sortOffset?: number): Mesh {
  const geometry = new BufferGeometry(), options = [0, 1, 2], position: number[] = [], option: number[] = [], index: number[] = [];
  options.forEach((value, triangle) => {
    for (let corner = 0; corner < 3; corner++) { position.push(triangle, corner, 0); option.push(value); index.push(triangle * 3 + corner); }
  });
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute('_LMU_OPTION', new BufferAttribute(new Float32Array(option), 1));
  if (surface && role !== 'paint' && role !== 'lamp') geometry.setAttribute('_LMU_SURFACE', new BufferAttribute(new Uint8Array(option.flatMap(() => [128, 64, 255, 255])), 4, true));
  geometry.setIndex(new BufferAttribute(new Uint16Array(index), 1));
  const material = new MeshStandardMaterial({name: materialName});
  material.userData = role === 'lamp' ? {lmuFar: role, lamp: 1} : role ? {lmuFar: role, materialName, ...(glass ? {glass: true} : {})} : {materialName};
  // A blended primitive with its draw order (the game's sortOffset) in its extras.
  if (sortOffset !== undefined) { material.transparent = true; material.userData.sortOffset = sortOffset; }
  return new Mesh(geometry, material);
}

async function glb(roles: Array<Role | undefined>, surface = true, glass: readonly number[] = [], sortOffsets: Record<number, number> = {}): Promise<ArrayBuffer> {
  const scene = new Scene(), far = new Group();
  far.name = 'far'; far.userData.lmuFar = {fromM: 60, optionNodes: ['wing_a', 'wing_b']};
  roles.forEach((role, at) => far.add(primitive(role, `mat${at}`, surface, glass.includes(at), sortOffsets[at])));
  scene.add(far);
  return await new GLTFExporter().parseAsync(scene, {binary: true}) as ArrayBuffer;
}

const region = { baseCoatRoughness: 0.3, baseCoatSpecStrength: 0.5, baseCoatRefractiveIndex: 2.25, clearCoatSpecStrength: 1, clearCoatRoughness: 0,
  clearCoatRefractiveIndex: 1.44, lacquerColour: [0.3, 0.3, 0.3, 1], metallicPaintStrength: 0, carbonFibreStrength: 1 };
/** A livery's paint description with the maps given (path and whether it is a colour stage). */
const paint = (maps: Record<string, [string, boolean]> = {}) => ({
  normalShadowInfluence: 0.5, maps: Object.fromEntries(Object.entries(maps).map(([key, [texture, srgb]]) => [key, { texture, srgb, uv: 'uv0', scale: [1, 1] }])),
  parameters: { regions: { black: region, red: region, green: region, blue: region, white: region }, clearCoatStrength: 0.5, lacquerThickness: 0.3,
    carbonFibreAlbedoColour: [0.4, 0.4, 0.4, 0], metallicFlakeColour: [1, 1, 1], uvScale: { carbonFibre: [125, 125] } },
});
/** A far material: composed on the lit template (farCars.ts). */
const composed = (part: Mesh) => part.material as ShaderMaterial;
let sha = 0;
const reads: string[] = [];
function body(file: ArrayBuffer, appearance: Record<string, unknown>, vehicleId = 'CAR_A', farSha = `sha${sha++}`): LoadedBody {
  return {
    vehicleId,
    resource: {folder: 'car', far: {sha256: farSha, fromM: 60}, textures: [], vehicleIds: [vehicleId]},
    descriptor: {lamps: [{role: 'tail'}, {role: 'brake'}], appearances: [{alias: vehicleId, albedo: 'paint.ktx2', paint: paint(), optionNodes: ['wing_b'], materialTextures: {}, ...appearance}]},
    farFile: async () => { reads.push(farSha); return file; },
  } as unknown as LoadedBody;
}

function textures() {
  const load = vi.fn(async (_path: string, _start: unknown) => new Texture());
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

  it("draws blended primitives in the game's order (their extras' sortOffset), the others at 0", async () => {
    const {carTextures} = textures();
    const file = await glb(['vertexColour', 'vertexColour', 'appearance', 'vertexColour'], true, [1], {1: 5, 2: 3, 3: 0});
    const model = await createFarCarLoader(carTextures).model(body(file, {materialTextures: {mat2: 'livery.ktx2'}}));
    expect((model.children as Mesh[]).map(part => part.renderOrder)).toEqual([0, 5, 3, 0]);
  });

  it('textures paint and retextured appearance primitives and leaves the others on the template material', async () => {
    const {carTextures, load} = textures();
    const file = await glb(['paint', 'appearance', 'appearance', 'vertexColour']);
    const model = await createFarCarLoader(carTextures).model(body(file, {materialTextures: {mat1: 'livery.ktx2'}}));
    const parts = model.children as Mesh[], materials = parts.map(composed), map = (material: ShaderMaterial) => material.uniforms.map?.value as Texture | undefined;
    expect(parts).toHaveLength(4);
    expect(load.mock.calls.map(call => call[0]).sort()).toEqual(['livery.ktx2', 'paint.ktx2']);
    expect(map(materials[0])).toBeInstanceOf(Texture);
    expect([map(materials[0])?.wrapS, map(materials[0])?.wrapT, map(materials[0])?.channel]).toEqual([RepeatWrapping, RepeatWrapping, 0]);
    expect(map(materials[1])).toBeInstanceOf(Texture);
    expect(composedTextures(materials[1])).toEqual([map(materials[1])]);
    expect(map(materials[2])).toBeUndefined();
    expect(map(materials[3])).toBeUndefined();
    expect(materials[2].userData).toMatchObject({lmuFar: 'appearance', materialName: 'mat2'});
    expect(materials[3]).not.toBe(materials[0]);
    for (const part of parts) expect([part.castShadow, part.receiveShadow]).toEqual([true, true]);
  });

  it("draws the paint with the livery's paint layers, as the full model's paint takes its diffuse light", async () => {
    const {carTextures, load} = textures(), loader = createFarCarLoader(carTextures);
    const layered = body(await glb(['paint', 'vertexColour']), {paint: paint({region: ['region.ktx2', true], aoSpec: ['ao.ktx2', true], carbon: ['carbon.ktx2', false]})});
    const [painted, shell] = ((await loader.model(layered)).children as Mesh[]).map(composed);
    // The layers' maps load beside the albedo, each the material's own copy decoded by its role.
    expect(load.mock.calls.map(call => call[0]).sort()).toEqual(['ao.ktx2', 'carbon.ktx2', 'paint.ktx2', 'region.ktx2']);
    const shader = painted, maps = ['paint_region', 'paint_aoSpec', 'paint_carbon'].map(key => shader.uniforms[key].value as Texture);
    expect(maps.map(map => map.colorSpace)).toEqual([SRGBColorSpace, SRGBColorSpace, NoColorSpace]);
    expect(new Set([painted.uniforms.map.value, ...maps]).size).toBe(4);
    // The region block, the diffuse light's losses and the lacquer; the sun's shadow, the ambient lookup and the haze stay.
    for (const marker of ['paintCoat = clamp(coat.x * paint_coatStrength', 'reflectedLight.indirectDiffuse *= paintAO;', 'paintFresnelAvg(sunCos, paintCoatIndex)',
      'surfaceCascadeShadow', 'vec3( 1.0, 0.5, 1.0 )',
      // Both coats reflect the environment: the base coat at its own roughness and strength, the clear coat over everything under it.
      'roughnessFactor = clamp(paintBaseRoughness, 0.0, 1.0);', 'material.specularColor = vec3(paintBaseF0 * paintBaseSpecular);',
      'reflectedLight.indirectSpecular = radiance * paintBaseSpecular * (paintBaseF0 + (1.0 - paintBaseF0) * grazing);',
      'farCoatLight = getIBLRadiance(geometryViewDir, normal, paintCoatRoughness) * paintCoatOcclusion;',
      'outgoingLight = (totalDiffuse + totalSpecular) * mix(vec3(1.0), pow(paintLacquer', 'lit_sunDirection', 'HAZE_DISTANCE_SCALE', '* (1.0 - farCoatFresnel) + farCoatLight * farCoatFresnel + totalEmissiveRadiance;']) expect(shader.fragmentShader).toContain(marker);
    expect(painted.customProgramCacheKey()).not.toBe(shell.customProgramCacheKey());
    expect(shell.fragmentShader).not.toContain('paintAO');
    expect(shader.fragmentShader).not.toContain('vFarSurface');
    // The warm-up uploads the layers' maps with the albedo.
    expect(composedTextures(painted)).toEqual(expect.arrayContaining([painted.uniforms.map.value, ...maps]));
    const freed = maps.map(map => vi.spyOn(map, 'dispose'));
    painted.dispose();
    for (const dispose of freed) expect(dispose).toHaveBeenCalledOnce();

    // A paint without a region map or an AO mask is all black region and unoccluded: its own program.
    const bare = composed((await loader.model(body(await glb(['paint']), {}))).children[0] as Mesh);
    expect(bare.customProgramCacheKey()).not.toBe(painted.customProgramCacheKey());
    const fragment = bare.fragmentShader;
    expect(fragment).toContain('vec3 region = vec3(0.0);'); expect(fragment).toContain('vec4 aoSpec = vec4(1.0);');
  });

  it("draws every other primitive with the surface its vertices carry, as the full model's standard surface takes it", async () => {
    const {carTextures} = textures(), loader = createFarCarLoader(carTextures);
    const parts = (await loader.model(body(await glb(['appearance', 'vertexColour']), {materialTextures: {mat0: 'livery.ktx2'}}))).children as Mesh[];
    for (const part of parts) {
      const surface = part.geometry.getAttribute('_lmu_surface');
      expect([surface.itemSize, surface.normalized, surface.getX(0), surface.getY(0)]).toEqual([4, true, 128 / 255, 64 / 255]);
      const shader = composed(part);
      expect(shader.vertexShader).toContain('vFarSurface = _lmu_surface;');
      for (const marker of ['metalnessFactor = vFarSurface.x;', 'roughnessFactor = clamp(vFarSurface.y, 0.045, 1.0);',
        'reflectedLight.indirectDiffuse *= vFarSurface.z; reflectedLight.indirectSpecular *= vFarSurface.w;', 'surfaceCascadeShadow']) expect(shader.fragmentShader).toContain(marker);
      // The glTF material's own values, as uniforms: its colour, finish and emission.
      expect([shader.uniforms.roughness.value, shader.uniforms.metalness.value]).toEqual([1, 0]);
    }
    // Glass (a retextured windscreen, a vertex-coloured pane) adds its reflections at whole strength, in a program of its own.
    const glazed = (await loader.model(body(await glb(['appearance', 'vertexColour', 'vertexColour'], true, [0, 1]), {materialTextures: {mat0: 'livery.ktx2'}}))).children as Mesh[];
    const [screen, pane, shell] = glazed.map(composed), wholeStrength = 'totalSpecular / clamp(diffuseColor.a + 0.001, 0.001, 1.0)';
    expect(pane.customProgramCacheKey()).not.toBe(shell.customProgramCacheKey());
    for (const material of [screen, pane]) expect(material.fragmentShader).toContain(wholeStrength);
    expect(shell.fragmentShader).not.toContain(wholeStrength);
    // A package whose far shell carries no surface is not drawn as if it were all bare diffuse.
    await expect(loader.model(body(await glb(['paint', 'vertexColour'], false), {}))).rejects.toThrow('far primitive has no _LMU_SURFACE');
  });

  it("frees a far material's own glTF map with it, never a shared asset", async () => {
    const {carTextures} = textures(), own = new Texture(), shared = new Texture();
    shared.userData.sharedAsset = true;
    // The exporter writes no texture without an image: the parsed materials take theirs here (the parse inside is the spy's second
    // call, three's own).
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    parse.mockImplementationOnce(async function (this: GLTFLoader, ...args: Parameters<GLTFLoader['parseAsync']>) {
      const gltf = await this.parseAsync(...args);
      const [first, second] = gltf.scene.getObjectByName('far')!.children as Mesh<BufferGeometry, MeshStandardMaterial>[];
      first.material.map = own; second.material.map = shared;
      return gltf;
    });
    const [mapped, sharing] = ((await createFarCarLoader(carTextures).model(body(await glb(['vertexColour', 'vertexColour']), {}))).children as Mesh[]).map(composed);
    expect([mapped.uniforms.map.value, sharing.uniforms.map.value]).toEqual([own, shared]);
    const freedOwn = vi.spyOn(own, 'dispose'), freedShared = vi.spyOn(shared, 'dispose');
    mapped.dispose(); sharing.dispose();
    expect(freedOwn).toHaveBeenCalledOnce(); expect(freedShared).not.toHaveBeenCalled();
    parse.mockRestore();
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

  it('keeps a lamp glow mesh out of the far car and hands it over with the option part names', async () => {
    const {carTextures} = textures(), loader = createFarCarLoader(carTextures), car = body(await glb(['vertexColour', 'lamp']), {});
    expect((await loader.model(car)).children).toHaveLength(1);
    const {optionNodes, lamps} = await loader.lamps(car);
    expect([optionNodes, lamps.map(each => each.lamp)]).toEqual([['wing_a', 'wing_b'], [1]]);
    // The glow mesh keeps its option attribute: the glows split it by option part.
    expect([lamps[0].geometry.getAttribute('_lmu_option').count, lamps[0].geometry.index!.count]).toEqual([9, 9]);
    expect(reads.filter(read => read === car.resource.far.sha256)).toHaveLength(1);
    const unknown = body(await glb(['lamp']), {});
    (unknown.descriptor as {lamps: unknown[]}).lamps = [];
    await expect(loader.lamps(unknown)).rejects.toThrow('names no lamp of the body');
  });

  it('rejects a primitive without a role, a missing appearance and a paint appearance without albedo', async () => {
    const {carTextures} = textures(), loader = createFarCarLoader(carTextures);
    await expect(loader.model(body(await glb([undefined]), {}))).rejects.toThrow('has no role');
    const file = await glb(['paint']);
    await expect(loader.model(body(file, {alias: 'OTHER'}))).rejects.toThrow('no appearance for CAR_A');
    await expect(loader.model(body(file, {albedo: undefined}))).rejects.toThrow('no paint albedo');
  });
});
