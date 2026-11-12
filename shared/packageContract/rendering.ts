// Copied from LMUTrackPipeline/shared/contract/rendering.ts, do not edit: change it there and run npm run package -- sync-contract.
/**
 * The rendering file `rendering/index.json` (docs/PACKAGE_FORMAT.md, Rendering): `{camera, sky, shading}`, the game's camera, sky and shading profiles with the
 * cascaded shadow sampling and the cloud field. Cloud maps are not inlined: each entry names the content-named file `rendering/<sha256>.bin` that holds its
 * mips (`renderingCloudMapFiles` lists them). The structural parser for all of it; whether a file exists and hashes to its name is a file-content check.
 */
import {renderingBinPath} from './paths.js';
import {shadowProblems} from './shadows.js';
import type {RenderingProfiles, ScenerySun} from './renderingTypes.js';
import {array, count, exactKeys, finite, flag, nonNegative, orderedKeys, positive, positiveCount, record, sameJson, sha256, text, unit, vec3} from './strict.js';

export const RENDERING_KEYS = ['camera', 'sky', 'shading'] as const;

function numbers(value: unknown, keys: string[], what: string, positive: boolean): void {
  const row = record(value, what);
  exactKeys(row, keys, what);
  for (const key of keys) {
    const n = finite(row[key], `${what}.${key}`);
    if (positive ? n <= 0 : n < 0) throw Error(`${what}.${key}: out of range`);
  }
}

/** A screen window inside the frame, as fractions from the top left. */
function screenWindow(value: unknown, what: string): void {
  const window = record(value, what);
  numbers(window, ['x', 'y', 'width', 'height'], what, false);
  if ((window.x as number) + (window.width as number) > 1 || (window.y as number) + (window.height as number) > 1 || !window.width || !window.height) throw Error(`${what}: outside the frame`);
}

/** Rows ascending by `key` (the sun elevation unless named), each checked by `row`. */
function ascending(rows: unknown[], what: string, row: (value: Record<string, unknown>, what: string) => void, key = 'sunElevationDeg'): void {
  if (!rows.length) throw Error(`${what}: empty`);
  let previous = -Infinity;
  rows.forEach((value, i) => {
    const entry = record(value, `${what}[${i}]`), at = finite(entry[key], `${what}[${i}].${key}`);
    if (at <= previous) throw Error(`${what}: ${key} must ascend`);
    previous = at;
    row(entry, `${what}[${i}]`);
  });
}

const CAMERA_TYPES = ['external', 'onboard', 'tv'] as const;

const LOOK_KEYS = ['targetExposure', 'lightDarkBorder', 'minExposure', 'maxExposure', 'whiteBalanceK', 'toneCurve'];

/** A look's exposure target, border and limits (0 ≤ min ≤ max, max > 0), white balance and tone curve (a > 0); the clear values and the overcast ones share this shape. */
function exposureLook(look: Record<string, unknown>, at: string): void {
  numbers({targetExposure: look.targetExposure, lightDarkBorder: look.lightDarkBorder, maxExposure: look.maxExposure, whiteBalanceK: look.whiteBalanceK},
    ['targetExposure', 'lightDarkBorder', 'maxExposure', 'whiteBalanceK'], at, true);
  const min = finite(look.minExposure, `${at}.minExposure`);
  if (min < 0 || min > (look.maxExposure as number)) throw Error(`${at}.minExposure: must be between 0 and maxExposure`);
  numbers(look.toneCurve, ['a', 'b'], `${at}.toneCurve`, false);
  if ((look.toneCurve as {a: number}).a <= 0) throw Error(`${at}.toneCurve.a: must be positive`);
}

