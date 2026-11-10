import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DataPlugin } from '../../../server/plugins/dataPlugin.js';
import { createDataPluginRouter } from '../../../server/routes/dataPluginRoutes.js';
import { glb, syntheticPackage } from '../../helpers/scenes/syntheticPackage.js';

type Package = ReturnType<typeof syntheticPackage>;
const packages: Package[] = [];
const build = () => { const built = syntheticPackage(); packages.push(built); return built; };
afterEach(() => { for (const built of packages.splice(0)) fs.rmSync(built.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
const state = (built: Package) => new DataPlugin(built.dir).status.state;

describe('schema 6 manifest', () => {
  it('loads scenery next to tracks, and the car bodies of the vehicle records', () => {
    const built = build(), plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status).toMatchObject({ scenery: true, bodies: true, counts: { tracks: 1, vehicles: 1, scenery: 1, bodies: 1 } });
    const layout = plugin.sceneryLayout('monza_gp')!;
    expect(layout.packageRevision).toBe(plugin.status.revision);
    expect(layout.sectors.map(sector => sector.id)).toEqual(['s0', 's1']);
    expect(layout.chunking).toEqual(built.sceneryShared.chunking); expect(layout.streaming).toEqual(built.sceneryShared.streaming);
    expect(layout.camera).toEqual(built.sceneryShared.camera);
    expect(layout).not.toHaveProperty('schemaVersion');
    expect(plugin.sceneryLayout('spa_wec')).toBeNull();
    expect(plugin.body('test_car.veh')?.folder).toBe('Test_Car');
    expect(plugin.body('TEST_CAR')?.packageRevision).toBe(plugin.status.revision);
    expect(plugin.body('OTHER')).toBeNull();
  });

  it('accepts a package without scenery; the bodies come with the vehicles', () => {
    const built = build();
    delete built.manifest.scenery; built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.sceneryLayout('monza_gp')).toBeNull(); expect(plugin.body('TEST_CAR')).not.toBeNull();
  });

  it('has no bodies without vehicles', () => {
    const built = build();
    delete built.manifest.vehicles; built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status.bodies).toBeUndefined(); expect(plugin.body('TEST_CAR')).toBeNull();
  });

  it.each([1, 2, 3, 4, 5, '6', undefined])('rejects manifest schema %s: only schema 6 is supported', schemaVersion => {
    const built = build();
    built.manifest.schemaVersion = schemaVersion; built.commit();
    expect(state(built)).toBe('invalid');
  });

  it.each(['cars', 'brakeBoardArtwork', 'scenes', 'vehicleMeshes', 'vehicleLiveries', 'vehicleWheels', 'trackTextures', 'unknown'])('rejects the key %s', key => {
    const built = build();
    built.manifest[key] = { catalog: 'tracks/index.json' }; built.commit();
    expect(state(built)).toBe('invalid');
  });

  it.each(['../outside.json', 'C:/outside.json', 'scenery\\index.json'])('rejects a scenery catalog path escaping the package: %s', file => {
    const built = build();
    built.manifest.scenery = { catalog: file }; built.commit();
    expect(state(built)).toBe('invalid');
  });
});

