import { describe, expect, it, vi } from 'vitest';
import { BatchedMesh, Box3, BoxGeometry, DataTexture, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Sphere, SphereGeometry, Vector3, type BufferGeometry, type Material } from 'three';
import { layoutOf } from '../../../../../src/components/replay/view3d/batching/batchedParts.js';
import { batchable, batchCars, SHADOW_ONLY_LAYER, UNSEEN_LAYER } from '../../../../../src/components/replay/view3d/cars/carBatching.js';
import { buildCarParts, type CarParts } from '../../../../../src/components/replay/view3d/cars/carParts.js';
import { makeCar } from '../../../../../src/components/replay/view3d/cars/carObject.js';
import { composedMaterial, type ComposedParameters } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';
import { plainSurfaceMaterial } from '../../../../../src/components/replay/view3d/shaders/plainSurface.js';
import { unlitTemplate } from '../../../../../src/components/replay/view3d/shaders/unlitTemplate.js';

/** A car material on the lit template. */
const lit = (parameters: ComposedParameters = {}) => composedMaterial(litTemplate, [], parameters);

/** What cars of one body share: the geometry and materials of its parts (the loader's shareMaterials). */
function body() {
  return {
    solid: new BoxGeometry(1, 1, 1), plain: new BoxGeometry(1, 1, 1),
    // Car materials cast from both faces.
    carbon: lit({ shadowSide: DoubleSide }), rubber: lit({ shadowSide: DoubleSide }),
    glass: lit({ transparent: true }), lamp: new MeshBasicMaterial(),
  };
}

/** A car: a hull, a wing and a wheel rim (under spin_fl) in carbon, a tyre, glass and a lamp. */
function car(shared: ReturnType<typeof body>) {
  const model = new Group(), spin = new Group();
  const part = (name: string, geometry: BufferGeometry, material: Material, x: number) => {
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.x = x; mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  };
  const hull = part('hull', shared.solid, shared.carbon, 0), wing = part('wing', shared.solid, shared.carbon, -2), rim = part('rim', shared.solid, shared.carbon, 0);
  const tyre = part('tyre', shared.solid, shared.rubber, 1), glass = part('glass', shared.plain, shared.glass, 0), lamp = part('lamp', shared.plain, shared.lamp, 0);
  spin.name = 'spin_fl'; spin.position.set(1, 0, 1); spin.add(rim);
  model.add(hull, wing, spin, tyre, glass, lamp);
  const root = makeCar('#38bdf8', false, model);
  return { root, table: buildCarParts(root), hull, wing, rim, spin, tyre, glass, lamp };
}

const at = new Matrix4();
const instanceOf = (table: CarParts, mesh: Mesh) => table.parts.find(part => part.mesh === mesh)!.instance;
const batchesIn = (parent: Group) => parent.children.filter((child): child is BatchedMesh => child instanceof BatchedMesh);
const expectClose = (actual: Matrix4, expected: Matrix4) => actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 4));

describe('batchable and layoutOf', () => {
  it('accepts lit single-material meshes only, glass included', async () => {
    const geometry = new BoxGeometry(1, 1, 1);
    expect(batchable(new Mesh(geometry, lit()))).toBe(true);
    expect(batchable(new Mesh(geometry, lit({ transparent: true })))).toBe(true);
    expect(batchable(new Mesh(geometry, new MeshBasicMaterial()))).toBe(false);
    expect(batchable(new Mesh(geometry, [lit()]))).toBe(false);
    // A plain surface (the rear-view glass) is on the lit template too; a built-in or unlit material is not.
    expect(batchable(new Mesh(geometry, plainSurfaceMaterial({ colour: 0, roughness: 1, metalness: 0, environment: 0 })))).toBe(true);
    expect(batchable(new Mesh(geometry, composedMaterial(unlitTemplate, [])))).toBe(false);
    expect(batchable(new Mesh(geometry, new MeshStandardMaterial()))).toBe(false);
    const hidden = lit(); hidden.visible = false;
    expect(batchable(new Mesh(geometry, hidden))).toBe(false);
  });

  it('leaves out a surface material with no room for the batch textures', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const withUnits = (units: number) => { const made = lit(); made.userData.surfaceTextureUnits = units; return made; };
    expect(batchable(new Mesh(geometry, withUnits(14)))).toBe(true);
    expect(batchable(new Mesh(geometry, withUnits(15)))).toBe(false);
  });

  it('tells vertex layouts apart', async () => {
    expect(layoutOf(new BoxGeometry(1, 1, 1))).toBe(layoutOf(new BoxGeometry(2, 3, 4)));
    expect(layoutOf(new BoxGeometry(1, 1, 1))).not.toBe(layoutOf(new SphereGeometry(1).deleteAttribute('uv')));
  });
});