/** One camera type's post-processing: a window inside the frame, a positive adaptation scale and weather blend rate, ascending profiles with clear and overcast looks. */
function parseCameraType(value: unknown, what: string): void {
  const row = record(value, what);
  exactKeys(row, ['meteringWindow', 'adaptationScale', 'weatherBlendRate', 'profiles', 'ambientOcclusion'], what);
  screenWindow(row.meteringWindow, `${what}.meteringWindow`);
  if (finite(row.adaptationScale, `${what}.adaptationScale`) <= 0) throw Error(`${what}.adaptationScale: must be positive`);
  if (finite(row.weatherBlendRate, `${what}.weatherBlendRate`) <= 0) throw Error(`${what}.weatherBlendRate: must be positive`);
  ascending(array(row.profiles, `${what}.profiles`, 32), `${what}.profiles`, (p, at) => {
    exactKeys(p, ['sunTarget', ...LOOK_KEYS, 'weatherLerpPower', 'overcast'], at);
    exposureLook(p, at);
    if (finite(p.weatherLerpPower, `${at}.weatherLerpPower`) <= 0) throw Error(`${at}.weatherLerpPower: must be positive`);
    const overcast = record(p.overcast, `${at}.overcast`);
    exactKeys(overcast, LOOK_KEYS, `${at}.overcast`);
    exposureLook(overcast, `${at}.overcast`);
  }, 'sunTarget');
  numbers(row.ambientOcclusion, ['radiusM', 'samples', 'scale', 'colour'], `${what}.ambientOcclusion`, false);
}

/** The catalog's camera (SceneryCamera): a positive output gamma and every camera type. */
function parseCamera(value: unknown, what: string): void {
  const row = record(value, what);
  exactKeys(row, ['outputGamma', 'sceneLuminanceScale', 'types'], what);
  if (finite(row.outputGamma, `${what}.outputGamma`) <= 0) throw Error(`${what}.outputGamma: must be positive`);
  if (finite(row.sceneLuminanceScale, `${what}.sceneLuminanceScale`) <= 0) throw Error(`${what}.sceneLuminanceScale: must be positive`);
  const types = record(row.types, `${what}.types`);
  exactKeys(types, CAMERA_TYPES, `${what}.types`);
  for (const type of CAMERA_TYPES) parseCameraType(types[type], `${what}.types.${type}`);
}

/** The catalog's shading (SceneryShading): positive scales, ordered limits, known LOD modes and non-empty unit-direction kernels. */
function parseShading(value: unknown, what: string): void {
  const row = record(value, what);
  exactKeys(row, ['sunGlint', 'smallEdge', 'carPaintReflection', 'convolution', 'sceneryReflection', 'integrationMap', 'shadows', 'sunVisibility'], what);
  numbers(row.sunGlint, ['cosineThreshold', 'roughnessCutoff', 'smoothSpecularScale'], `${what}.sunGlint`, true);
  if ((row.sunGlint as Record<string, number>).cosineThreshold > 1) throw Error(`${what}.sunGlint.cosineThreshold: above 1`);
  numbers(row.smallEdge, ['detectorScale', 'edgeScale', 'limitMin', 'limitMax'], `${what}.smallEdge`, true);
  const edge = row.smallEdge as Record<string, number>;
  if (edge.limitMin > edge.limitMax) throw Error(`${what}.smallEdge: limitMin above limitMax`);
  const paint = record(row.carPaintReflection, `${what}.carPaintReflection`);
  exactKeys(paint, ['roughnessCutoff', 'lodScale', 'clearCoatLod', 'baseCoatLod'], `${what}.carPaintReflection`);
  for (const key of ['roughnessCutoff', 'lodScale']) if (finite(paint[key], `${what}.carPaintReflection.${key}`) <= 0) throw Error(`${what}.carPaintReflection.${key}: must be positive`);
  for (const key of ['clearCoatLod', 'baseCoatLod']) if (paint[key] !== 'bias' && paint[key] !== 'explicit') throw Error(`${what}.carPaintReflection.${key}: expected bias or explicit`);
  const convolution = record(row.convolution, `${what}.convolution`);
  exactKeys(convolution, ['kernels'], `${what}.convolution`);
  const kernels = array(convolution.kernels, `${what}.convolution.kernels`, 16);
  if (!kernels.length) throw Error(`${what}.convolution.kernels: empty`);
  kernels.forEach((value, i) => {
    const at = `${what}.convolution.kernels[${i}]`, kernel = record(value, at);
    exactKeys(kernel, ['specularPower', 'sourceLod', 'samples'], at);
    const power = text(kernel.specularPower, `${at}.specularPower`, 16);
    if (power !== 'INF' && !(Number(power) > 0)) throw Error(`${at}.specularPower: expected INF or a positive number`);
    count(kernel.sourceLod, `${at}.sourceLod`, 16);
    const samples = array(kernel.samples, `${at}.samples`, 1024);
    if (!samples.length) throw Error(`${at}.samples: empty`);
    samples.forEach((sample, j) => {
      if (Math.abs(Math.hypot(...vec3(sample, `${at}.samples[${j}]`)) - 1) > 1e-3) throw Error(`${at}.samples[${j}]: not a unit direction`);
    });
  });
  const scenery = record(row.sceneryReflection, `${what}.sceneryReflection`);
  exactKeys(scenery, ['lodScale', 'lod', 'dielectricF0', 'families'], `${what}.sceneryReflection`);
  if (finite(scenery.lodScale, `${what}.sceneryReflection.lodScale`) <= 0) throw Error(`${what}.sceneryReflection.lodScale: must be positive`);
  if (scenery.lod !== 'bias' && scenery.lod !== 'explicit') throw Error(`${what}.sceneryReflection.lod: expected bias or explicit`);
  const f0 = finite(scenery.dielectricF0, `${what}.sceneryReflection.dielectricF0`);
  if (f0 < 0 || f0 > 1) throw Error(`${what}.sceneryReflection.dielectricF0: outside 0–1`);
  const families = array(scenery.families, `${what}.sceneryReflection.families`, 64).map((family, i) => text(family, `${what}.sceneryReflection.families[${i}]`, 64));
  if (!families.length) throw Error(`${what}.sceneryReflection.families: empty`);
  parseIntegrationMap(row.integrationMap, `${what}.integrationMap`);
  parseShadows(row.shadows, `${what}.shadows`);
  parseSunVisibility(row.sunVisibility, `${what}.sunVisibility`);
}

