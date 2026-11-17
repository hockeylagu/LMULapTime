import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, BufferAttribute, Group, InstancedMesh, Matrix4, Texture, Vector3, type BufferGeometry, type Material } from 'three';
import { createFarGlows } from '../../../../../src/components/replay/view3d/cars/farGlows.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import type { FarLamps } from '../../../../../src/components/replay/view3d/cars/farCars.js';

const emission = { scale: 1, vertexColour: false, viewBoost: null, ambientScaled: false, vertexAlpha: false };
const descriptor = {
  optionNodes: ['option_Lights'],
  appearances: [{ alias: 'A', optionNodes: ['option_Lights'] }, { alias: 'B', optionNodes: [] }],
  materials: [],
  lamps: [
    // A brake lamp under an option part, and a headlight; a tail lamp without states never glows far.
    { role: 'brake', nodes: ['rear'], material: 'blglo', frames: ['textures/off.ktx2.zst', 'textures/brake.ktx2.zst'], states: { off: 0, on: null, brake: 1 }, emission, blend: 'alpha' },
    { role: 'headlight', nodes: ['front'], material: 'hlglo', frames: ['textures/hoff.ktx2.zst', 'textures/hon.ktx2.zst'], states: { off: 0, on: 1, brake: null }, emission, blend: 'alpha' },
    { role: 'tail', nodes: ['rear'], material: 'tail', frames: ['textures/tail.ktx2.zst'], states: null, emission, blend: 'alpha' },
  ],
};
// The brake frame has a start file (reduced levels): the far glow loads that instead.
const textures = [{ sha256: 'brake', levels: 12, start: { sha256: 'brake-start', levels: 10 } }, { sha256: 'hon', start: null }];
const body = (alias: string) => ({ vehicleId: alias, resource: { folder: 'proto', textures }, descriptor }) as unknown as LoadedBody;

/** A lamp's glow mesh as the far model carries it: in the body's frame at `z`, each of its six faces under the option part given (0: none). */
function glowMesh(z: number, faceOptions: number[]): BufferGeometry {
  const geometry = new BoxGeometry(0.2, 0.1, 0.05).translate(0, 0, z);
  geometry.setAttribute('_lmu_option', new BufferAttribute(Float32Array.from({ length: 24 }, (_, vertex) => faceOptions[Math.floor(vertex / 4)]), 1));
  return geometry;
}

/** A body's far lamps: the brake glow under its option part 2 m behind the origin, the headlight glow 2 m ahead, and the tail lamp's. */
const farLamps = (brakeFaces = [1, 1, 1, 1, 1, 1]): FarLamps => ({
  optionNodes: ['option_Lights'],
  lamps: [{ lamp: 0, geometry: glowMesh(-2, brakeFaces) }, { lamp: 1, geometry: glowMesh(2, [0, 0, 0, 0, 0, 0]) }, { lamp: 2, geometry: glowMesh(-2, [0, 0, 0, 0, 0, 0]) }],
});

async function loadedGlows(far = farLamps()) {
  const parent = new Group(), changed = vi.fn();
  const textures = { load: vi.fn(async (_path: string) => new Texture()), copied: vi.fn() };
  const glows = createFarGlows(parent, textures, async () => {}, changed);
  const at = (x: number) => new Matrix4().makeTranslation(x, 0, 0);
  glows.lamps(body('A'), far);
  glows.draw([{ body: body('A'), frame: at(0), braking: false, headlights: false }]);
  await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
  const meshes = () => parent.getObjectsByProperty('isInstancedMesh', true) as InstancedMesh[];
  const byName = (name: string) => meshes().filter(mesh => mesh.name === `far-glow-${name}`);
  return { glows, at, meshes, byName, textures };
}