describe('batchCars, one car', () => {
  it('draws the parts that share a material as one batch inside the car, casting from the shadow batch, and leaves the rest alone', async () => {
    const { root, table, hull, wing, rim, tyre, glass, lamp } = car(body());
    const set = await batchCars([table]);
    expect(set.shared.children).toHaveLength(0);
    const batches = batchesIn(root);
    expect(batches.map(batch => batch.name)).toEqual([`car batch ${hull.material.name}`, 'car shadow batch']);
    expect(table.own).toEqual(batches);
    expect(batches[0].material).toBe(hull.material);
    expect(batches[0].maxInstanceCount).toBe(3);
    expect(batches[0].castShadow).toBe(false);
    for (const mesh of [hull, wing, rim]) { expect(mesh.layers.mask).toBe(0); expect(mesh.castShadow).toBe(false); }
    for (const mesh of [tyre, glass, lamp]) { expect(mesh.layers.mask).toBe(1); expect(mesh.castShadow).toBe(true); }
    expect(table.parts.filter(part => part.batch).map(part => part.mesh)).toEqual([hull, wing, rim]);
  });

  it('keeps instances in the car frame: the car moving changes nothing, a turning spin node does', async () => {
    const { root, table, rim, spin, wing } = car(body());
    await batchCars([table]);
    const field = new Group(); field.add(root);
    const batch = batchesIn(root)[0], id = instanceOf(table, rim);
    table.sync();
    expect(new Vector3().setFromMatrixPosition(batch.getMatrixAt(id, at)).toArray()).toEqual([1, 0, 1]);
    root.position.set(-40, 3, 9); root.rotation.y = 1.2; table.sync();
    expect(new Vector3().setFromMatrixPosition(batch.getMatrixAt(id, at)).toArray()).toEqual([1, 0, 1]);
    spin.rotation.y = Math.PI / 2; wing.visible = false; table.sync();
    expectClose(batch.getMatrixAt(id, at), new Matrix4().copy(spin.matrix).multiply(rim.matrix));
    expect(batch.getVisibleAt(instanceOf(table, wing))).toBe(false);
    expect(batch.getVisibleAt(id)).toBe(true);
    wing.visible = true; spin.rotation.y = 0; table.sync();
    expect(batch.getVisibleAt(instanceOf(table, wing))).toBe(true);
    // A part hidden on its own, nothing else changing, leaves its batch too.
    wing.visible = false; table.sync();
    expect(batch.getVisibleAt(instanceOf(table, wing))).toBe(false);
  });
});