/** The cascaded sun shadow (the pipeline's docs/SCENE_PACKAGE.md "Shadows"). */
function parseShadows(value: unknown, what: string): void {
  const row = record(value, what);
  exactKeys(row, ['atlas', 'select', 'filter', 'normalOffset', 'texelSnap', 'fit', 'fade', 'centre', 'orientation', 'cameras'], what);
  const atlas = record(row.atlas, `${what}.atlas`);
  exactKeys(atlas, ['count', 'sizePx', 'tilePx', 'cascadeTiles'], `${what}.atlas`);
  const atlases = count(atlas.count, `${what}.atlas.count`, 8), size = count(atlas.sizePx, `${what}.atlas.sizePx`, 16384), tile = count(atlas.tilePx, `${what}.atlas.tilePx`, 16384);
  if (!atlases || !tile || tile > size) throw Error(`${what}.atlas: expected atlases with tiles no larger than the atlas`);
  const tiles = array(atlas.cascadeTiles, `${what}.atlas.cascadeTiles`, 16);
  if (!tiles.length) throw Error(`${what}.atlas.cascadeTiles: empty`);
  tiles.forEach((value, i) => {
    const at = `${what}.atlas.cascadeTiles[${i}]`, cell = array(value, at, 3);
    if (cell.length !== 3) throw Error(`${at}: expected [atlas, x, y]`);
    const [index, x, y] = cell.map((n, j) => count(n, `${at}[${j}]`, size));
    if (index >= atlases || x + tile > size || y + tile > size) throw Error(`${at}: not inside the atlas`);
  });
  const select = record(row.select, `${what}.select`);
  exactKeys(select, ['method', 'halfExtent'], `${what}.select`);
  if (select.method !== 'firstContainingTile') throw Error(`${what}.select.method: expected firstContainingTile`);
  if (positive(select.halfExtent, `${what}.select.halfExtent`) > 0.5) throw Error(`${what}.select.halfExtent: above 0.5`);
  const filter = record(row.filter, `${what}.filter`);
  exactKeys(filter, ['hardwarePcf', 'texelSize', 'scale', 'taps'], `${what}.filter`);
  flag(filter.hardwarePcf, `${what}.filter.hardwarePcf`);
  positive(filter.texelSize, `${what}.filter.texelSize`);
  const scale = positive(filter.scale, `${what}.filter.scale`);
  const taps = array(filter.taps, `${what}.filter.taps`, 64);
  if (!taps.length) throw Error(`${what}.filter.taps: empty`);
  const total = taps.reduce<number>((sum, value, i) => {
    const at = `${what}.filter.taps[${i}]`, tap = record(value, at);
    exactKeys(tap, ['offset', 'weight'], at);
    const offset = array(tap.offset, `${at}.offset`, 2);
    if (offset.length !== 2) throw Error(`${at}.offset: expected [x, y]`);
    offset.forEach((n, j) => finite(n, `${at}.offset[${j}]`));
    return sum + positive(tap.weight, `${at}.weight`);
  }, 0);
  if (Math.abs(total * scale - 1) > 1e-9) throw Error(`${what}.filter: weights times scale are ${total * scale}, not 1`);
  const normal = record(row.normalOffset, `${what}.normalOffset`);
  exactKeys(normal, ['scale', 'by'], `${what}.normalOffset`);
  nonNegative(normal.scale, `${what}.normalOffset.scale`);
  if (normal.by !== 'normalShadowInfluence') throw Error(`${what}.normalOffset.by: expected normalShadowInfluence`);
  flag(row.texelSnap, `${what}.texelSnap`);
  const fit = record(row.fit, `${what}.fit`);
  exactKeys(fit, ['shape', 'widthPerSplit'], `${what}.fit`);
  if (fit.shape !== 'square') throw Error(`${what}.fit.shape: expected square`);
  positive(fit.widthPerSplit, `${what}.fit.widthPerSplit`);
  const fade = record(row.fade, `${what}.fade`);
  exactKeys(fade, ['endsAtFar', 'lengthOfLastSpan'], `${what}.fade`);
  flag(fade.endsAtFar, `${what}.fade.endsAtFar`);
  positive(fade.lengthOfLastSpan, `${what}.fade.lengthOfLastSpan`);
  exactRecord(row.centre, {along: 'viewForward', at: 'sliceMidpoint', firstSliceStartsAt: 'nearM'}, `${what}.centre`);
  exactRecord(row.orientation, {followsView: false, u: 'horizontalAcrossSun', v: 'sunVerticalPlane'}, `${what}.orientation`);
  const cameras = record(row.cameras, `${what}.cameras`);
  exactKeys(cameras, ['chase', 'cockpit', 'tv'], `${what}.cameras`);
  for (const name of ['chase', 'cockpit', 'tv']) parseShadowCamera(cameras[name], `${what}.cameras.${name}`, tiles.length);
}

