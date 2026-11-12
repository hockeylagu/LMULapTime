import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DataPlugin } from '../../../server/plugins/dataPlugin.js';
import { createDataPluginRouter } from '../../../server/routes/dataPluginRoutes.js';
import { bodyDescriptorPath, bodyGlbPath, bodyTexturePath, PACKAGE_FILES, renderingBinPath, sceneryChunkPath, sceneryTexturePath } from '../../../shared/packageContract/index.js';
import { glb, syntheticPackage } from '../../helpers/scenes/syntheticPackage.js';
import type { SceneryCloudLight, SceneryCloudsFile } from '../../../shared/types/scenes/clouds.js';
import { cloudMapFiles, loadClouds } from '../../../shared/domain/scenery/cloudMaps.js';
import { testClouds } from '../../helpers/scenes/sceneryProfiles.js';

type Package = ReturnType<typeof syntheticPackage>;
const packages: Package[] = [];
const build = () => { const built = syntheticPackage(); packages.push(built); return built; };
afterEach(() => { for (const built of packages.splice(0)) fs.rmSync(built.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
const state = (built: Package) => new DataPlugin(built.dir).status.state;
/** A stored start file's row: a texture of the given size and level count in a package folder. */
const startFile = (built: Package, folder: 'scenery' | 'vehicles', size: number, levels: number) =>
  ({...built.store(folder === 'scenery' ? sceneryTexturePath : bodyTexturePath, Buffer.from(`start ${folder} ${size}`)), width: size, height: size, levels, gpuBytes: size * size});

describe('schema 9 manifest and files', () => {
  it('loads scenery next to tracks, rendering profiles and the car bodies of the vehicle records', () => {
    const built = build(), plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status).toMatchObject({ scenery: true, bodies: true, logos: true, counts: { tracks: 1, vehicles: 1, scenery: 1, bodies: 1, logos: 1 } });
    const layout = plugin.sceneryLayout('monza_gp')!;
    expect(layout.packageRevision).toBe(plugin.status.revision);
    expect(layout.sectors.map(sector => sector.id)).toEqual(['s0', 's1']);
    expect(layout.chunking).toEqual(built.sceneryShared.chunking); expect(layout.streaming).toEqual(built.sceneryShared.streaming);
    expect(layout.camera).toEqual(built.rendering.camera);
    expect(layout).not.toHaveProperty('schemaVersion');
    expect(plugin.sceneryLayout('spa_wec')).toBeNull();
    expect(plugin.body('test_car.veh')?.folder).toBe('Test_Car');
    expect(plugin.body('TEST_CAR')?.packageRevision).toBe(plugin.status.revision);
    expect(plugin.body('OTHER')).toBeNull();
  });

  it('expands the compact layout row: derived asset paths, texture paths from the table, shared parameters, per-layout sun grid and altitude', () => {
    const built = build(), layout = new DataPlugin(built.dir).sceneryLayout('monza_gp')!, [sector] = layout.sectors;
    expect(sector.asset).toBe(sceneryChunkPath(built.scenery.sectors[0].sha256));
    expect(layout.horizon.asset).toBe(sceneryChunkPath(built.scenery.horizon.sha256));
    expect(sector.textures).toEqual([built.sceneryTexture.asset]);
    expect(layout.textures).toEqual([{ ...built.sceneryShared.textures[0], asset: built.sceneryTexture.asset }]);
    for (const key of ['prev', 'next']) expect(sector).not.toHaveProperty(key);
    expect(layout).not.toHaveProperty('totals');
    expect(layout.sky.sun).not.toHaveProperty('layouts'); expect(layout.sky.sun.grid).toEqual(built.rendering.sky.sun.layouts.monza_gp);
    expect(layout.sky.hosek).not.toHaveProperty('layoutAltitudeM'); expect(layout.sky.hosek.altitudeM).toBe(built.rendering.sky.hosek.layoutAltitudeM.monza_gp);
    expect(layout.sky.clouds).toEqual(built.rendering.sky.clouds);
  });

  it('looks bodies up by any vehicle id through the top-level bodies list', () => {
    const built = build();
    built.setVehicles([{ id: 'base', vehicleIds: ['TEST_CAR'] }, { id: 'evo', vehicleIds: ['TEST_CAR_EVO'] }]); built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.counts).toMatchObject({ vehicles: 2, bodies: 1 });
    for (const id of ['TEST_CAR', 'test_car_evo.veh', ' Test_Car ']) expect(plugin.body(id)).toMatchObject({ folder: 'Test_Car', vehicleIds: ['TEST_CAR', 'TEST_CAR_EVO'] });
    expect(plugin.body('TEST_CAR')?.sha256).toBe(built.car.sha256);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, '9', undefined, 10])('rejects manifest schema %s: only schema 9 is supported', schemaVersion => {
    const built = build();
    built.manifest.schemaVersion = schemaVersion; built.commit();
    expect(state(built)).toBe('invalid');
  });

  it('refuses a schema 8 manifest, which listed its catalogs', () => {
    const built = build();
    Object.assign(built.manifest, { schemaVersion: 8, tracks: { catalog: 'tracks/index.json' }, vehicles: { catalog: 'vehicles/index.json' }, scenery: { catalog: 'scenery/index.json' } }); built.commit();
    expect(state(built)).toBe('invalid');
  });

  it.each(['cars', 'tracks', 'vehicles', 'scenery', 'rendering', 'unknown'])('rejects the manifest key %s: the manifest is only the schema, id and version', key => {
    const built = build();
    built.manifest[key] = { catalog: 'tracks/index.json' }; built.commit();
    expect(state(built)).toBe('invalid');
  });

  it.each(Object.entries(PACKAGE_FILES))('refuses a package without its %s catalog file (%s)', (_name, file) => {
    const built = build();
    fs.rmSync(path.join(built.dir, file));
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
    ['a missing camera profile', (built: Package) => { delete (built.rendering as Partial<typeof built.rendering>).camera; }],
    ['a metering window outside the frame', (built: Package) => { built.rendering.camera.types.tv.meteringWindow.width = 0.95; }],
    ['camera profiles out of elevation order', (built: Package) => { built.rendering.camera.types.external.profiles.reverse(); }],
    ['a non-positive exposure target', (built: Package) => { built.rendering.camera.types.onboard.profiles[0].targetExposure = 0; }],
    ['a non-positive light/dark border', (built: Package) => { built.rendering.camera.types.onboard.profiles[0].lightDarkBorder = 0; }],
    ['a minimum exposure over the maximum', (built: Package) => { built.rendering.camera.types.tv.profiles[0].minExposure = 9; }],
    ['a non-positive overcast maximum exposure', (built: Package) => { built.rendering.camera.types.tv.profiles[0].overcast.maxExposure = 0; }],
    ['a non-positive tone curve', (built: Package) => { built.rendering.camera.types.tv.profiles[1].toneCurve.a = 0; }],
    ['a missing weather blend rate', (built: Package) => { delete (built.rendering.camera.types.tv as Partial<typeof built.rendering.camera.types.tv>).weatherBlendRate; }],
    ['a non-positive weather blend rate', (built: Package) => { built.rendering.camera.types.external.weatherBlendRate = 0; }],
    ['a profile without its overcast look', (built: Package) => { delete (built.rendering.camera.types.onboard.profiles[0] as Partial<typeof built.rendering.camera.types.onboard.profiles[0]>).overcast; }],
    ['a non-positive overcast exposure target', (built: Package) => { built.rendering.camera.types.tv.profiles[0].overcast.targetExposure = 0; }],
    ['a non-positive overcast tone curve', (built: Package) => { built.rendering.camera.types.tv.profiles[1].overcast.toneCurve.a = 0; }],
    ['a missing weather lerp power', (built: Package) => { delete (built.rendering.camera.types.external.profiles[0] as Partial<typeof built.rendering.camera.types.external.profiles[0]>).weatherLerpPower; }],
    ['a non-positive weather lerp power', (built: Package) => { built.rendering.camera.types.external.profiles[1].weatherLerpPower = 0; }],
    ['a non-positive adaptation scale', (built: Package) => { built.rendering.camera.types.external.adaptationScale = 0; }],
    ['a missing camera type', (built: Package) => { delete (built.rendering.camera.types as Partial<typeof built.rendering.camera.types>).tv; }],
    ['a non-positive output gamma', (built: Package) => { built.rendering.camera.outputGamma = 0; }],
    ['an unknown camera field', (built: Package) => { (built.rendering.camera as unknown as Record<string, unknown>).extra = 1; }],
    ['a missing sky profile', (built: Package) => { delete (built.rendering as Partial<typeof built.rendering>).sky; }],
    ['four Perez scales', (built: Package) => { built.rendering.sky.perezScale.pop(); }],
    ['Perez multipliers out of elevation order', (built: Package) => { built.rendering.sky.perezMultipliers.reverse(); }],
    ['a missing environment probe', (built: Package) => { delete (built.scenery as Partial<typeof built.scenery>).environmentProbe; }],
    ['a missing scene luminance scale', (built: Package) => { delete (built.rendering.camera as Partial<typeof built.rendering.camera>).sceneLuminanceScale; }],
    ['a turbidity range upside down', (built: Package) => { built.rendering.sky.turbidity.min = 9; }],
    ['a haze density range upside down', (built: Package) => { built.rendering.sky.fog.density.max = 0; }],
    ['no horizon samples', (built: Package) => { built.rendering.sky.fog.colour.horizonSampleCount = 0; }],
    ['a missing height haze', (built: Package) => { delete (built.rendering.sky.fog as Partial<typeof built.rendering.sky.fog>).height; }],
    ['a missing air mass', (built: Package) => { delete (built.rendering.sky as Partial<typeof built.rendering.sky>).airMass; }],
    ['a missing sun', (built: Package) => { delete (built.rendering.sky as Partial<typeof built.rendering.sky>).sun; }],
    ['a sun grid for a layout the catalog does not list', (built: Package) => { built.rendering.sky.sun.layouts.spa_wec = built.rendering.sky.sun.layouts.monza_gp; }],
    ['a layout without its sun grid', (built: Package) => { delete built.rendering.sky.sun.layouts.monza_gp; }],
    ['sun elevations out of order', (built: Package) => { built.rendering.sky.sun.sunElevationDeg.reverse(); }],
    ['a sun grid short of a coverage row', (built: Package) => { built.rendering.sky.sun.layouts.monza_gp.pop(); }],
    ['a sun grid short of an elevation sample', (built: Package) => { built.rendering.sky.sun.layouts.monza_gp[0].pop(); }],
    ['a sun sample that is not positive', (built: Package) => { built.rendering.sky.sun.layouts.monza_gp[1][2][1] = 0; }],
    ['a missing sky model', (built: Package) => { delete (built.rendering.sky as Partial<typeof built.rendering.sky>).hosek; }],
    ['a ground albedo above 1', (built: Package) => { built.rendering.sky.hosek.albedo = 1.5; }],
    ['a sky matrix short of a row', (built: Package) => { (built.rendering.sky.hosek.xyzToRgb as unknown[]).pop(); }],
    ['a sky dataset short of a value', (built: Package) => { built.rendering.sky.hosek.coefficients[1].pop(); }],
    ['a sky radiance dataset short of a value', (built: Package) => { built.rendering.sky.hosek.radiances[2].pop(); }],
    ['a zero scale height', (built: Package) => { built.rendering.sky.hosek.scaleHeightM = 0; }],
    ['a sky box offset outside the box', (built: Package) => { built.rendering.sky.hosek.box.yOffset = -500; }],
    ['a sky box without a size', (built: Package) => { built.rendering.sky.hosek.box.size = 0; }],
    ['a layout without its altitude', (built: Package) => { delete built.rendering.sky.hosek.layoutAltitudeM.monza_gp; }],
    ['an altitude for a layout the catalog does not list', (built: Package) => { built.rendering.sky.hosek.layoutAltitudeM.spa_wec = 0; }],
    ['a missing shading', (built: Package) => { delete (built.rendering as Partial<typeof built.rendering>).shading; }],
    ['a glint cosine above 1', (built: Package) => { built.rendering.shading.sunGlint.cosineThreshold = 1.5; }],
    ['small-edge limits upside down', (built: Package) => { built.rendering.shading.smallEdge.limitMin = 1000; }],
    ['an unknown paint LOD mode', (built: Package) => { (built.rendering.shading.carPaintReflection as { clearCoatLod: string }).clearCoatLod = 'auto'; }],
    ['a convolution kernel without samples', (built: Package) => { built.rendering.shading.convolution.kernels[1].samples = []; }],
    ['a convolution sample that is not a direction', (built: Package) => { built.rendering.shading.convolution.kernels[1].samples[1] = [1, 1, 0]; }],
    ['a convolution power that is not a number', (built: Package) => { built.rendering.shading.convolution.kernels[1].specularPower = 'high'; }],
    ['a scenery reflection without families', (built: Package) => { built.rendering.shading.sceneryReflection.families = []; }],
    ['a dielectric F0 above 1', (built: Package) => { built.rendering.shading.sceneryReflection.dielectricF0 = 1.2; }],
    ['an unknown scenery LOD mode', (built: Package) => { (built.rendering.shading.sceneryReflection as { lod: string }).lod = 'auto'; }],
    ['an integration map short of texels', (built: Package) => { built.rendering.shading.integrationMap.bias.pop(); }],
    ['an integration texel above 255', (built: Package) => { built.rendering.shading.integrationMap.scale[0] = 256; }],
    ['an integration map in another encoding', (built: Package) => { (built.rendering.shading.integrationMap as { encoding: string }).encoding = 'float'; }],
    ['a missing cloud field', (built: Package) => { delete (built.rendering.sky as Partial<typeof built.rendering.sky>).clouds; }],
    ['cloud layers that do not add up to the cells', (built: Package) => { built.rendering.sky.clouds.cells.pop(); }],
    ['fifteen cloud codes', (built: Package) => { built.rendering.sky.clouds.codes.pop(); }],
    ['a cloud code naming no type', (built: Package) => { built.rendering.sky.clouds.codes[0] = 'unknown'; }],
    ['a cloud type naming no mesh', (built: Package) => { built.rendering.sky.clouds.meshes = {}; }],
    ['a cloud material naming no map', (built: Package) => { built.rendering.sky.clouds.maps = {}; }],
    ['a cloud mesh with a vertex out of range', (built: Package) => { Object.values(built.rendering.sky.clouds.meshes)[0].triangles[0] = 999; }],
    ['a cloud map short of bytes', (built: Package) => { Object.values(built.rendering.sky.clouds.maps)[0].width += 1; }],
    ['a cloud material naming no light map', (built: Package) => { built.rendering.sky.clouds.lightMaps = {}; }],
    ['a cloud side map of one channel', (built: Package) => { built.rendering.sky.clouds.lightMaps.side = built.rendering.sky.clouds.lightMaps.full; }],
    ['a cloud light map short of bytes', (built: Package) => { Object.values(built.rendering.sky.clouds.lightMaps)[0].width += 1; }],
    ['a cloud mesh frame short of a vertex', (built: Package) => { Object.values(built.rendering.sky.clouds.meshes)[0].tangents.pop(); }],
    ['a cloud light without its backlight', (built: Package) => { delete (Object.values(built.rendering.sky.clouds.types)[0].materials[0].light as Partial<SceneryCloudLight>).backlight; }],
    ['a cloud albedo of two channels', (built: Package) => { Object.values(built.rendering.sky.clouds.types)[0].materials[0].light.albedo.max.pop(); }],
    ['a cloud darkness above 1', (built: Package) => { Object.values(built.rendering.sky.clouds.types)[0].darkness = 1.5; }],
    ['an unknown cloud averaging', (built: Package) => { (built.rendering.sky.clouds.averagedInputs as { variant: string }).variant = 'first'; }],
    ['a missing sun visibility rule', (built: Package) => { delete (built.rendering.shading as Partial<typeof built.rendering.shading>).sunVisibility; }],
    ['an unknown sun occlusion curve', (built: Package) => { (built.rendering.shading.sunVisibility.occlusion as { curve: string }).curve = 'linear'; }],
    ['a sun view with near beyond far', (built: Package) => { built.rendering.shading.sunVisibility.view.near = 2000; }],
    ['a sun view without resolution', (built: Package) => { built.rendering.shading.sunVisibility.view.resolution = 0; }],
    ['a missing shadow profile', (built: Package) => { delete (built.rendering.shading as Partial<typeof built.rendering.shading>).shadows; }],
    ['a cascade tile outside the atlas', (built: Package) => { built.rendering.shading.shadows.atlas.cascadeTiles[1] = [0, 48, 0]; }],
    ['a cascade tile in an atlas that does not exist', (built: Package) => { built.rendering.shading.shadows.atlas.cascadeTiles[2] = [2, 0, 0]; }],
    ['shadow filter weights that do not sum to 1', (built: Package) => { built.rendering.shading.shadows.filter.taps[0].weight = 3; }],
    ['an unknown cascade selection', (built: Package) => { (built.rendering.shading.shadows.select as { method: string }).method = 'nearest'; }],
    ['a shadow camera set short of a split', (built: Package) => { built.rendering.shading.shadows.cameras.chase.splitsM?.pop(); }],
    ['shadow splits that do not end at far', (built: Package) => { built.rendering.shading.shadows.cameras.cockpit.splitsM = [30, 150]; }],
    ['shadow splits out of order', (built: Package) => { built.rendering.shading.shadows.cameras.chase.splitsM = [80, 20, 300]; }],
    ['more cascades than atlas tiles', (built: Package) => { Object.assign(built.rendering.shading.shadows.cameras.chase, { count: 4, splitsM: [10, 20, 80, 300] }); }],
    ['another cascade centre rule', (built: Package) => { (built.rendering.shading.shadows.centre as { at: string }).at = 'splitEnd'; }],
    ['cascades that turn with the view', (built: Package) => { (built.rendering.shading.shadows.orientation as { followsView: boolean }).followsView = true; }],
    ['an extra cascade orientation key', (built: Package) => { (built.rendering.shading.shadows.orientation as Record<string, unknown>).depthM = 400; }],
    ['a null shadow set with a ratio', (built: Package) => { built.rendering.shading.shadows.cameras.tv.splitRatio = 0.9; }],
    ['a shadow camera type the package does not define', (built: Package) => { (built.rendering.shading.shadows.cameras as Record<string, unknown>).hood = built.rendering.shading.shadows.cameras.tv; }],
    ['a missing sky haze', (built: Package) => { delete (built.rendering.sky as Partial<typeof built.rendering.sky>).haze; }],
    ['a negative sky haze depth', (built: Package) => { built.rendering.sky.haze.depth.overcast = -1; }],
    ['sky colour profiles out of order', (built: Package) => { built.rendering.sky.colourProfiles.profiles.reverse(); }],
    ['a negative sky colour gain', (built: Package) => { built.rendering.sky.colourProfiles.profiles[0].clear.gain[1] = -0.1; }],
    ['a zero sky weather power', (built: Package) => { built.rendering.sky.colourProfiles.profiles[1].weatherLerpPower = 0; }],
    ['a stale geometry revision', (built: Package) => { built.scenery.sourceGeometryRevision = 'old'; }],
    ['a chunk hash that is not a hash', (built: Package) => { built.scenery.sectors[0].sha256 = 'S0'; }],
    ['a chunk of the wrong size', (built: Package) => { built.scenery.sectors[0].byteLength += 1; }],
    ['a missing chunk file', (built: Package) => { fs.rmSync(path.join(built.dir, sceneryChunkPath(built.scenery.sectors[1].sha256))); }],
    ['sectors out of lap order', (built: Package) => { built.scenery.sectors.reverse(); }],
    ['prev/next links the compact catalog no longer has', (built: Package) => { Object.assign(built.scenery.sectors[0], { next: 's0' }); }],
    ['catalog totals the compact catalog no longer has', (built: Package) => { Object.assign(built.scenery, { totals: { triangles: 30 } }); }],
    ['a chunk asset path the catalog no longer states', (built: Package) => { Object.assign(built.scenery.sectors[0], { asset: sceneryChunkPath(built.scenery.sectors[0].sha256) }); }],
    ['a sector longer than the route', (built: Package) => { built.scenery.sectors[1].lapEndM = built.scenery.routeLengthM * 1.5 + 10; }],
    ['a sector starting beyond the route', (built: Package) => { Object.assign(built.scenery.sectors[1], {lapStartM: built.scenery.routeLengthM, lapEndM: built.scenery.routeLengthM + 10}); }],
    ['sectors out of lap order', (built: Package) => { Object.assign(built.scenery.sectors[0], {lapStartM: built.scenery.routeLengthM / 2 + 1, lapEndM: built.scenery.routeLengthM}); }],
    ['duplicate chunk ids', (built: Package) => { built.scenery.sectors[1].id = 's0'; }],
    ['a texture missing from the layout list', (built: Package) => { built.scenery.sectors[0].textures = [1]; }],
    ['a texture file of the wrong size', (built: Package) => { built.sceneryShared.textures[0].byteLength = (built.sceneryShared.textures[0].byteLength as number) + 1; }],
    ['a layout texture naming no table entry', (built: Package) => { built.scenery.textures[0].texture = 5; }],
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
    ['a texture size above its full size', (built: Package) => { Object.assign(built.scenery.textures[0], {maxPx: 32}); }],
    ['a texture size that is not one of its levels', (built: Package) => { Object.assign(built.scenery.textures[0], {maxPx: 6}); }],
    ['a start file on a texture too small for one', (built: Package) => { Object.assign(built.sceneryShared.textures[0], {start: built.rowOf(startFile(built, 'scenery', 4, 3))}); }],
    ['a start file the package does not hold', (built: Package) => {
      Object.assign(built.sceneryShared.textures[0], {width: 2048, height: 2048, levels: 12, start: {...built.rowOf(startFile(built, 'scenery', 512, 10)), sha256: '2'.repeat(64)}});
    }],
    ['a start file that is not the texture from its third level down', (built: Package) => {
      Object.assign(built.sceneryShared.textures[0], {width: 2048, height: 2048, levels: 12, start: built.rowOf(startFile(built, 'scenery', 1024, 11))});
    }],
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
    expect(new DataPlugin(built.dir).sceneryLayout('monza_gp')?.daylight.utcOffsetHours).toBe(9);
  });

  it('accepts a texture start file', () => {
    const built = build(), start = startFile(built, 'scenery', 512, 10);
    Object.assign(built.sceneryShared.textures[0], {width: 2048, height: 2048, levels: 12, start: built.rowOf(start)}); built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.sceneryLayout('monza_gp')?.textures[0].start).toEqual(start);
  });

  it('accepts the largest size worth loading on a texture', () => {
    const built = build();
    Object.assign(built.scenery.textures[0], {maxPx: 8}); built.commit();
    expect(new DataPlugin(built.dir).sceneryLayout('monza_gp')?.textures[0].maxPx).toBe(8);
  });

  it('accepts a venue-shared chunk that overlaps the first sector and wraps past the line', () => {
    const built = build();
    Object.assign(built.scenery.sectors[1], { id: 'v1', lapEndM: built.scenery.routeLengthM + 10 }); built.commit();
    expect(new DataPlugin(built.dir).sceneryLayout('monza_gp')?.sectors[1].lapEndM).toBe(built.scenery.routeLengthM + 10);
  });

  it('rejects a layout without daylight: every layout states it', () => {
    const built = build();
    delete (built.scenery as Partial<typeof built.scenery>).daylight; built.commit();
    expect(state(built)).toBe('invalid');
  });
});