describe('scenery validation', () => {
  const mutate = (change: (built: Package) => void) => { const built = build(); change(built); built.commit(); return state(built); };

  it.each([
    ['an unknown row field', (built: Package) => { (built.scenery as Record<string, unknown>).extra = 1; }],
    ['a per-layout schema version', (built: Package) => { (built.scenery as Record<string, unknown>).schemaVersion = 2; }],
    ['per-layout chunking', (built: Package) => { (built.scenery as Record<string, unknown>).chunking = built.sceneryShared.chunking; }],
    ['per-layout streaming', (built: Package) => { (built.scenery as Record<string, unknown>).streaming = built.sceneryShared.streaming; }],
    ['non-positive shared chunking', (built: Package) => { built.sceneryShared.chunking.sectorLengthM = 0; }],
    ['missing shared streaming', (built: Package) => { delete (built.sceneryShared as Partial<typeof built.sceneryShared>).streaming; }],
    ['a missing camera profile', (built: Package) => { delete (built.sceneryShared as Partial<typeof built.sceneryShared>).camera; }],
    ['a metering window outside the frame', (built: Package) => { built.sceneryShared.camera.types.tv.meteringWindow.width = 0.95; }],
    ['camera profiles out of elevation order', (built: Package) => { built.sceneryShared.camera.types.external.profiles.reverse(); }],
    ['a non-positive exposure target', (built: Package) => { built.sceneryShared.camera.types.onboard.profiles[0].targetExposure = 0; }],
    ['a non-positive tone curve', (built: Package) => { built.sceneryShared.camera.types.tv.profiles[1].toneCurve.a = 0; }],
    ['a missing weather blend rate', (built: Package) => { delete (built.sceneryShared.camera.types.tv as Partial<typeof built.sceneryShared.camera.types.tv>).weatherBlendRate; }],
    ['a non-positive weather blend rate', (built: Package) => { built.sceneryShared.camera.types.external.weatherBlendRate = 0; }],
    ['a profile without its overcast look', (built: Package) => { delete (built.sceneryShared.camera.types.onboard.profiles[0] as Partial<typeof built.sceneryShared.camera.types.onboard.profiles[0]>).overcast; }],
    ['a non-positive overcast exposure target', (built: Package) => { built.sceneryShared.camera.types.tv.profiles[0].overcast.targetExposure = 0; }],
    ['a non-positive overcast tone curve', (built: Package) => { built.sceneryShared.camera.types.tv.profiles[1].overcast.toneCurve.a = 0; }],
    ['a missing weather lerp power', (built: Package) => { delete (built.sceneryShared.camera.types.external.profiles[0] as Partial<typeof built.sceneryShared.camera.types.external.profiles[0]>).weatherLerpPower; }],
    ['a non-positive weather lerp power', (built: Package) => { built.sceneryShared.camera.types.external.profiles[1].weatherLerpPower = 0; }],
    ['a non-positive adaptation scale', (built: Package) => { built.sceneryShared.camera.types.external.adaptationScale = 0; }],
    ['a missing camera type', (built: Package) => { delete (built.sceneryShared.camera.types as Partial<typeof built.sceneryShared.camera.types>).tv; }],
    ['a non-positive output gamma', (built: Package) => { built.sceneryShared.camera.outputGamma = 0; }],
    ['an unknown camera field', (built: Package) => { (built.sceneryShared.camera as unknown as Record<string, unknown>).extra = 1; }],
    ['a missing sky profile', (built: Package) => { delete (built.sceneryShared as Partial<typeof built.sceneryShared>).sky; }],
    ['four Perez scales', (built: Package) => { built.sceneryShared.sky.perezScale.pop(); }],
    ['Perez multipliers out of elevation order', (built: Package) => { built.sceneryShared.sky.perezMultipliers.reverse(); }],
    ['a missing environment probe', (built: Package) => { delete (built.scenery as Partial<typeof built.scenery>).environmentProbe; }],
    ['a missing scene luminance scale', (built: Package) => { delete (built.sceneryShared.camera as Partial<typeof built.sceneryShared.camera>).sceneLuminanceScale; }],
    ['a turbidity range upside down', (built: Package) => { built.sceneryShared.sky.turbidity.min = 9; }],
    ['a haze density range upside down', (built: Package) => { built.sceneryShared.sky.fog.density.max = 0; }],
    ['no horizon samples', (built: Package) => { built.sceneryShared.sky.fog.colour.horizonSampleCount = 0; }],
    ['a missing height haze', (built: Package) => { delete (built.sceneryShared.sky.fog as Partial<typeof built.sceneryShared.sky.fog>).height; }],
    ['a missing air mass', (built: Package) => { delete (built.sceneryShared.sky as Partial<typeof built.sceneryShared.sky>).airMass; }],
    ['a missing sun', (built: Package) => { delete (built.sceneryShared.sky as Partial<typeof built.sceneryShared.sky>).sun; }],
    ['a sun grid for a layout the catalog does not list', (built: Package) => { built.sceneryShared.sky.sun.layouts.spa_wec = built.sceneryShared.sky.sun.layouts.monza_gp; }],
    ['a layout without its sun grid', (built: Package) => { delete built.sceneryShared.sky.sun.layouts.monza_gp; }],
    ['sun elevations out of order', (built: Package) => { built.sceneryShared.sky.sun.sunElevationDeg.reverse(); }],
    ['a sun grid short of a coverage row', (built: Package) => { built.sceneryShared.sky.sun.layouts.monza_gp.pop(); }],
    ['a sun grid short of an elevation sample', (built: Package) => { built.sceneryShared.sky.sun.layouts.monza_gp[0].pop(); }],
    ['a sun sample that is not positive', (built: Package) => { built.sceneryShared.sky.sun.layouts.monza_gp[1][2][1] = 0; }],
    ['a missing sky model', (built: Package) => { delete (built.sceneryShared.sky as Partial<typeof built.sceneryShared.sky>).hosek; }],
    ['a ground albedo above 1', (built: Package) => { built.sceneryShared.sky.hosek.albedo = 1.5; }],
    ['a sky matrix short of a row', (built: Package) => { (built.sceneryShared.sky.hosek.xyzToRgb as unknown[]).pop(); }],
    ['a sky dataset short of a value', (built: Package) => { built.sceneryShared.sky.hosek.coefficients[1].pop(); }],
    ['a sky radiance dataset short of a value', (built: Package) => { built.sceneryShared.sky.hosek.radiances[2].pop(); }],
    ['a zero scale height', (built: Package) => { built.sceneryShared.sky.hosek.scaleHeightM = 0; }],
    ['a layout without its altitude', (built: Package) => { delete built.sceneryShared.sky.hosek.layoutAltitudeM.monza_gp; }],
    ['an altitude for a layout the catalog does not list', (built: Package) => { built.sceneryShared.sky.hosek.layoutAltitudeM.spa_wec = 0; }],
    ['a missing shading', (built: Package) => { delete (built.sceneryShared as Partial<typeof built.sceneryShared>).shading; }],
    ['a glint cosine above 1', (built: Package) => { built.sceneryShared.shading.sunGlint.cosineThreshold = 1.5; }],
    ['small-edge limits upside down', (built: Package) => { built.sceneryShared.shading.smallEdge.limitMin = 1000; }],
    ['an unknown paint LOD mode', (built: Package) => { (built.sceneryShared.shading.carPaintReflection as { clearCoatLod: string }).clearCoatLod = 'auto'; }],
    ['a convolution kernel without samples', (built: Package) => { built.sceneryShared.shading.convolution.kernels[1].samples = []; }],
    ['a convolution sample that is not a direction', (built: Package) => { built.sceneryShared.shading.convolution.kernels[1].samples[1] = [1, 1, 0]; }],
    ['a convolution power that is not a number', (built: Package) => { built.sceneryShared.shading.convolution.kernels[1].specularPower = 'high'; }],
    ['a scenery reflection without families', (built: Package) => { built.sceneryShared.shading.sceneryReflection.families = []; }],
    ['a dielectric F0 above 1', (built: Package) => { built.sceneryShared.shading.sceneryReflection.dielectricF0 = 1.2; }],
    ['an unknown scenery LOD mode', (built: Package) => { (built.sceneryShared.shading.sceneryReflection as { lod: string }).lod = 'auto'; }],
    ['an integration map short of texels', (built: Package) => { built.sceneryShared.shading.integrationMap.bias.pop(); }],
    ['an integration texel above 255', (built: Package) => { built.sceneryShared.shading.integrationMap.scale[0] = 256; }],
    ['an integration map in another encoding', (built: Package) => { (built.sceneryShared.shading.integrationMap as { encoding: string }).encoding = 'float'; }],
    ['a missing shadow profile', (built: Package) => { delete (built.sceneryShared.shading as Partial<typeof built.sceneryShared.shading>).shadows; }],
    ['a cascade tile outside the atlas', (built: Package) => { built.sceneryShared.shading.shadows.atlas.cascadeTiles[1] = [0, 48, 0]; }],
    ['a cascade tile in an atlas that does not exist', (built: Package) => { built.sceneryShared.shading.shadows.atlas.cascadeTiles[2] = [2, 0, 0]; }],
    ['shadow filter weights that do not sum to 1', (built: Package) => { built.sceneryShared.shading.shadows.filter.taps[0].weight = 3; }],
    ['an unknown cascade selection', (built: Package) => { (built.sceneryShared.shading.shadows.select as { method: string }).method = 'nearest'; }],
    ['a shadow camera set short of a split', (built: Package) => { built.sceneryShared.shading.shadows.cameras.chase.splitsM?.pop(); }],
    ['shadow splits that do not end at far', (built: Package) => { built.sceneryShared.shading.shadows.cameras.cockpit.splitsM = [30, 150]; }],
    ['shadow splits out of order', (built: Package) => { built.sceneryShared.shading.shadows.cameras.chase.splitsM = [80, 20, 300]; }],
    ['more cascades than atlas tiles', (built: Package) => { Object.assign(built.sceneryShared.shading.shadows.cameras.chase, { count: 4, splitsM: [10, 20, 80, 300] }); }],
    ['another cascade centre rule', (built: Package) => { (built.sceneryShared.shading.shadows.centre as { at: string }).at = 'splitEnd'; }],
    ['cascades that turn with the view', (built: Package) => { (built.sceneryShared.shading.shadows.orientation as { followsView: boolean }).followsView = true; }],
    ['an extra cascade orientation key', (built: Package) => { (built.sceneryShared.shading.shadows.orientation as Record<string, unknown>).depthM = 400; }],
    ['a null shadow set with a ratio', (built: Package) => { built.sceneryShared.shading.shadows.cameras.tv.splitRatio = 0.9; }],
    ['a shadow camera type the package does not define', (built: Package) => { (built.sceneryShared.shading.shadows.cameras as Record<string, unknown>).hood = built.sceneryShared.shading.shadows.cameras.tv; }],
    ['a missing sky haze', (built: Package) => { delete (built.sceneryShared.sky as Partial<typeof built.sceneryShared.sky>).haze; }],
    ['a negative sky haze depth', (built: Package) => { built.sceneryShared.sky.haze.depth.overcast = -1; }],
    ['sky colour profiles out of order', (built: Package) => { built.sceneryShared.sky.colourProfiles.profiles.reverse(); }],
    ['a negative sky colour gain', (built: Package) => { built.sceneryShared.sky.colourProfiles.profiles[0].clear.gain[1] = -0.1; }],
    ['a zero sky weather power', (built: Package) => { built.sceneryShared.sky.colourProfiles.profiles[1].weatherLerpPower = 0; }],
    ['a stale geometry revision', (built: Package) => { built.scenery.sourceGeometryRevision = 'old'; }],
    ['a chunk asset that is not content-named', (built: Package) => { built.scenery.sectors[0].asset = 'scenery/s0.glb'; }],
    ['a chunk of the wrong size', (built: Package) => { built.scenery.sectors[0].byteLength += 1; }],
    ['a missing chunk file', (built: Package) => { fs.rmSync(path.join(built.dir, built.scenery.sectors[1].asset)); }],
    ['sectors out of lap order', (built: Package) => { built.scenery.sectors.reverse(); }],
    ['broken prev/next links', (built: Package) => { built.scenery.sectors[0].next = 's0'; }],
    ['a sector beyond the route', (built: Package) => { built.scenery.sectors[1].lapEndM = built.scenery.routeLengthM + 10; }],
    ['duplicate chunk ids', (built: Package) => { built.scenery.sectors[1].id = 's0'; }],
    ['a texture missing from the layout list', (built: Package) => { built.scenery.sectors[0].textures = ['scenery/textures/' + '0'.repeat(64) + '.ktx2.zst']; }],
    ['a texture file of the wrong size', (built: Package) => { built.scenery.textures[0].byteLength += 1; }],
    ['non-finite bounds', (built: Package) => { built.scenery.horizon.bounds.min[0] = Infinity; }],
    ['a layout without track geometry', (built: Package) => { built.scenery.layoutKey = 'spa_wec'; }],
    ['a missing shadow range', (built: Package) => { delete (built.scenery as Partial<typeof built.scenery>).shadowRangeM; }],
    ['a non-positive shadow range', (built: Package) => { built.scenery.shadowRangeM = 0; }],
    ['more shadow casters than draw calls', (built: Package) => { built.scenery.sectors[0].shadowDrawCalls = built.scenery.sectors[0].drawCalls + 1; }],
    ['a chunk without shadow counts', (built: Package) => { delete (built.scenery.sectors[0] as Partial<typeof built.scenery.sectors[0]>).shadowTriangles; }],
    ['a daylight without its UTC offset', (built: Package) => { delete (built.scenery.daylight as Partial<NonNullable<typeof built.scenery.daylight>>).utcOffsetHours; }],
    ['a daylight latitude past the pole', (built: Package) => { Object.assign(built.scenery.daylight, {latitudeDeg: 91}); }],
    ['a daylight without its dawn haze weight', (built: Package) => { delete (built.scenery.daylight as Partial<NonNullable<typeof built.scenery.daylight>>).hazeDawnScale; }],
    ['a negative height haze scalar', (built: Package) => { Object.assign(built.scenery.daylight, {fogHeightAltitudeScalar: -1}); }],
  ])('rejects %s', (_name, change) => { expect(mutate(change)).toBe('invalid'); });

  it('rejects an empty catalog', () => {
    const built = build();
    built.commit(); built.write('scenery/index.json', { ...built.sceneryShared, layouts: [] });
    expect(state(built)).toBe('invalid');
  });

  it('rejects a bare array as the catalog', () => {
    const built = build();
    built.commit(); built.write('scenery/index.json', [built.scenery]);
    expect(state(built)).toBe('invalid');
  });

  it('accepts a daylight location', () => {
    const built = build();
    built.commit();
    expect(new DataPlugin(built.dir).sceneryLayout('monza_gp')?.daylight?.utcOffsetHours).toBe(9);
  });

  it('accepts a layout without daylight', () => {
    const built = build();
    delete (built.scenery as Partial<typeof built.scenery>).daylight; built.commit();
    expect(new DataPlugin(built.dir).sceneryLayout('monza_gp')).not.toBeNull();
  });
});