/** A record of exactly these keys and values: a rule the viewer implements, with no other variant. */
function exactRecord(value: unknown, expected: Record<string, string | boolean>, what: string): void {
  const row = record(value, what);
  exactKeys(row, Object.keys(expected), what);
  for (const [key, want] of Object.entries(expected)) if (row[key] !== want) throw Error(`${what}.${key}: expected ${String(want)}`);
}

/** One camera type's split planes: near and far, then either no set (all null) or a ratio, a count and that many ascending splits ending at far. */
function parseShadowCamera(value: unknown, what: string, maxCascades: number): void {
  const row = record(value, what);
  exactKeys(row, ['nearM', 'farM', 'splitRatio', 'count', 'splitsM'], what);
  const near = positive(row.nearM, `${what}.nearM`), far = finite(row.farM, `${what}.farM`);
  if (far <= near) throw Error(`${what}: farM not beyond nearM`);
  if (row.splitsM === null) {
    if (row.splitRatio !== null || row.count !== null) throw Error(`${what}: splitsM is null but splitRatio or count is not`);
    return;
  }
  const ratio = finite(row.splitRatio, `${what}.splitRatio`);
  if (ratio < 0 || ratio > 1) throw Error(`${what}.splitRatio: outside 0–1`);
  const cascades = count(row.count, `${what}.count`, maxCascades);
  const splits = ascendingNumbers(row.splitsM, `${what}.splitsM`, maxCascades, near, far);
  if (!cascades || splits.length !== cascades) throw Error(`${what}.splitsM: expected count splits`);
  if (splits[cascades - 1] !== far) throw Error(`${what}.splitsM: the last split is not farM`);
}

/** The split-sum table: `width` × `height` 8-bit (scale, bias) pairs, row-major, N·V along a row, roughness down the rows. */
function parseIntegrationMap(value: unknown, what: string): void {
  const map = record(value, what);
  exactKeys(map, ['width', 'height', 'encoding', 'scale', 'bias'], what);
  const width = count(map.width, `${what}.width`, 1024), height = count(map.height, `${what}.height`, 1024);
  if (!width || !height) throw Error(`${what}: empty`);
  if (map.encoding !== 'unorm8') throw Error(`${what}.encoding: expected unorm8`);
  for (const key of ['scale', 'bias']) {
    const values = array(map[key], `${what}.${key}`, width * height);
    if (values.length !== width * height) throw Error(`${what}.${key}: expected width × height values`);
    values.forEach((n, i) => { if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 255) throw Error(`${what}.${key}[${i}]: expected an integer 0–255`); });
  }
}