describe('car validation', () => {
  const mutate = (change: (built: Package) => void) => { const built = build(); change(built); built.commit(); return state(built); };

  it('accepts an interior file and texture start files on a body', () => {
    const built = build(), interior = {...built.rowOf(built.store(bodyGlbPath, Buffer.from('interior'))), triangles: 10, vertices: 30};
    const start = built.rowOf(startFile(built, 'vehicles', 512, 10));
    Object.assign(built.car, {interior, textures: [{...built.rowOf(built.carTexture), interiorOnly: true, start}]}); built.commit();
    const plugin = new DataPlugin(built.dir), body = plugin.body('TEST_CAR');
    expect([body?.interior, body?.textures[0].start]).toEqual([interior, start]);
  });

  it.each([
    ['a body without its interior field', (built: Package) => { delete (built.car as Partial<typeof built.car>).interior; }],
    ['an interior file the package does not hold', (built: Package) => { Object.assign(built.car, {interior: {sha256: '1'.repeat(64), byteLength: 1, triangles: 1, vertices: 3}}); }],
    ['an interior-only mark that is not true', (built: Package) => { Object.assign(built.car, {textures: [{...built.rowOf(built.carTexture), interiorOnly: false}]}); }],
    ['a texture start file the package does not hold', (built: Package) => { Object.assign(built.car, {textures: [{...built.rowOf(built.carTexture), start: {...built.rowOf(startFile(built, 'vehicles', 512, 10)), sha256: '3'.repeat(64)}}]}); }],
    ['a body that states its path (derived from the hash)', (built: Package) => { Object.assign(built.car, {asset: bodyGlbPath(built.car.sha256)}); }],
    ['a body that states its descriptor path', (built: Package) => { Object.assign(built.car, {descriptor: bodyDescriptorPath(built.car.folder)}); }],
    ['a body hash that is not a hash', (built: Package) => { built.car.sha256 = 'GLB'; }],
    ['a body file of the wrong size', (built: Package) => { built.car.byteLength += 1; }],
    ['a descriptor whose bytes differ from the catalog hash', (built: Package) => { built.commit(); built.write(bodyDescriptorPath(built.car.folder), Buffer.from(JSON.stringify(built.descriptor) + ' ')); built.commit = () => {}; }],
  ])('rejects %s', (_name, change) => { expect(mutate(change)).toBe('invalid'); });

  /** Replaces the vehicle catalog written by `commit()` with raw records and bodies. */
  const rewrite = (change: (built: Package, vehicle: Record<string, unknown>) => unknown) => {
    const built = build(); built.commit();
    built.write('vehicles/index.json', change(built, built.record(built.vehicles[0])) as object);
    return state(built);
  };

  it.each([
    ['aliases the descriptor no longer states', (built: Package) => { built.descriptor.aliases = ['TEST_CAR']; }],
    ['a retired vehicle folder field', (built: Package) => { built.descriptor.vehicleFolder = 'Test_Car'; }],
    ['a retired wheel rig', (built: Package) => { built.descriptor.wheelRig = { passed: true, rigs: 4, maxRestVertexErrorM: 0 }; }],
    ['retired wheel pivots', (built: Package) => { built.descriptor.wheelPivots = {}; }],
    ['appearances that do not cover the ids', (built: Package) => { built.descriptor.appearances = []; }],
    ['an appearance without its number', (built: Package) => { delete (built.descriptor.appearances as Array<{ number?: unknown }>)[0].number; }],
    ['no option node list', (built: Package) => { delete built.descriptor.optionNodes; }],
    ['unsorted option nodes', (built: Package) => { built.descriptor.optionNodes = ['option_NumplateB', 'option_NumplateA']; }],
    ['an option node three.js would rename', (built: Package) => { built.descriptor.optionNodes = ['option_Numplate.A']; }],
    ['an entry showing an option the body lacks', (built: Package) => { (built.descriptor.appearances as Array<{ optionNodes: string[] }>)[0].optionNodes = ['option_Spoiler']; }],
    ['an entry without its option list', (built: Package) => { delete (built.descriptor.appearances as Array<{ optionNodes?: string[] }>)[0].optionNodes; }],
    ['an undeclared texture', (built: Package) => { (built.descriptor.appearances as Array<{ materialTextures?: unknown }>)[0].materialTextures = { body: 'textures/' + '1'.repeat(64) + '.ktx2.zst' }; }],
    ['a descriptor schema version', (built: Package) => { built.descriptor.schemaVersion = 1; }],
    ['an unknown descriptor field', (built: Package) => { built.descriptor.extra = true; }],
    ['cameras without the driver camera', (built: Package) => { const cameras = built.descriptor.cameras as { list: Array<{ name: string }> }; built.descriptor.cameras = { ...cameras, list: cameras.list.filter(camera => camera.name !== 'cockpit') }; }],
    ['cameras without their frame statement', (built: Package) => { delete (built.descriptor.cameras as Record<string, unknown>).frame; }],
    ['a camera with an inverted clip range', (built: Package) => { (built.descriptor.cameras as { list: Array<{ clipPlanes: number[] }> }).list[0].clipPlanes = [5, 1]; }],
    ['no lamp list', (built: Package) => { delete built.descriptor.lamps; }],
    ['an unknown lamp role', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].role = 'fog'; }],
    ['a lamp frame that is neither a texture path nor null', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].frames = ['lamp.png']; }],
    ['a lamp state past its frames', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].states = { off: 1, on: null, brake: null }; }],
    ['a lamp animation frame past its frames', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].animation = { method: 'loop', rate: 1, sequence: [0, 3] }; }],
    ['a lamp without its cockpit reading', (built: Package) => { delete (built.descriptor.lamps as Array<Record<string, unknown>>)[0].hiddenInOwnCockpit; }],
    ['an unknown lamp blend', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].blend = 'additive'; }],
    ['a brake glow range on a headlight', (built: Package) => { (built.descriptor.lamps as Array<Record<string, unknown>>)[0].brakeGlowRange = [640, 950]; }],
    ['no glow material list', (built: Package) => { delete built.descriptor.glowMaterialIds; }],
    ['a glow material the body does not list', (built: Package) => { built.descriptor.glowMaterialIds = ['m2']; }],
    ['a non-boolean paint flag',(built: Package) => { (built.descriptor.materials as Array<{ paint: unknown }>)[0].paint = 'yes'; }],
    ['a car texture of the wrong size', (built: Package) => { built.car.textures[0].byteLength = (built.car.textures[0].byteLength as number) + 1; }],
  ])('rejects %s', (_name, change) => { expect(mutate(change)).toBe('invalid'); });

  it('accepts a lamp the game draws with a lit shader: no emission', () => {
    const built = build();
    (built.descriptor.lamps as Array<Record<string, unknown>>)[0].emission = null; built.commit();
    expect(new DataPlugin(built.dir).body('TEST_CAR')).not.toBeNull();
  });

  it.each([
    ['a body serving ids outside its records', (built: Package, vehicle: Record<string, unknown>) => ({ vehicles: [vehicle], bodies: [{ ...built.car, vehicleIds: ['OTHER_CAR'] }] })],
    ['a body missing some ids of its record', (built: Package, vehicle: Record<string, unknown>) => ({ vehicles: [{ ...vehicle, vehicleIds: ['TEST_CAR', 'TEST_TWO'] }], bodies: [{ ...built.car, vehicleIds: ['TEST_CAR'] }] })],
    ['an empty bodies list', (_built: Package, vehicle: Record<string, unknown>) => ({ vehicles: [vehicle], bodies: [] })],
    ['an id in two bodies', (built: Package, vehicle: Record<string, unknown>) => ({ vehicles: [vehicle], bodies: [built.car, { ...built.car, folder: 'Zed_Car' }] })],
    ['a body listed twice', (built: Package, vehicle: Record<string, unknown>) => ({ vehicles: [vehicle], bodies: [built.car, built.car] })],
    ['a body field of the old catalog', (built: Package, vehicle: Record<string, unknown>) => ({ vehicles: [vehicle], bodies: [{ ...built.car, schemaVersion: 1 }] })],
    ['bodies inside the record (the old shape)', (built: Package, vehicle: Record<string, unknown>) => ({ vehicles: [{ ...vehicle, bodies: [built.car] }], bodies: [built.car] })],
    ['a catalog without the bodies list', (_built: Package, vehicle: Record<string, unknown>) => ({ vehicles: [vehicle] })],
    ['a bare array as the catalog', (_built: Package, vehicle: Record<string, unknown>) => [vehicle]],
  ])('rejects %s', (_name, change) => { expect(rewrite(change)).toBe('invalid'); });

  it('rejects logos that are not a plain brand map', () => {
    const built = build();
    built.write('vehicles/logos.json', { logos: { Ferrari: 5 } });
    expect(state(built)).toBe('invalid');
  });

  it('loads a further geometry of a car folder, named <folder>.<hash>, from its installed folder descriptor', () => {
    const built = build();
    built.car.folder = 'Test_Car.0a1b2c3d'; built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.body('TEST_CAR')?.folder).toBe('Test_Car.0a1b2c3d');
  });
});