describe('createFarGlows', () => {
  it('draws a far car brake light while it brakes and its headlights while they are on, on its body frame', async () => {
    const { glows, at, meshes, byName, textures } = await loadedGlows();
    // The brake and headlight lit frames only: no off frame, and no lamp without states.
    expect(meshes().map(mesh => mesh.name).sort()).toEqual(['far-glow-blglo', 'far-glow-hlglo']);
    expect(textures.load.mock.calls.map(call => String(call[0])).sort((a, b) => a.localeCompare(b))).toEqual(['textures/brake-start.ktx2.zst', 'textures/hon.ktx2.zst']);
    // Dark: nothing draws.
    expect(meshes().map(mesh => [mesh.visible, mesh.count])).toEqual([[false, 0], [false, 0]]);

    glows.draw([{ body: body('A'), frame: at(10), braking: true, headlights: false }, { body: body('A'), frame: at(20), braking: true, headlights: true }]);
    const [brake] = byName('blglo'), [head] = byName('hlglo');
    expect([brake.visible, brake.count, head.visible, head.count]).toEqual([true, 2, true, 1]);
    // The far model's mesh is in the body's frame already: each instance sits on its car's frame.
    const placed = (mesh: InstancedMesh, index: number) => { const m = new Matrix4(); mesh.getMatrixAt(index, m); return new Vector3().setFromMatrixPosition(m); };
    expect([placed(brake, 0).toArray(), placed(brake, 1).toArray(), placed(head, 0).toArray()]).toEqual([[10, 0, 0], [20, 0, 0], [20, 0, 0]]);
    const centreZ = (mesh: InstancedMesh) => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox!.getCenter(new Vector3()).z; };
    expect([Math.round(centreZ(brake) * 1e3), Math.round(centreZ(head) * 1e3)]).toEqual([-2000, 2000]);
    // Drawn with the mesh's vertices, without the option attribute.
    expect([brake.geometry.getAttribute('_lmu_option'), brake.geometry.index!.count]).toEqual([undefined, 36]);
  });

  it("leaves out a lamp under an option part the car's livery does not show", async () => {
    const { glows, at, byName } = await loadedGlows();
    glows.draw([{ body: body('B'), frame: at(0), braking: true, headlights: true }]);
    expect(byName('blglo')[0].count).toBe(0);
    expect(byName('hlglo')[0].count).toBe(1);
  });

  it('draws the parts of one lamp under different option parts apart, each for the liveries that show it', async () => {
    // The brake glow's first face belongs to no option part, the other five to the option.
    const { glows, at, byName } = await loadedGlows(farLamps([0, 1, 1, 1, 1, 1]));
    const parts = byName('blglo');
    expect(parts.map(mesh => mesh.geometry.index!.count)).toEqual([6, 30]);
    expect(parts[0].material).toBe(parts[1].material);
    expect(parts[0].geometry.getAttribute('position')).toBe(parts[1].geometry.getAttribute('position'));
    glows.draw([{ body: body('B'), frame: at(0), braking: true, headlights: false }]);
    expect(parts.map(mesh => mesh.count)).toEqual([1, 0]);
    glows.draw([{ body: body('A'), frame: at(0), braking: true, headlights: false }]);
    expect(parts.map(mesh => mesh.count)).toEqual([1, 1]);
  });

  it('builds a body once and frees its glows on dispose', async () => {
    const { glows, at, meshes, textures } = await loadedGlows();
    glows.draw([{ body: body('A'), frame: at(0), braking: true, headlights: false }]);
    expect(textures.load).toHaveBeenCalledTimes(2);
    const [mesh] = meshes(), dispose = vi.spyOn(mesh.geometry, 'dispose'), material = vi.spyOn(mesh.material as Material, 'dispose');
    glows.dispose();
    expect(dispose).toHaveBeenCalled(); expect(material).toHaveBeenCalled();
    expect(mesh.parent?.parent?.parent).toBeFalsy();
  });

  it('frees the glows it built when their compile fails, and leaves the body without glows', async () => {
    const parent = new Group();
    const textures = { load: vi.fn(async (_path: string) => new Texture()), copied: vi.fn() };
    const freed = vi.spyOn(InstancedMesh.prototype, 'dispose');
    let failed!: () => void;
    const compiled = new Promise<void>(resolve => { failed = resolve; });
    const glows = createFarGlows(parent, textures, async () => { failed(); throw Error('compile failed'); }, vi.fn());
    glows.lamps(body('A'), farLamps());
    glows.draw([{ body: body('A'), frame: new Matrix4(), braking: true, headlights: true }]);
    await compiled;
    // The brake and headlight lit frames were built, then freed.
    await vi.waitFor(() => expect(freed).toHaveBeenCalledTimes(2));
    expect(parent.getObjectsByProperty('isInstancedMesh', true)).toEqual([]);
    freed.mockRestore();
  });

  it('leaves a body whose glow mesh names an unknown option part without glows', async () => {
    const parent = new Group(), changed = vi.fn(), textures = { load: vi.fn(async (_path: string) => new Texture()), copied: vi.fn() };
    const glows = createFarGlows(parent, textures, async () => {}, changed);
    glows.lamps(body('A'), farLamps([2, 2, 2, 2, 2, 2]));
    glows.draw([{ body: body('A'), frame: new Matrix4(), braking: true, headlights: true }]);
    await vi.waitFor(() => expect(textures.load).toHaveBeenCalled());
    await new Promise(resolve => { setTimeout(resolve); });
    glows.draw([{ body: body('A'), frame: new Matrix4(), braking: true, headlights: true }]);
    expect([parent.getObjectsByProperty('isInstancedMesh', true), changed.mock.calls.length, textures.load.mock.calls.length]).toEqual([[], 0, 2]);
  });
});