describe('batchCars, several cars', () => {
  async function field() {
    const shared = body(), parent = new Group(), a = car(shared), b = car(shared);
    a.root.position.set(10, 0, 0); b.root.position.set(0, 0, 20); b.root.rotation.y = 0.8;
    parent.add(a.root, b.root);
    const set = await batchCars([a.table, b.table]);
    parent.add(set.shared);
    return { shared, parent, a, b, set };
  }

  it('shares one batch per material, sized for every car, drawing in the parent frame of the cars', async () => {
    const { a, b, set, shared } = await field();
    const batches = batchesIn(set.shared);
    // Carbon, rubber, glass and the shadow batch.
    expect(batches).toHaveLength(4);
    expect(set.batches).toEqual(batches);
    expect(batchesIn(a.root)).toHaveLength(0);
    expect(a.table.own).toEqual([]);
    const carbon = batches.find(batch => batch.material === shared.carbon)!, rubber = batches.find(batch => batch.material === shared.rubber)!;
    expect(carbon.maxInstanceCount).toBe(6);
    expect(rubber.maxInstanceCount).toBe(2);
    // The caller culls each car whole: a shared batch draws every part it shows (the shadow-only batch still culls per part).
    expect(carbon.perObjectFrustumCulled).toBe(false);
    expect(batches.find(batch => batch.name === 'car shadow batch')!.perObjectFrustumCulled).toBe(true);
    a.table.sync(); b.table.sync();
    for (const item of [a, b]) for (const mesh of [item.hull, item.wing, item.rim]) {
      const frame = new Matrix4().multiply(mesh === item.rim ? item.spin.matrix : new Matrix4()).multiply(mesh.matrix);
      expectClose(carbon.getMatrixAt(instanceOf(item.table, mesh), at), new Matrix4().copy(item.root.matrix).multiply(frame));
    }
  });

  it('batches the glass too, its instances sorted back to front; the opaque batches unsorted', async () => {
    const shared = body(), a = car(shared), b = car(shared);
    const set = await batchCars([a.table, b.table]);
    const glass = set.batches.find(batch => batch.material === shared.glass)!;
    expect(glass.maxInstanceCount).toBe(2);
    expect(glass.sortObjects).toBe(true);
    expect(set.batches.find(batch => batch.material === shared.carbon)!.sortObjects).toBe(false);
    // The lamp keeps its own draw.
    expect(set.batches.some(batch => batch.material === shared.lamp)).toBe(false);
  });

  it('casts the solid parts from one shadow-only batch, which follows their instances and only the sun layers see', async () => {
    const shared = body(), a = car(shared), b = car(shared), parent = new Group();
    parent.add(a.root, b.root);
    const set = await batchCars([a.table, b.table]);
    const shadow = set.batches.find(batch => batch.name === 'car shadow batch')!;
    // Hull, wing, rim and tyre of both cars: every opaque batched part.
    expect(shadow.maxInstanceCount).toBe(8);
    expect(shadow.castShadow).toBe(true);
    // No pass draws a batch until it is ready: its programs link with the warm-up, not at a draw.
    expect(set.batches.every(batch => batch.layers.mask === (1 << UNSEEN_LAYER) >>> 0)).toBe(true);
    set.ready();
    expect(shadow.layers.mask).toBe(1 << SHADOW_ONLY_LAYER);
    expect(set.batches.find(batch => batch.material === shared.carbon)!.layers.mask).toBe(1);
    expect(Object.keys(shadow.geometry.attributes)).toEqual(['position']);
    for (const material of [shared.carbon, shared.rubber]) expect(set.batches.find(batch => batch.material === material)!.castShadow).toBe(false);
    // The glass keeps its batch's flag: the shadow pass casts nothing for a blended surface.
    expect(set.batches.find(batch => batch.material === shared.glass)!.castShadow).toBe(true);
    a.root.position.set(5, 0, 0); a.table.sync();
    const hull = a.table.parts.find(part => part.mesh === a.hull)!;
    expect(shadow.getVisibleAt(hull.shadow!.instance)).toBe(true);
    expectClose(shadow.getMatrixAt(hull.shadow!.instance, at), hull.batch!.getMatrixAt(hull.instance, new Matrix4()));
    a.table.hide();
    expect(shadow.getVisibleAt(hull.shadow!.instance)).toBe(false);
  });

  it('gives the shadow-only batch the bounds its geometries carry, so it measures no vertices', async () => {
    const shared = body(), a = car(shared);
    shared.solid.computeBoundingBox(); shared.solid.computeBoundingSphere();
    // Bounds no vertex walk would give: the batch took them as they are.
    shared.solid.boundingSphere!.radius = 7; shared.solid.boundingBox!.max.set(3, 3, 3);
    const set = await batchCars([a.table]);
    const shadow = set.batches.find(batch => batch.name === 'car shadow batch')!;
    const id = shadow.getGeometryIdAt(a.table.parts.find(part => part.mesh === a.hull)!.shadow!.instance);
    expect(shadow.getBoundingSphereAt(id, new Sphere())!.radius).toBe(7);
    expect(shadow.getBoundingBoxAt(id, new Box3())!.max).toEqual(new Vector3(3, 3, 3));
  });

  it('draws a livery material from one batch carrying each instance\'s layer, even a lone part', async () => {
    const shared = body(), a = car(shared), b = car(shared), paint = lit();
    // The hulls share the body's livery material, each car its own layer; one hull casts, the other not (one batch all the same).
    a.hull.material = paint; a.hull.userData.liveryLayer = 3;
    b.hull.material = paint; b.hull.userData.liveryLayer = 1; b.hull.castShadow = false;
    const set = await batchCars([a.table, b.table]);
    expect(set.batches.filter(batch => batch.material === paint)).toHaveLength(1);
    const values = (paint.userData.carLiveryLayer as DataTexture).image.data as Float32Array;
    expect([values[instanceOf(a.table, a.hull)], values[instanceOf(b.table, b.hull)]]).toEqual([3, 1]);
    // Alone, a livery part still draws from its batch.
    const lone = car(body()), solo = lit();
    lone.hull.material = solo; lone.hull.userData.liveryLayer = 0;
    await batchCars([lone.table]);
    expect((solo.userData.carLiveryLayer as DataTexture).image.data).toEqual(new Float32Array([0]));
  });

  it('lets the batched stand-ins go of their geometry, keeping what a part drawn on its own reads', async () => {
    const released = await field();
    expect(released.a.hull.geometry).not.toBe(released.shared.solid);
    expect(released.a.hull.geometry.attributes.position).toBeUndefined();
    // Its bounds stay: a wheel rig measures its wheel from them.
    released.shared.solid.computeBoundingBox();
    expect(released.a.hull.geometry.boundingBox).toEqual(released.shared.solid.boundingBox);
    // The lamp draws on its own: it keeps its geometry.
    expect(released.a.lamp.geometry).toBe(released.shared.plain);
  });

  it('shows a batch only while one of its instances shows, once ready', async () => {
    const { a, set } = await field();
    const [batch] = set.batches;
    expect(set.batches.every(item => item.visible)).toBe(true);
    set.ready();
    expect(set.batches.every(item => !item.visible)).toBe(true);
    a.root.visible = true; a.table.sync();
    expect(batch.visible).toBe(true);
    a.table.hide();
    expect(batch.visible).toBe(false);
    a.table.sync();
    expect(batch.visible).toBe(true);
    a.root.visible = false; a.table.sync();
    expect(batch.visible).toBe(false);
  });

  it('removes its batches on dispose', async () => {
    const { set, a } = await field();
    const spies = set.batches.map(batch => vi.spyOn(batch, 'dispose'));
    set.dispose();
    expect(set.shared.children).toHaveLength(0);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(a.table.own).toEqual([]);
  });
});