/** A group of exactly `keys`, all finite and at least zero, with `min` ≤ `max` where both are present. */
function range(value: unknown, keys: string[], what: string): Record<string, number> {
  numbers(value, keys, what, false);
  const group = value as Record<string, number>;
  for (const key of keys) if (group[key] < 0) throw Error(`${what}.${key}: must not be negative`);
  if ('min' in group && group.min > group.max) throw Error(`${what}: min above max`);
  return group;
}

/** Finite numbers ascending within [min, max], at most `limit` of them. */
function ascendingNumbers(value: unknown, what: string, limit: number, min: number, max: number): number[] {
  const values = array(value, what, limit).map((n, i) => finite(n, `${what}[${i}]`));
  if (!values.length) throw Error(`${what}: empty`);
  values.forEach((n, i) => {
    if (n < min || n > max) throw Error(`${what}[${i}]: out of range`);
    if (i && n <= values[i - 1]) throw Error(`${what}: values must ascend`);
  });
  return values;
}

/** The catalog's sun grids: `unit`, the sample axes and one grid per layout of positive RGB triples, coverage rows by elevation columns. */
function parseSun(value: unknown, what: string): Record<string, ScenerySun['layouts'][string]> {
  const row = record(value, what);
  exactKeys(row, ['unit', 'sunElevationDeg', 'cloudCoverage', 'layouts'], what);
  text(row.unit, `${what}.unit`);
  const sunElevationDeg = ascendingNumbers(row.sunElevationDeg, `${what}.sunElevationDeg`, 64, -90, 90);
  const cloudCoverage = ascendingNumbers(row.cloudCoverage, `${what}.cloudCoverage`, 16, 0, 1);
  const layouts = record(row.layouts, `${what}.layouts`), sunLayouts: Record<string, ScenerySun['layouts'][string]> = {};
  for (const [key, grid] of Object.entries(layouts)) {
    const at = `${what}.layouts.${key}`, rows = array(grid, at, cloudCoverage.length);
    if (rows.length !== cloudCoverage.length) throw Error(`${at}: expected one row per coverage`);
    sunLayouts[key] = rows.map((value, i) => {
      const columns = array(value, `${at}[${i}]`, sunElevationDeg.length);
      if (columns.length !== sunElevationDeg.length) throw Error(`${at}[${i}]: expected one sample per elevation`);
      return columns.map((sample, j) => {
        const rgb = array(sample, `${at}[${i}][${j}]`, 3);
        if (rgb.length !== 3) throw Error(`${at}[${i}][${j}]: expected an RGB triple`);
        return rgb.map((n, k) => {
          if (finite(n, `${at}[${i}][${j}][${k}]`) <= 0) throw Error(`${at}[${i}][${j}][${k}]: must be positive`);
          return n as number;
        }) as [number, number, number];
      });
    });
  }
  return sunLayouts;
}