describe('scenery, car and rendering routes', () => {
  /** The response body of a file route as bytes. */
  const bytesOf = (res: request.Test) => res.buffer().parse((response, done) => { const parts: Buffer[] = []; response.on('data', (part: Buffer) => parts.push(part)); response.on('end', () => done(null, Buffer.concat(parts))); });

  it('serves layouts, car resources and package files as is, uncached', async () => {
    const built = build(), app = express();
    app.use('/api/data-plugin', createDataPluginRouter(new DataPlugin(built.dir)));
    const layout = await request(app).get('/api/data-plugin/scenery/monza_gp');
    expect(layout.status).toBe(200); expect(layout.body).toHaveProperty('horizon.id', 'horizon'); expect(layout.body).toHaveProperty('packageRevision');
    expect((await request(app).get('/api/data-plugin/scenery/spa_wec')).status).toBe(404);

    const chunk = await bytesOf(request(app).get('/api/data-plugin/scenery/files/' + path.basename(sceneryChunkPath(built.scenery.sectors[0].sha256))));
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
    expect((await request(app).get('/api/data-plugin/vehicles/files/bodies/Test_Car.json')).body).toHaveProperty('optionNodes');
    expect((await request(app).get('/api/data-plugin/vehicles/files/Test_Car.json')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/vehicles/files/' + path.basename(bodyGlbPath(built.car.sha256)))).headers['content-type']).toContain('model/gltf-binary');
    expect((await request(app).get('/api/data-plugin/vehicles/files/textures/' + path.basename(built.carTexture.asset))).status).toBe(200);
    expect((await request(app).get('/api/data-plugin/vehicles/files/textures/' + '0'.repeat(64) + '.ktx2.zst')).status).toBe(404);
  });

  it('serves the cloud map files the layout names, and the client slices them back into the mips the maps were made from', async () => {
    const built = build(), app = express(), plugin = new DataPlugin(built.dir);
    app.use('/api/data-plugin', createDataPluginRouter(plugin));
    const layout = (await request(app).get('/api/data-plugin/scenery/monza_gp')).body as { sky: { clouds: SceneryCloudsFile } };
    const clouds = layout.sky.clouds, source = testClouds();
    const loaded = new Map<string, Uint8Array>();
    for (const file of cloudMapFiles(clouds).keys()) {
      const res = await bytesOf(request(app).get(`/api/data-plugin/rendering/files/${path.basename(file)}`));
      expect(res.status).toBe(200); expect(res.headers['content-type']).toContain('application/octet-stream');
      loaded.set(file, Uint8Array.from(res.body as Buffer));
    }
    const decoded = loadClouds(clouds, loaded);
    for (const [key, map] of Object.entries(source.maps)) expect(decoded.maps[key].mips).toEqual(map.mips);
    for (const [key, map] of Object.entries(source.lightMaps)) expect(decoded.lightMaps[key].mips).toEqual(map.mips);
    expect((await request(app).get('/api/data-plugin/rendering/files/' + '0'.repeat(64) + '.bin')).status).toBe(404);
  });
});

describe('cloud map files', () => {
  it('rejects a cloud map file whose bytes differ from its hash', () => {
    const built = build(), [hash] = built.cloudMaps.files.keys();
    fs.writeFileSync(path.join(built.dir, renderingBinPath(hash)), Buffer.from('tampered'));
    expect(state(built)).toBe('invalid');
  });

  it('rejects a missing cloud map file', () => {
    const built = build(), [hash] = built.cloudMaps.files.keys();
    fs.rmSync(path.join(built.dir, renderingBinPath(hash)));
    expect(state(built)).toBe('invalid');
  });

  it('rejects a cloud map whose mip lengths do not add up to its size', () => {
    const built = build(), map = Object.values(built.rendering.sky.clouds.maps)[0];
    map.mipByteLengths = [...map.mipByteLengths].reverse().slice(1);
    built.commit();
    expect(state(built)).toBe('invalid');
  });
});
