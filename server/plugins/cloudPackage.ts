import { array, count, exactKeys, finite, nonNegative, record, text } from './strict.js';

const LAYER = ['cells', 'instances', 'spacingM', 'heightM', 'jitter', 'drift'];
const PLACEMENT = ['gridScale', 'endMargin', 'fadeGain', 'pushRadius', 'push', 'edgePitchRad', 'edgeDrop', 'riseDrop', 'centreLineYawRad', 'centreLinePitchRad', 'centreLineRollRad'];

function unit(value: unknown, what: string): number {
  const n = nonNegative(value, what);
  if (n > 1) throw Error(`${what}: above 1`);
  return n;
}

function positive(value: unknown, what: string): number {
  const n = finite(value, what);
  if (n <= 0) throw Error(`${what}: must be positive`);
  return n;
}

/** A cloud material's lighting block (SceneryCloudLight): every group present, colours and UV pairs of the right length. */
function parseCloudLight(value: unknown, what: string): void {
  const light = record(value, what);
  exactKeys(light, ['uv', 'albedo', 'ambient', 'backlight', 'diffuse'], what);
  const group = (name: string, keys: string[]) => { const row = record(light[name], `${what}.${name}`); exactKeys(row, keys, `${what}.${name}`); return row; };
  const numbers = (name: string, keys: string[]) => { const row = group(name, keys); keys.forEach(key => nonNegative(row[key], `${what}.${name}.${key}`)); };
  const list = (value: unknown, at: string, length: number) => {
    const values = array(value, at, length);
    if (values.length !== length) throw Error(`${at}: expected ${length} numbers`);
    values.forEach(n => finite(n, at));
  };
  const uv = group('uv', ['scale', 'offset']), albedo = group('albedo', ['max', 'min', 'randomMax', 'randomMin']);
  list(uv.scale, `${what}.uv.scale`, 2); list(uv.offset, `${what}.uv.offset`, 2); list(albedo.max, `${what}.albedo.max`, 3); list(albedo.min, `${what}.albedo.min`, 3);
  unit(albedo.randomMax, `${what}.albedo.randomMax`); unit(albedo.randomMin, `${what}.albedo.randomMin`);
  numbers('ambient', ['scalar', 'occlusion']);
  numbers('backlight', ['narrowScalar', 'narrowPower', 'wideScalar', 'widePower', 'base']);
  numbers('diffuse', ['clear', 'overcast', 'depthScale']);
}

/**
 * The catalog's cloud field (SceneryClouds): two layers whose cell counts add up to the cell table, sixteen codes naming known
 * types, every shown type with meshes and materials that exist, opacity maps whose first level has width × height bytes, and the
 * light maps and lighting block of every material.
 */