describe('car validation', () => {
  const mutate = (change: (built: Package) => void) => { const built = build(); change(built); built.commit(); return state(built); };
  /** Replaces the catalog written by `commit()` with raw records. */
  const rewrite = (change: (built: Package, vehicle: Record<string, unknown>) => unknown[]) => {
    const built = build(); built.commit();
    built.write('vehicles/index.json', { vehicles: change(built, built.record(built.vehicles[0])) });
    return state(built);
  };

  it.each([
    ['aliases that differ from the body ids', (built: Package) => { built.descriptor.aliases = ['TEST_CAR', 'EXTRA']; }],
    ['appearances that do not cover the ids', (built: Package) => { built.descriptor.appearances = []; }],
    ['a wheel rig that did not pass', (built: Package) => { built.descriptor.wheelRig = { passed: false, rigs: 4, maxRestVertexErrorM: 0 }; }],
    ['a wheel rig with rest-vertex error', (built: Package) => { built.descriptor.wheelRig = { passed: true, rigs: 4, maxRestVertexErrorM: 0.01 }; }],
    ['a missing wheel pivot', (built: Package) => { delete (built.descriptor.wheelPivots as Record<string, unknown>).rr; }],
    ['no option node list', (built: Package) => { delete built.descriptor.optionNodes; }],
    ['unsorted option nodes', (built: Package) => { built.descriptor.optionNodes = ['option_NumplateB', 'option_NumplateA']; }],
    ['an option node three.js would rename', (built: Package) => { built.descriptor.optionNodes = ['option_Numplate.A']; }],
    ['an entry showing an option the body lacks', (built: Package) => { (built.descriptor.appearances as Array<{ optionNodes: string[] }>)[0].optionNodes = ['option_Spoiler']; }],
    ['an entry without its option list', (built: Package) => { delete (built.descriptor.appearances as Array<{ optionNodes?: string[] }>)[0].optionNodes; }],
    ['an undeclared texture', (built: Package) => { (built.descriptor.appearances as Array<{ materialTextures?: unknown }>)[0].materialTextures = { body: 'textures/' + '1'.repeat(64) + '.ktx2.zst' }; }],
    ['a descriptor of another vehicle', (built: Package) => { built.descriptor.vehicleFolder = 'Other'; }],
    ['a descriptor schema version', (built: Package) => { built.descriptor.schemaVersion = 1; }],
    ['an unknown descriptor field', (built: Package) => { built.descriptor.extra = true; }],
    ['cameras without the driver camera', (built: Package) => { built.descriptor.cameras = { list: (built.descriptor.cameras as { list: Array<{ name: string }> }).list.filter(camera => camera.name !== 'cockpit') }; }],
    ['a camera with an inverted clip range', (built: Package) => { (built.descriptor.cameras as { list: Array<{ clipPlanes: number[] }> }).list[0].clipPlanes = [5, 1]; }],
    ['no lamp list', (built: Package) => { delete built.descriptor.lamps; }],
    ['an unknown lamp role', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].role = 'fog'; }],
    ['a lamp frame that is neither a texture path nor null', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].frames = ['lamp.png']; }],
    ['a lamp state past its frames', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].states = { off: 1, on: null, brake: null }; }],
    ['a lamp animation frame past its frames', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].animation = { method: 'random', rate: 1, sequence: [0, 3] }; }],
    ['a lamp without its cockpit reading', (built: Package) => { delete (built.descriptor.lamps as Array<Record<string, unknown>>)[0].hiddenInOwnCockpit; }],
    ['an unknown lamp blend', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].blend = 'additive'; }],
    ['a brake glow range on a headlight', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].brakeGlowRange = [640, 950]; }],
    ['no glow material list', (built: Package) => { delete built.descriptor.glowMaterialIds; }],
    ['a glow material the body does not list', (built: Package) => { built.descriptor.glowMaterialIds = ['m2']; }],
    ['a non-boolean paint flag',(built: Package) => { (built.descriptor.materials as Array<{ paint: unknown }>)[0].paint = 'yes'; }],
    ['an asset that is not content-named', (built: Package) => { built.car.asset = 'vehicles/Test_Car.glb'; }],
    ['a descriptor outside vehicles/bodies', (built: Package) => { built.car.descriptor = 'cars/Test_Car.json'; }],
    ['a car texture of the wrong size', (built: Package) => { built.car.textures[0].byteLength += 1; }],
  ])('rejects %s', (_name, change) => { expect(mutate(change)).toBe('invalid'); });

  it.each([
    ['a body serving ids outside its record', (_built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, bodies: [{ ...(vehicle.bodies as object[])[0], vehicleIds: ['OTHER_CAR'] }] }]],
    ['a body missing some ids of its record', (built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, vehicleIds: ['TEST_CAR', 'TEST_TWO'], bodies: [{ ...built.car, vehicleIds: ['TEST_CAR'] }] }]],
    ['a record without bodies', (_built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, bodies: [] }]],
    ['an id in two bodies of one record', (built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, bodies: [built.car, { ...built.car, folder: 'Other', descriptor: 'vehicles/bodies/Other.json' }] }]],
    ['a body field of the old cars catalog', (_built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, bodies: [{ ...(vehicle.bodies as object[])[0], schemaVersion: 1 }] }]],
    ['a record without the bodies field', (_built: Package, vehicle: Record<string, unknown>) => { const { bodies: _bodies, ...bare } = vehicle; return [bare]; }],
  ])('rejects %s', (_name, change) => { expect(rewrite(change)).toBe('invalid'); });

  it('loads a body shared by two records once, with the union of their ids', () => {
    const built = build();
    built.setVehicles([{ id: 'base', vehicleIds: ['TEST_CAR'] }, { id: 'evo', vehicleIds: ['TEST_CAR_EVO'] }]); built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status.counts).toMatchObject({ vehicles: 2, bodies: 1 });
    expect(plugin.body('TEST_CAR_EVO')).toMatchObject({ folder: 'Test_Car', vehicleIds: ['TEST_CAR', 'TEST_CAR_EVO'] });
    expect(plugin.body('test_car.veh')?.sha256).toBe(plugin.body('TEST_CAR_EVO')?.sha256);
  });

  it('rejects a shared body whose two listings point at different files', () => {
    const built = build();
    built.setVehicles([{ id: 'base', vehicleIds: ['TEST_CAR'] }, { id: 'evo', vehicleIds: ['TEST_CAR_EVO'] }]); built.commit();
    const [first, second] = built.vehicles.map(spec => built.record(spec));
    built.write('vehicles/index.json', { vehicles: [first, { ...second, bodies: [{ ...second.bodies[0], triangles: 1 }] }] });
    expect(state(built)).toBe('invalid');
  });

  it('loads a further geometry of a car folder, named <folder>.<hash>, from its installed folder descriptor', () => {
    const built = build();
    built.car.folder = 'Test_Car.0a1b2c3d'; built.car.descriptor = 'vehicles/bodies/Test_Car.0a1b2c3d.json'; built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.body('TEST_CAR')?.folder).toBe('Test_Car.0a1b2c3d');
  });
});