/** The catalog's sky (ScenerySky): five Perez scales, ascending multiplier rows of four, the turbidity, air mass, haze model, sun grids, the sky model's inputs and its colour profiles. */
/** Validates the sky; returns the layout keys of its per-layout parts (`sun.layouts`, `hosek.layoutAltitudeM`). */
function parseSky(value: unknown, what: string): {sunLayouts: string[]; altitudeLayouts: string[]} {
  const row = record(value, what);
  exactKeys(row, ['perezScale', 'perezMultipliers', 'pollution', 'turbidity', 'airMass', 'fog', 'sun', 'hosek', 'haze', 'colourProfiles', 'clouds'], what);
  const sunLayouts = parseSun(row.sun, `${what}.sun`);
  range(row.pollution, ['cloudyDamping'], `${what}.pollution`);
  if (range(row.turbidity, ['base', 'overcast', 'storm', 'pollution', 'min', 'max'], `${what}.turbidity`).min <= 0) throw Error(`${what}.turbidity.min: must be positive`);
  range(row.airMass, ['clear', 'pollution'], `${what}.airMass`);
  const fog = record(row.fog, `${what}.fog`);
  exactKeys(fog, ['density', 'colour', 'sunInfluence', 'height'], `${what}.fog`);
  range(fog.density, ['base', 'overcast', 'storm', 'sunrise', 'pollution', 'min', 'max'], `${what}.fog.density`);
  nonNegative(fog.sunInfluence, `${what}.fog.sunInfluence`);
  range(fog.height, ['max', 'scalar', 'exponent', 'scalarMin', 'scalarMax', 'exponentMin'], `${what}.fog.height`);
  const fogHeight = fog.height as Record<string, number>;
  if (fogHeight.scalarMin > fogHeight.scalarMax) throw Error(`${what}.fog.height: scalarMin above scalarMax`);
  const colour = record(fog.colour, `${what}.fog.colour`);
  exactKeys(colour, ['horizonSampleElevationDeg', 'horizonSampleCount', 'horizonFovDeg', 'pollutionOffset', 'override', 'luminance', 'sunElevationRampDeg', 'sunElevationRampOffset'], `${what}.fog.colour`);
  const count = finite(colour.horizonSampleCount, `${what}.fog.colour.horizonSampleCount`);
  if (!Number.isInteger(count) || count < 1 || count > 64) throw Error(`${what}.fog.colour.horizonSampleCount: expected 1 to 64 samples`);
  if (Math.abs(finite(colour.horizonSampleElevationDeg, `${what}.fog.colour.horizonSampleElevationDeg`)) >= 90) throw Error(`${what}.fog.colour.horizonSampleElevationDeg: out of range`);
  const fov = finite(colour.horizonFovDeg, `${what}.fog.colour.horizonFovDeg`);
  if (fov < 0 || fov > 360) throw Error(`${what}.fog.colour.horizonFovDeg: out of range`);
  const offset = array(colour.pollutionOffset, `${what}.fog.colour.pollutionOffset`, 3);
  if (offset.length !== 3) throw Error(`${what}.fog.colour.pollutionOffset: expected three numbers`);
  offset.forEach((n, i) => finite(n, `${what}.fog.colour.pollutionOffset[${i}]`));
  range(colour.override, ['base', 'overcast', 'storm'], `${what}.fog.colour.override`);
  range(colour.luminance, ['base', 'sunrise', 'overcast', 'storm'], `${what}.fog.colour.luminance`);
  if (finite(colour.sunElevationRampDeg, `${what}.fog.colour.sunElevationRampDeg`) <= 0) throw Error(`${what}.fog.colour.sunElevationRampDeg: must be positive`);
  finite(colour.sunElevationRampOffset, `${what}.fog.colour.sunElevationRampOffset`);
  const scale = array(row.perezScale, `${what}.perezScale`, 5);
  if (scale.length !== 5) throw Error(`${what}.perezScale: expected five numbers`);
  scale.forEach((n, i) => finite(n, `${what}.perezScale[${i}]`));
  ascending(array(row.perezMultipliers, `${what}.perezMultipliers`, 181), `${what}.perezMultipliers`, (m, at) => {
    exactKeys(m, ['sunElevationDeg', 'abcd'], at);
    const abcd = array(m.abcd, `${at}.abcd`, 4);
    if (abcd.length !== 4) throw Error(`${at}.abcd: expected four numbers`);
    abcd.forEach((n, i) => finite(n, `${at}.abcd[${i}]`));
  });
  const hosek = record(row.hosek, `${what}.hosek`);
  exactKeys(hosek, ['albedo', 'scaleHeightM', 'box', 'layoutAltitudeM', 'xyzToRgb', 'coefficients', 'radiances'], `${what}.hosek`);
  const box = record(hosek.box, `${what}.hosek.box`);
  exactKeys(box, ['size', 'yOffset'], `${what}.hosek.box`);
  // The eye stays inside the moved cube.
  const boxSize = finite(box.size, `${what}.hosek.box.size`);
  if (!(boxSize > 0) || Math.abs(finite(box.yOffset, `${what}.hosek.box.yOffset`)) >= boxSize / 2) throw Error(`${what}.hosek.box: the offset does not fit the size`);
  const albedo = finite(hosek.albedo, `${what}.hosek.albedo`);
  if (albedo < 0 || albedo > 1) throw Error(`${what}.hosek.albedo: expected 0 to 1`);
  if (finite(hosek.scaleHeightM, `${what}.hosek.scaleHeightM`) <= 0) throw Error(`${what}.hosek.scaleHeightM: must be positive`);
  const matrix = array(hosek.xyzToRgb, `${what}.hosek.xyzToRgb`, 3);
  if (matrix.length !== 3) throw Error(`${what}.hosek.xyzToRgb: expected three rows`);
  matrix.forEach((matrixRow, i) => vec3(matrixRow, `${what}.hosek.xyzToRgb[${i}]`));
  for (const [key, length] of [['coefficients', 1080], ['radiances', 120]] as const) {
    const channels = array(hosek[key], `${what}.hosek.${key}`, 3);
    if (channels.length !== 3) throw Error(`${what}.hosek.${key}: expected X, Y and Z`);
    channels.forEach((channel, i) => {
      const values = array(channel, `${what}.hosek.${key}[${i}]`, length);
      if (values.length !== length) throw Error(`${what}.hosek.${key}[${i}]: expected ${length} values`);
      values.forEach((n, j) => finite(n, `${what}.hosek.${key}[${i}][${j}]`));
    });
  }
  const altitudes = record(hosek.layoutAltitudeM, `${what}.hosek.layoutAltitudeM`), layoutAltitudeM: Record<string, number> = {};
  for (const [key, value] of Object.entries(altitudes)) layoutAltitudeM[key] = finite(value, `${what}.hosek.layoutAltitudeM.${key}`);
  const haze = record(row.haze, `${what}.haze`);
  exactKeys(haze, ['depth', 'intensity', 'luminance'], `${what}.haze`);
  range(haze.depth, ['base', 'overcast', 'pollution'], `${what}.haze.depth`);
  range(haze.intensity, ['base', 'dawn', 'overcast'], `${what}.haze.intensity`);
  range(haze.luminance, ['sunrise', 'base', 'pollution', 'overcast', 'storm'], `${what}.haze.luminance`);
  const colourProfiles = record(row.colourProfiles, `${what}.colourProfiles`);
  exactKeys(colourProfiles, ['weatherBlendRate', 'profiles'], `${what}.colourProfiles`);
  if (finite(colourProfiles.weatherBlendRate, `${what}.colourProfiles.weatherBlendRate`) <= 0) throw Error(`${what}.colourProfiles.weatherBlendRate: must be positive`);
  ascending(array(colourProfiles.profiles, `${what}.colourProfiles.profiles`, 32), `${what}.colourProfiles.profiles`, (profile, at) => {
    exactKeys(profile, ['sunTarget', 'weatherLerpPower', 'clear', 'overcast'], at);
    if (finite(profile.weatherLerpPower, `${at}.weatherLerpPower`) <= 0) throw Error(`${at}.weatherLerpPower: must be positive`);
    for (const key of ['clear', 'overcast']) {
      const look = record(profile[key], `${at}.${key}`);
      exactKeys(look, ['gain', 'sunProximity'], `${at}.${key}`);
      vec3(look.gain, `${at}.${key}.gain`).forEach((n, i) => nonNegative(n, `${at}.${key}.gain[${i}]`));
      nonNegative(look.sunProximity, `${at}.${key}.sunProximity`);
    }
  }, 'sunTarget');
  parseClouds(row.clouds, `${what}.clouds`);
  return {sunLayouts: Object.keys(sunLayouts), altitudeLayouts: Object.keys(layoutAltitudeM)};
}