export function parseClouds(value: unknown, what: string): void {
  const row = record(value, what);
  exactKeys(row, ['layers', 'cells', 'lowerCells', 'codes', 'types', 'height', 'placement', 'coverage', 'alpha', 'averagedInputs', 'meshes', 'maps', 'lightMaps'], what);
  const layers = record(row.layers, `${what}.layers`), instances: number[] = [];
  exactKeys(layers, ['lower', 'upper'], `${what}.layers`);
  for (const key of ['lower', 'upper']) {
    const at = `${what}.layers.${key}`, layer = record(layers[key], at);
    exactKeys(layer, LAYER, at);
    if (count(layer.cells, `${at}.cells`, 64) < 1) throw Error(`${at}.cells: must be positive`);
    instances.push(count(layer.instances, `${at}.instances`, 256));
    positive(layer.spacingM, `${at}.spacingM`); positive(layer.heightM, `${at}.heightM`); nonNegative(layer.jitter, `${at}.jitter`);
    const drift = record(layer.drift, `${at}.drift`);
    exactKeys(drift, ['windOffsetMs', 'divisorM'], `${at}.drift`);
    nonNegative(drift.windOffsetMs, `${at}.drift.windOffsetMs`); positive(drift.divisorM, `${at}.drift.divisorM`);
  }
  const cells = array(row.cells, `${what}.cells`, 512);
  if (cells.length !== instances[0] + instances[1] || count(row.lowerCells, `${what}.lowerCells`, 512) !== instances[0]) throw Error(`${what}.cells: the layers' instances do not add up to the cells`);
  cells.forEach((cell, i) => {
    const at = `${what}.cells[${i}]`, values = array(cell, at, 4);
    if (values.length !== 4) throw Error(`${at}: expected four numbers`);
    values.forEach(n => finite(n, at));
    if (values[3] !== 0 && values[3] !== 1) throw Error(`${at}: the centre line is 0 or 1`);
  });
  const meshes = record(row.meshes, `${what}.meshes`), maps = record(row.maps, `${what}.maps`), types = record(row.types, `${what}.types`);
  const lightMaps = record(row.lightMaps, `${what}.lightMaps`);
  for (const [key, value] of Object.entries(meshes)) {
    const at = `${what}.meshes.${key}`, mesh = record(value, at);
    exactKeys(mesh, ['positions', 'uvs', 'normals', 'tangents', 'binormals', 'triangles'], at);
    const positions = array(mesh.positions, `${at}.positions`, 30_000), uvs = array(mesh.uvs, `${at}.uvs`, 20_000), triangles = array(mesh.triangles, `${at}.triangles`, 60_000);
    positions.forEach(n => finite(n, `${at}.positions`)); uvs.forEach(n => finite(n, `${at}.uvs`));
    const vertices = positions.length / 3;
    if (!vertices || positions.length % 3 || uvs.length !== vertices * 2 || !triangles.length || triangles.length % 3) throw Error(`${at}: positions, uvs and triangles do not match`);
    triangles.forEach(n => { if (count(n, `${at}.triangles`) >= vertices) throw Error(`${at}.triangles: vertex out of range`); });
    for (const frame of ['normals', 'tangents', 'binormals']) {
      const values = array(mesh[frame], `${at}.${frame}`, 30_000);
      if (values.length !== positions.length) throw Error(`${at}.${frame}: expected one vector per vertex`);
      values.forEach(n => finite(n, `${at}.${frame}`));
    }
  }
  for (const [key, value] of Object.entries(lightMaps)) {
    const at = `${what}.lightMaps.${key}`, map = record(value, at);
    exactKeys(map, ['width', 'height', 'channels', 'mips'], at);
    const width = count(map.width, `${at}.width`, 4096), height = count(map.height, `${at}.height`, 4096), mips = array(map.mips, `${at}.mips`, 16);
    const channels = map.channels;
    if (channels !== 1 && channels !== 3) throw Error(`${at}.channels: expected 1 or 3`);
    if (!width || !height || !mips.length) throw Error(`${at}: empty map`);
    mips.forEach((mip, i) => {
      const bytes = Math.max(1, width >> i) * Math.max(1, height >> i) * channels;
      if (typeof mip !== 'string' || Buffer.from(mip, 'base64').length !== bytes) throw Error(`${at}.mips[${i}]: expected ${bytes} bytes`);
    });
  }
  for (const [key, value] of Object.entries(maps)) {
    const at = `${what}.maps.${key}`, map = record(value, at);
    exactKeys(map, ['width', 'height', 'mips'], at);
    const width = count(map.width, `${at}.width`, 4096), height = count(map.height, `${at}.height`, 4096), mips = array(map.mips, `${at}.mips`, 16);
    if (!width || !height || !mips.length) throw Error(`${at}: empty map`);
    mips.forEach((mip, i) => { if (typeof mip !== 'string') throw Error(`${at}.mips[${i}]: expected base64 text`); });
    if (Buffer.from(mips[0] as string, 'base64').length !== width * height) throw Error(`${at}.mips[0]: expected ${width * height} bytes`);
  }
  for (const [key, value] of Object.entries(types)) {
    const at = `${what}.types.${key}`, type = record(value, at);
    exactKeys(type, ['darkness', 'sideMesh', 'centreLineMesh', 'pushNearCentre', 'heightOffsetM', 'materials'], at);
    unit(type.darkness, `${at}.darkness`); finite(type.heightOffsetM, `${at}.heightOffsetM`);
    if (typeof type.pushNearCentre !== 'boolean') throw Error(`${at}.pushNearCentre: expected true or false`);
    const materials = array(type.materials, `${at}.materials`, 16), shown = type.sideMesh !== null || type.centreLineMesh !== null;
    for (const mesh of ['sideMesh', 'centreLineMesh']) {
      if (shown ? !Object.hasOwn(meshes, text(type[mesh], `${at}.${mesh}`)) : type[mesh] !== null) throw Error(`${at}.${mesh}: not a mesh of the field`);
    }
    if (shown !== materials.length > 0) throw Error(`${at}.materials: a shown type needs materials, a clear one has none`);
    materials.forEach((value, i) => {
      const where = `${at}.materials[${i}]`, material = record(value, where);
      exactKeys(material, ['name', 'opacity', 'cloudMap', 'light', 'sideMap', 'endMap'], where);
      text(material.name, `${where}.name`);
      const opacity = record(material.opacity, `${where}.opacity`);
      exactKeys(opacity, ['scalar', 'visibility', 'randomRange'], `${where}.opacity`);
      for (const k of ['scalar', 'visibility', 'randomRange']) unit(opacity[k], `${where}.opacity.${k}`);
      if (!Object.hasOwn(maps, text(material.cloudMap, `${where}.cloudMap`))) throw Error(`${where}.cloudMap: not a map of the field`);
      for (const [name, channels] of [['cloudMap', 1], ['sideMap', 3], ['endMap', 3]] as const) {
        const key = text(material[name], `${where}.${name}`);
        if (!Object.hasOwn(lightMaps, key) || record(lightMaps[key], `${where}.${name}`).channels !== channels) throw Error(`${where}.${name}: no light map of ${channels} channel(s)`);
      }
      parseCloudLight(material.light, `${where}.light`);
    });
  }
  const codes = array(row.codes, `${what}.codes`, 16);
  if (codes.length !== 16) throw Error(`${what}.codes: expected 16 codes`);
  codes.forEach((code, i) => { if (!Object.hasOwn(types, text(code, `${what}.codes[${i}]`))) throw Error(`${what}.codes[${i}]: not a type of the field`); });
  const height = record(row.height, `${what}.height`);
  exactKeys(height, ['perCellM', 'perCodeM'], `${what}.height`);
  finite(height.perCellM, `${what}.height.perCellM`); finite(height.perCodeM, `${what}.height.perCodeM`);
  const placement = record(row.placement, `${what}.placement`);
  exactKeys(placement, PLACEMENT, `${what}.placement`);
  for (const key of PLACEMENT) finite(placement[key], `${what}.placement.${key}`);
  positive(placement.gridScale, `${what}.placement.gridScale`); positive(placement.fadeGain, `${what}.placement.fadeGain`);
  const coverage = record(row.coverage, `${what}.coverage`);
  exactKeys(coverage, ['falloff', 'approachPerS'], `${what}.coverage`);
  unit(coverage.falloff, `${what}.coverage.falloff`); positive(coverage.approachPerS, `${what}.coverage.approachPerS`);
  const alpha = record(row.alpha, `${what}.alpha`);
  exactKeys(alpha, ['gain', 'powerFrom', 'powerTo'], `${what}.alpha`);
  for (const key of ['gain', 'powerFrom', 'powerTo']) positive(alpha[key], `${what}.alpha.${key}`);
  const averaged = record(row.averagedInputs, `${what}.averagedInputs`);
  exactKeys(averaged, ['variant', 'red', 'green', 'jitter', 'startAgeCells'], `${what}.averagedInputs`);
  if (averaged.variant !== 'mean') throw Error(`${what}.averagedInputs.variant: unknown`);
  unit(averaged.red, `${what}.averagedInputs.red`); unit(averaged.green, `${what}.averagedInputs.green`);
  finite(averaged.jitter, `${what}.averagedInputs.jitter`); nonNegative(averaged.startAgeCells, `${what}.averagedInputs.startAgeCells`);
}