describe('scenery and car routes', () => {
  it('serves layouts, car resources and package files as is, uncached', async () => {
    const built = build(), app = express();
    app.use('/api/data-plugin', createDataPluginRouter(new DataPlugin(built.dir)));
    const layout = await request(app).get('/api/data-plugin/scenery/monza_gp');
    expect(layout.status).toBe(200); expect(layout.body).toHaveProperty('horizon.id', 'horizon'); expect(layout.body).toHaveProperty('packageRevision');
    expect((await request(app).get('/api/data-plugin/scenery/spa_wec')).status).toBe(404);

    const chunk = await request(app).get('/api/data-plugin/scenery/files/' + path.basename(built.scenery.sectors[0].asset)).buffer().parse((res, done) => { const parts: Buffer[] = []; res.on('data', (part: Buffer) => parts.push(part)); res.on('end', () => done(null, Buffer.concat(parts))); });
    expect(chunk.status).toBe(200); expect(chunk.headers['content-type']).toContain('model/gltf-binary');
    expect(chunk.headers['cache-control']).toBe('no-store');
    expect(chunk.body).toEqual(glb('sector 0'));
    const texture = await request(app).get('/api/data-plugin/scenery/files/textures/' + path.basename(built.sceneryTexture.asset));
    expect(texture.status).toBe(200); expect(texture.headers['content-type']).toContain('image/ktx2'); expect(texture.headers['content-encoding']).toBe('zstd');
    expect((await request(app).get('/api/data-plugin/scenery/files/' + '0'.repeat(64) + '.glb')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/scenery/files/..%2Fmanifest.json')).status).toBe(404);

    const car = await request(app).get('/api/data-plugin/vehicles/test_car.veh/body');
    expect(car.status).toBe(200); expect(car.body).toMatchObject({ folder: 'Test_Car', vehicleIds: ['TEST_CAR'], sha256: built.car.sha256 });
    expect((await request(app).get('/api/data-plugin/vehicles/unknown/body')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/vehicles/files/bodies/Test_Car.json')).body).toHaveProperty('vehicleFolder', 'Test_Car');
    expect((await request(app).get('/api/data-plugin/vehicles/files/Test_Car.json')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/vehicles/files/' + path.basename(built.car.asset))).headers['content-type']).toContain('model/gltf-binary');
    expect((await request(app).get('/api/data-plugin/vehicles/files/textures/' + path.basename(built.carTexture.asset))).status).toBe(200);
    expect((await request(app).get('/api/data-plugin/vehicles/files/textures/' + '0'.repeat(64) + '.ktx2.zst')).status).toBe(404);
  });
});