const LAYER = ['cells', 'instances', 'spacingM', 'heightM', 'jitter', 'drift'];
const PLACEMENT = ['gridScale', 'endMargin', 'fadeGain', 'pushRadius', 'push', 'edgePitchRad', 'edgeDrop', 'riseDrop', 'centreLineYawRad', 'centreLinePitchRad', 'centreLineRollRad'];

/** A cloud material's lighting block (SceneryCloudLight): every group present, colours and UV pairs of the right length. */
/** Byte length of each mip of a width x height map with `channels` interleaved 8-bit channels, from the base size down to 1 px. */
export function expectedMipByteLengths(width: number, height: number, channels = 1): number[] {
  const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
  return Array.from({length: levels}, (_, level) => Math.max(1, width >> level) * Math.max(1, height >> level) * channels);
}

/** A cloud map entry: size, the content-named file that holds its mips and their byte lengths, which are the full pyramid of the size and add up to the file size. */
function parseCloudMap(value: unknown, at: string, light: boolean): void {
  const map = record(value, at);
  orderedKeys(map, light ? ['width', 'height', 'channels', 'sha256', 'byteLength', 'mipByteLengths'] : ['width', 'height', 'sha256', 'byteLength', 'mipByteLengths'], at);
  const width = positiveCount(map.width, `${at}.width`, 4096), height = positiveCount(map.height, `${at}.height`, 4096);
  if (light && map.channels !== 1 && map.channels !== 3) throw Error(`${at}.channels: expected 1 or 3`);
  sha256(map.sha256, `${at}.sha256`);
  const lengths = array(map.mipByteLengths, `${at}.mipByteLengths`, 16).map((n, i) => count(n, `${at}.mipByteLengths[${i}]`));
  const expected = expectedMipByteLengths(width, height, light ? map.channels as number : 1);
  if (!sameJson(lengths, expected)) throw Error(`${at}.mipByteLengths: ${JSON.stringify(lengths)} are not the pyramid ${expected.join('/')} of ${width}x${height}x${light ? map.channels : 1}`);
  if (count(map.byteLength, `${at}.byteLength`) !== expected.reduce((sum, bytes) => sum + bytes, 0)) throw Error(`${at}.byteLength: ${map.byteLength} is not the sum of mipByteLengths`);
}

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
  for (const [key, value] of Object.entries(lightMaps)) parseCloudMap(value, `${what}.lightMaps.${key}`, true);
  for (const [key, value] of Object.entries(maps)) parseCloudMap(value, `${what}.maps.${key}`, false);
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