/** The catalog's sun visibility rule (ScenerySunVisibility): a known curve, limits in 0 to 1, a view with a field of view and a resolution. */
export function parseSunVisibility(value: unknown, what: string): void {
  const row = record(value, what);
  exactKeys(row, ['occlusion', 'view', 'horizon'], what);
  const occlusion = record(row.occlusion, `${what}.occlusion`);
  exactKeys(occlusion, ['bias', 'curve', 'dryMax', 'wetMax'], `${what}.occlusion`);
  if (occlusion.curve !== 'sqrt') throw Error(`${what}.occlusion.curve: unknown`);
  nonNegative(occlusion.bias, `${what}.occlusion.bias`); unit(occlusion.dryMax, `${what}.occlusion.dryMax`); unit(occlusion.wetMax, `${what}.occlusion.wetMax`);
  const view = record(row.view, `${what}.view`);
  exactKeys(view, ['fovRad', 'near', 'far', 'resolution', 'refreshFrames', 'readFrame'], `${what}.view`);
  if (positive(view.fovRad, `${what}.view.fovRad`) >= Math.PI) throw Error(`${what}.view.fovRad: too wide`);
  if (positive(view.near, `${what}.view.near`) >= positive(view.far, `${what}.view.far`)) throw Error(`${what}.view: near beyond far`);
  const resolution = count(view.resolution, `${what}.view.resolution`, 512);
  if (!resolution) throw Error(`${what}.view.resolution: must be positive`);
  count(view.refreshFrames, `${what}.view.refreshFrames`); count(view.readFrame, `${what}.view.readFrame`);
  const horizon = record(row.horizon, `${what}.horizon`);
  exactKeys(horizon, ['limit', 'gain'], `${what}.horizon`);
  finite(horizon.limit, `${what}.horizon.limit`); positive(horizon.gain, `${what}.horizon.gain`);
}
