import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Texture, Vector3 } from 'three';
import { createFarGlows } from '../../../../../src/components/replay/view3d/cars/farGlows.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import type { CarTemplates } from '../../../../../src/components/replay/view3d/cars/carTemplates.js';

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
const textures = [{ sha256: 'brake', start: { sha256: 'brake-start' } }, { sha256: 'hon', start: null }];
const body = (alias: string) => ({ vehicleId: alias, resource: { folder: 'proto', textures }, descriptor }) as unknown as LoadedBody;

/** A body model: the brake glow under its option part 2 m behind the origin, the headlight glow 2 m ahead. */
function template() {
  const model = new Group(), option = new Group(), lamp = (name: string, material: string, z: number) => {
    const mesh = new Mesh(new BoxGeometry(0.2, 0.1, 0.05), new MeshBasicMaterial({ name: material }));
    mesh.name = name; mesh.position.z = z;
    return mesh;
  };
  option.name = 'option_Lights';
  option.add(lamp('rear', 'blglo', -2));
  model.add(option, lamp('front', 'hlglo', 2));
  return model;
}

async function loadedGlows() {
  const parent = new Group(), changed = vi.fn(), model = template();
  const parse = vi.fn(async () => model), templates = { body: parse } as unknown as CarTemplates;
  const textures = { load: vi.fn(async (_path: string) => new Texture()), copied: vi.fn() };
  const glows = createFarGlows(parent, templates, textures, async () => {}, changed);
  const at = (x: number) => new Matrix4().makeTranslation(x, 0, 0);
  glows.draw([{ body: body('A'), frame: at(0), braking: false, headlights: false }]);
  await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
  const meshes = () => parent.getObjectsByProperty('isInstancedMesh', true) as InstancedMesh[];
  const byName = (name: string) => meshes().filter(mesh => mesh.name === `far-glow-${name}`);
  return { glows, at, meshes, byName, textures, parse };
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
    const placed = (mesh: InstancedMesh, index: number) => { const m = new Matrix4(); mesh.getMatrixAt(index, m); return new Vector3().setFromMatrixPosition(m); };
    expect(placed(brake, 0).toArray()).toEqual([10, 0, -2]);
    expect(placed(brake, 1).toArray()).toEqual([20, 0, -2]);
    expect(placed(head, 0).toArray()).toEqual([20, 0, 2]);
  });

  it("leaves out a lamp under an option part the car's livery does not show", async () => {
    const { glows, at, byName } = await loadedGlows();
    glows.draw([{ body: body('B'), frame: at(0), braking: true, headlights: true }]);
    expect(byName('blglo')[0].count).toBe(0);
    expect(byName('hlglo')[0].count).toBe(1);
  });

  it('loads a body once and frees its glows on dispose', async () => {
    const { glows, at, meshes, parse } = await loadedGlows();
    glows.draw([{ body: body('A'), frame: at(0), braking: true, headlights: false }]);
    expect(parse).toHaveBeenCalledOnce();
    const [mesh] = meshes(), dispose = vi.spyOn(mesh.geometry, 'dispose'), material = vi.spyOn(mesh.material as MeshBasicMaterial, 'dispose');
    glows.dispose();
    expect(dispose).toHaveBeenCalled(); expect(material).toHaveBeenCalled();
    expect(mesh.parent?.parent?.parent).toBeFalsy();
  });
});