/** Every cloud map of the sky as `[set, name, entry]`. */
function cloudMapEntries(sky: Record<string, any>): Array<['maps' | 'lightMaps', string, Record<string, any>]> {
  return (['maps', 'lightMaps'] as const).flatMap(set => Object.entries<Record<string, any>>(sky?.clouds?.[set] ?? {}).map(([name, entry]): ['maps' | 'lightMaps', string, Record<string, any>] => [set, name, entry]));
}

/** The files a parsed rendering file references, one row per distinct file: its package path, hash and size. */
export function renderingCloudMapFiles(rendering: {sky: unknown}): Array<{path: string; sha256: string; byteLength: number}> {
  const rows = new Map<string, {path: string; sha256: string; byteLength: number}>();
  for (const [set, name, entry] of cloudMapEntries(rendering.sky as Record<string, any>)) {
    sha256(entry.sha256, `sky.clouds.${set}.${name}.sha256`);
    rows.set(entry.sha256, {path: renderingBinPath(entry.sha256), sha256: entry.sha256, byteLength: entry.byteLength});
  }
  return [...rows.values()];
}

/** The sun grid and the sky altitude are per layout: exactly `layoutKeys` (the package's layouts). Empty when they match. */
export function renderingLayoutKeyProblems(rendering: {sky?: any}, layoutKeys: readonly string[]): string[] {
  const wanted = [...layoutKeys].sort(), problems: string[] = [];
  for (const [what, map] of [['sun layouts', rendering.sky?.sun?.layouts], ['Hosek altitude layouts', rendering.sky?.hosek?.layoutAltitudeM]] as const)
    if (!map || !sameJson(Object.keys(map).sort(), wanted)) problems.push(`Sky profile ${what} differ from the package layouts; rebuild with npm run build -- camera`);
  return problems;
}

/**
 * `rendering/index.json`: exactly `{camera, sky, shading}` in that order and every profile structurally valid, including the cascaded shadows and the cloud
 * field with its map file references. `layoutKeys` (the package's layouts) must be exactly the keys of the sky's per-layout parts (`sun.layouts`,
 * `hosek.layoutAltitudeM`); without it the two must still name the same layouts.
 */
export function parseRenderingIndex(value: unknown, {layoutKeys}: {layoutKeys?: readonly string[]} = {}): RenderingProfiles {
  const rendering = record(value, 'rendering');
  orderedKeys(rendering, RENDERING_KEYS, 'rendering');
  parseCamera(rendering.camera, 'rendering.camera');
  const layouts = parseSky(rendering.sky, 'rendering.sky');
  parseShading(rendering.shading, 'rendering.shading');
  const problems = shadowProblems((rendering.shading as Record<string, unknown>).shadows);
  if (problems.length) throw Error(`rendering.shading.shadows: ${problems.slice(0, 5).join('; ')}`);
  const rendering2 = rendering as {sky: Record<string, any>};
  // The per-layout parts name exactly the package's layouts (without a list: the same layouts as each other).
  const wanted = layoutKeys ?? layouts.sunLayouts;
  const layoutProblems = renderingLayoutKeyProblems(rendering2, wanted);
  if (layoutProblems.length) throw Error(`rendering.sky: ${layoutProblems.join('; ')}`);
  return value as RenderingProfiles;
}
