// Copied from LMUTrackPipeline/shared/contract/bodyDescriptor.ts, do not edit: change it there and run npm run package -- sync-contract.
/**
 * The body descriptor `vehicles/bodies/<folder>.json` (docs/PACKAGE_FORMAT.md, Vehicles): option nodes, lamps, glow materials, appearances, materials and
 * cameras. The structural rules that need no GLB; whether the nodes it names exist in the GLB, the wheel rig and the lamp state rules are file-content checks
 * (`pipeline/package/validateAssets.ts`).
 *
 * Left loosely typed (neither the pipeline nor the app validates their insides structurally): an appearance's `paint.maps`/`paint.parameters`, a material's
 * `surface` beyond `kind` and `maps`, and the camera fields other than the ones listed in `CarCamera`.
 */
import type {Vec3} from './strict.js';
import {array, count, exactKeys, finite, knownKeys, orderedKeys, record, sortedUnique, text, vec3} from './strict.js';
import {descriptorTexturePath, descriptorVolumePath, DESCRIPTOR_TEXTURE_PATH, DESCRIPTOR_VOLUME_PATH} from './paths.js';

export type CarCorner = 'fl' | 'fr' | 'rl' | 'rr';

/** One map of a native material recipe (only the fields the viewer reads). */
export interface CarMapRef {
  /** `textures/<sha256>.ktx2.zst`, relative to the vehicles folder; absent for a constant map. */
  texture?: string;
  uv: 'uv0' | 'uv1' | 'uv2' | 'uv3';
  scale: [number, number];
  srgb?: boolean;
  constant?: number[];
  /**
   * The game fills this texture at run time (its material stage is a render target: dashboards, external monitors); `texture` is only the
   * file's starting content. Absent otherwise. Data only: what to draw instead is the viewer's choice.
   */
  renderTarget?: true;
  [key: string]: unknown;
}

/** A material's `surface`, or an appearance's `paint`. Only `kind` and `maps` are checked; the rest is the viewer's contract with the exporter. */
export interface CarSurface {
  version: number;
  kind: string;
  name?: string;
  flags?: Record<string, string | undefined>;
  maps: Record<string, CarMapRef>;
  parameters?: Record<string, unknown>;
  normalYSign?: number;
  normalShadowInfluence?: number;
  renderState?: {alphaBlend?: boolean; alphaMask?: boolean};
  finish?: {roughness: number; metalness: number};
  [key: string]: unknown;
}

/**
 * Cockpit reflection occlusion of a material (docs/VEHICLE_PIPELINE.md, Cockpit reflection occlusion): the volume it marches and where the volume sits in the
 * object space of the mesh node that draws the material (the GLB POSITION values as stored, before the node's own transform).
 */
export interface CarReflectionOcclusion {
  /** `volumes/<sha256>.bin`, relative to the vehicles folder: one of the body's `volumes`. */
  volume: string;
  /** Edge lengths in metres of the box the volume fills, along object x, y and z (texture u, v, w). */
  size: Vec3;
  /** The box centre in object space, metres. */
  offset: Vec3;
}

export interface CarMaterialRecipe {
  /** Equals the GLB material's `extras.nativeMaterialId`. */
  id: string;
  name: string;
  /** True when the appearance's VEH paint override replaces this material's shader. */
  paint: boolean;
  /** Absent for paint materials: the appearance supplies the shader. */
  surface?: CarSurface;
  /** Present only on materials whose reflections the cockpit volume occludes. */
  reflectionOcclusion?: CarReflectionOcclusion;
  [key: string]: unknown;
}

export interface CarAppearance {
  /** One of the body's vehicle ids. */
  alias: string;
  number: unknown;
  /** Albedo of the paint material, `textures/<sha256>.ktx2.zst` relative to the vehicles folder. */
  albedo: string;
  paint: CarSurface;
  /** Livery files replacing the albedo of the same-named material. */
  materialTextures?: Record<string, string>;
  /** The body's option part nodes this entry shows; the others stay hidden. */
  optionNodes: string[];
}

/** A camera of the car, named by role, in the native car frame of the GLB (+x left, +y up, -z forward). */
export interface CarCamera {
  name: 'cockpit' | 'hood' | 'roof';
  position: Vec3;
  /** Pitch, yaw, roll offsets in radians. */
  orientation: Vec3;
  /** Horizontal and vertical field of view in degrees (the vertical one is used). */
  fov: [number, number];
  clipPlanes: [number, number];
  /** Which cockpit mesh variant this camera shows. */
  cockpitView: 'in' | 'out';
  /** The game scales every LOD distance by this in this view. */
  lodMultiplier: number;
  /**
   * The shadow keys the camera sets over the rendering profile's set (`shading.shadows.cameras`): each non-null value replaces that set's, a null
   * keeps it; null where the camera sets none. `depthBias` (per cascade, the first values are the cascades') and `slopeBias` are both set or both null.
   */
  shadow: {nearM: number | null; farM: number | null; splitRatio: number | null; depthBias: number[] | null; slopeBias: number | null} | null;
  [key: string]: unknown;
}

export const CAR_LAMP_ROLES = ['headlight', 'brake', 'tail', 'rain', 'pit', 'reverse', 'warning', 'idLight', 'ledStrip', 'interior', 'discGlow', 'position', 'unclassified'] as const;
export type CarLampRole = typeof CAR_LAMP_ROLES[number];

/** One lamp material: renders unlit `rgb = tex.rgb * scale * tex.a * (1 + gain * (N.V)^power)`; `states` are indexes into `frames`. */
export interface CarLamp {
  role: CarLampRole;
  /** GLB node names whose meshes draw this lamp. */
  nodes: string[];
  /** The GLB material name. */
  material: string;
  /** Texture paths relative to `vehicles/`, one per frame; null where the package has no texture (nothing to draw). */
  frames: Array<string | null>;
  animation: {method: string | null; rate: number | null; sequence: number[] | null};
  /** Null for a lamp the game draws with a lit shader rather than a lamp shader. */
  emission: {scale: number; vertexColour: boolean; viewBoost: {gain: number; power: number} | null; ambientScaled: boolean; vertexAlpha: boolean} | null;
  blend: 'alpha' | 'opaque';
  states: {off: number | null; on: number | null; brake: number | null} | null;
  defaultLit: boolean | null;
  hiddenInOwnCockpit: boolean | null;
  brakeGlowRange?: [number, number] | null;
}

export interface BodyDescriptor {
  /** GLB nodes that are alternatives between entries: `option_<mesh stem>`, mesh-only. Sorted, unique. */
  optionNodes: string[];
  lamps: CarLamp[];
  /** Material ids of the glow meshes and brake disc glow slots, sorted, unique, all in `materials`. */
  glowMaterialIds: string[];
  /** One per vehicle id of the body. */
  appearances: CarAppearance[];
  materials: CarMaterialRecipe[];
  /** `chase`: the orbiting chase camera's LOD multiplier. */
  cameras: {frame: string; cockpitViewRule: string; list: CarCamera[]; chase: {lodMultiplier: number}};
}

export const BODY_DESCRIPTOR_KEYS = ['optionNodes', 'lamps', 'glowMaterialIds', 'appearances', 'materials', 'cameras'] as const;
const APPEARANCE_KEYS = ['alias', 'number', 'albedo', 'paint', 'optionNodes'];
/** Option part nodes: unique GLB node names that three.js keeps as they are (no characters it would sanitise). */
const OPTION_NODE = /^option_[A-Za-z0-9_]+$/;
/** Every texture path the descriptor text mentions. */
const ANY_TEXTURE_PATH = /textures\/[0-9A-Za-z_.-]+\.ktx2\.zst/g;
/** Every volume path the descriptor text mentions. */
const ANY_VOLUME_PATH = /volumes\/[0-9A-Za-z_.-]+\.bin/g;

/** What a descriptor is checked against: the catalog row of its body. */
export interface DescriptorBody {folder: string; vehicleIds: readonly string[]; textures: ReadonlyArray<{sha256: string}>; volumes: ReadonlyArray<{sha256: string}>}

/** A material's `reflectionOcclusion`: exact keys, a declared volume, a positive box size and a finite offset. @returns the volume path */
function parseReflectionOcclusion(value: unknown, what: string, volumes: ReadonlySet<string>): string {
  const occlusion = record(value, what);
  orderedKeys(occlusion, ['volume', 'size', 'offset'], what);
  const volume = text(occlusion.volume, `${what}.volume`, 128);
  if (!DESCRIPTOR_VOLUME_PATH.test(volume)) throw Error(`${what}.volume: expected volumes/<sha256>.bin`);
  if (!volumes.has(volume)) throw Error(`${what}.volume: ${volume} is not a volume of the body`);
  if (vec3(occlusion.size, `${what}.size`, 20).some(metres => !(metres > 0))) throw Error(`${what}.size: expected positive edge lengths`);
  vec3(occlusion.offset, `${what}.offset`, 20);
  return volume;
}

function nullableFlag(value: unknown, what: string): void {
  if (value !== null && typeof value !== 'boolean') throw Error(`${what}: expected true, false or null`);
}

function parseLamp(value: unknown, what: string, declared: ReadonlySet<string>): void {
  const lamp = record(value, what);
  orderedKeys(lamp, ['role', 'nodes', 'material', 'frames', 'animation', 'emission', 'blend', 'states', 'defaultLit', 'hiddenInOwnCockpit', ...('brakeGlowRange' in lamp ? ['brakeGlowRange'] : [])], what);
  if (!(CAR_LAMP_ROLES as readonly unknown[]).includes(text(lamp.role, `${what}.role`, 32))) throw Error(`${what}.role: unknown lamp role`);
  if (!array(lamp.nodes, `${what}.nodes`, 64).map((node, i) => text(node, `${what}.nodes[${i}]`, 200)).length) throw Error(`${what}.nodes: empty`);
  text(lamp.material, `${what}.material`, 200);
  const frames = array(lamp.frames, `${what}.frames`, 256);
  // A null frame: the package has no texture for it, so there is nothing to draw.
  if (!frames.length || frames.some(path => path !== null && (typeof path !== 'string' || !DESCRIPTOR_TEXTURE_PATH.test(path)))) throw Error(`${what}.frames: expected texture paths or null`);
  for (const path of frames) if (path !== null && !declared.has(path as string)) throw Error(`${what}.frames: ${path} is not a texture of the body`);
  const frame = (index: unknown, at: string) => { if (index !== null && count(index, at, frames.length - 1) >= frames.length) throw Error(`${at}: no such frame`); };
  const animation = record(lamp.animation, `${what}.animation`);
  exactKeys(animation, ['method', 'rate', 'sequence'], `${what}.animation`);
  if (animation.method === null) {
    if (animation.rate !== null || animation.sequence !== null) throw Error(`${what}.animation: method is null but rate or sequence is not`);
  } else {
    text(animation.method, `${what}.animation.method`, 32);
    finite(animation.rate, `${what}.animation.rate`);
    array(animation.sequence, `${what}.animation.sequence`, 1024).forEach((index, j) => frame(index, `${what}.animation.sequence[${j}]`));
  }
  // A lamp drawn with a lit shader rather than a lamp shader (a disc glow, a headlight or brake lamp made of a lit material) has no emission.
  if (lamp.emission !== null) {
    const emission = record(lamp.emission, `${what}.emission`);
    exactKeys(emission, ['scale', 'vertexColour', 'viewBoost', 'ambientScaled', 'vertexAlpha'], `${what}.emission`);
    if (finite(emission.scale, `${what}.emission.scale`) < 0) throw Error(`${what}.emission.scale: negative`);
    for (const key of ['vertexColour', 'ambientScaled', 'vertexAlpha']) if (typeof emission[key] !== 'boolean') throw Error(`${what}.emission.${key}: expected true or false`);
    if (emission.viewBoost !== null) {
      const boost = record(emission.viewBoost, `${what}.emission.viewBoost`);
      exactKeys(boost, ['gain', 'power'], `${what}.emission.viewBoost`);
      finite(boost.gain, `${what}.emission.viewBoost.gain`);
      if (finite(boost.power, `${what}.emission.viewBoost.power`) <= 0) throw Error(`${what}.emission.viewBoost.power: must be positive`);
    }
  }
  if (lamp.blend !== 'alpha' && lamp.blend !== 'opaque') throw Error(`${what}.blend: expected alpha or opaque`);
  if (lamp.states !== null) {
    const states = record(lamp.states, `${what}.states`);
    exactKeys(states, ['off', 'on', 'brake'], `${what}.states`);
    for (const key of ['off', 'on', 'brake']) frame(states[key], `${what}.states.${key}`);
  }
  nullableFlag(lamp.defaultLit, `${what}.defaultLit`);
  nullableFlag(lamp.hiddenInOwnCockpit, `${what}.hiddenInOwnCockpit`);
  if ('brakeGlowRange' in lamp && lamp.brakeGlowRange !== null) {
    if (lamp.role !== 'discGlow') throw Error(`${what}.brakeGlowRange: only a disc glow has one`);
    const range = array(lamp.brakeGlowRange, `${what}.brakeGlowRange`, 2).map((n, j) => finite(n, `${what}.brakeGlowRange[${j}]`));
    if (range.length !== 2 || range[0] > range[1]) throw Error(`${what}.brakeGlowRange: expected [low, high]`);
  }
}

/** A descriptor's `optionNodes` (or an appearance's): `option_` names, sorted, unique. */
function optionNodes(value: unknown, at: string): string[] {
  const names = array(value, at, 4096).map((name, i) => text(name, `${at}[${i}]`, 200));
  if (names.some((name, i) => !OPTION_NODE.test(name) || (i > 0 && names[i - 1] >= name))) throw Error(`${at}: expected sorted, unique option_ node names`);
  return names;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort(), right = [...b].sort();
  return left.every((value, i) => value === right[i]);
}

/**
 * The descriptor of the body `row` (its catalog row): exact keys in order, option nodes, appearances covering exactly the body's vehicle ids and carrying no
 * build selector, the lamps, glow materials, materials and the three cameras, and every texture the descriptor names is one the row declares.
 */
export function parseBodyDescriptor(value: unknown, row: DescriptorBody): BodyDescriptor {
  const what = `${row.folder} descriptor`, descriptor = record(value, what);
  orderedKeys(descriptor, BODY_DESCRIPTOR_KEYS, what);
  const declared = new Set<string>(row.textures.map(texture => descriptorTexturePath(texture.sha256)));
  const declaredVolumes = new Set<string>(row.volumes.map(volume => descriptorVolumePath(volume.sha256))), usedVolumes = new Set<string>();
  const options = new Set(optionNodes(descriptor.optionNodes, `${what}.optionNodes`));
  const aliases = array(descriptor.appearances, `${what}.appearances`, 5000).map((item, i) => {
    const at = `${what}.appearances[${i}]`, appearance = record(item, at);
    knownKeys(appearance, APPEARANCE_KEYS, ['materialTextures'], at);
    const alias = text(appearance.alias, `${at}.alias`, 160);
    if (typeof appearance.albedo !== 'string' || !DESCRIPTOR_TEXTURE_PATH.test(appearance.albedo)) throw Error(`${at}.albedo: invalid albedo`);
    const paint = record(appearance.paint, `${at}.paint`);
    text(paint.kind, `${at}.paint.kind`);
    record(paint.maps, `${at}.paint.maps`);
    if (optionNodes(appearance.optionNodes, `${at}.optionNodes`).some(name => !options.has(name))) throw Error(`${at}.optionNodes: names a node the body does not list`);
    if (appearance.materialTextures !== undefined) {
      for (const path of Object.values(record(appearance.materialTextures, `${at}.materialTextures`))) {
        if (typeof path !== 'string' || !DESCRIPTOR_TEXTURE_PATH.test(path)) throw Error(`${at}.materialTextures: invalid livery texture`);
      }
    }
    return alias;
  });
  if (!sameList(aliases, row.vehicleIds)) throw Error(`${what}: the appearance aliases differ from the body's vehicleIds`);
  array(descriptor.lamps, `${what}.lamps`, 4096).forEach((lamp, i) => parseLamp(lamp, `${what}.lamps[${i}]`, declared));
  const glow = array(descriptor.glowMaterialIds, `${what}.glowMaterialIds`, 4096).map((id, i) => text(id, `${what}.glowMaterialIds[${i}]`, 200));
  sortedUnique(glow, `${what}.glowMaterialIds`);
  const materialIds = new Set<string>();
  array(descriptor.materials, `${what}.materials`, 4096).forEach((item, i) => {
    const at = `${what}.materials[${i}]`, material = record(item, at);
    materialIds.add(text(material.id, `${at}.id`, 200));
    text(material.name, `${at}.name`, 200);
    if (typeof material.paint !== 'boolean') throw Error(`${at}.paint: expected a boolean`);
    if (material.reflectionOcclusion !== undefined) {
      if (material.paint) throw Error(`${at}.reflectionOcclusion: a paint material has none`);
      usedVolumes.add(parseReflectionOcclusion(material.reflectionOcclusion, `${at}.reflectionOcclusion`, declaredVolumes));
    }
    if (!material.paint) {
      const surface = record(material.surface, `${at}.surface`);
      text(surface.kind, `${at}.surface.kind`);
      record(surface.maps, `${at}.surface.maps`);
    }
  });
  if (materialIds.size !== (descriptor.materials as unknown[]).length) throw Error(`${what}.materials: duplicate material ids`);
  for (const id of glow) if (!materialIds.has(id)) throw Error(`${what}.glowMaterialIds: glow material ${id} is not in materials`);
  const cameraSet = record(descriptor.cameras, `${what}.cameras`);
  orderedKeys(cameraSet, ['frame', 'cockpitViewRule', 'list', 'chase'], `${what}.cameras`);
  const chase = record(cameraSet.chase, `${what}.cameras.chase`);
  orderedKeys(chase, ['lodMultiplier'], `${what}.cameras.chase`);
  if (!(finite(chase.lodMultiplier, `${what}.cameras.chase.lodMultiplier`) > 0)) throw Error(`${what}.cameras.chase.lodMultiplier: must be positive`);
  text(cameraSet.frame, `${what}.cameras.frame`, 400);
  text(cameraSet.cockpitViewRule, `${what}.cameras.cockpitViewRule`, 400);
  const names = array(cameraSet.list, `${what}.cameras.list`, 64).map((item, i) => {
    const at = `${what}.cameras.list[${i}]`, camera = record(item, at);
    vec3(camera.position, `${at}.position`, 10);
    vec3(camera.orientation, `${at}.orientation`, 10);
    const fov = array(camera.fov, `${at}.fov`, 2).map(degrees => finite(degrees, `${at}.fov`));
    const clip = array(camera.clipPlanes, `${at}.clipPlanes`, 2).map(metres => finite(metres, `${at}.clipPlanes`));
    if (fov.length !== 2 || fov.some(degrees => degrees <= 5 || degrees >= 175)) throw Error(`${at}.fov: expected two angles in degrees`);
    if (clip.length !== 2 || !(clip[0] > 0 && clip[1] > clip[0])) throw Error(`${at}.clipPlanes: expected near < far`);
    if (camera.cockpitView !== 'in' && camera.cockpitView !== 'out') throw Error(`${at}.cockpitView: expected in or out`);
    if (!(finite(camera.lodMultiplier, `${at}.lodMultiplier`) > 0)) throw Error(`${at}.lodMultiplier: must be positive`);
    if (camera.shadow !== null) {
      const shadow = record(camera.shadow, `${at}.shadow`);
      orderedKeys(shadow, ['nearM', 'farM', 'splitRatio', 'depthBias', 'slopeBias'], `${at}.shadow`);
      const optional = (value: unknown, what: string) => value === null ? null : finite(value, `${at}.shadow.${what}`);
      const near = optional(shadow.nearM, 'nearM'), far = optional(shadow.farM, 'farM'), ratio = optional(shadow.splitRatio, 'splitRatio');
      if ((near !== null && !(near > 0)) || (far !== null && !(far > 0)) || (near !== null && far !== null && !(far > near)))
        throw Error(`${at}.shadow: expected 0 < nearM < farM`);
      if (ratio !== null && !(ratio >= 0 && ratio <= 1)) throw Error(`${at}.shadow.splitRatio: expected 0 to 1`);
      if ((shadow.depthBias === null) !== (shadow.slopeBias === null)) throw Error(`${at}.shadow: depthBias and slopeBias are set together`);
      if (shadow.depthBias !== null) {
        const bias = array(shadow.depthBias, `${at}.shadow.depthBias`, 8).map(value => finite(value, `${at}.shadow.depthBias`));
        if (!bias.length || bias.some(value => value < 0)) throw Error(`${at}.shadow.depthBias: expected 1 to 8 non-negative values`);
        if (finite(shadow.slopeBias, `${at}.shadow.slopeBias`) < 0) throw Error(`${at}.shadow.slopeBias: negative`);
      }
      if (near === null && far === null && ratio === null && shadow.depthBias === null) throw Error(`${at}.shadow: sets no key (expected null)`);
    }
    return text(camera.name, `${at}.name`, 64);
  });
  if (!sameList(names, ['cockpit', 'hood', 'roof'])) throw Error(`${what}.cameras.list: expected exactly the cockpit, hood and roof cameras`);
  const raw = JSON.stringify(descriptor);
  for (const path of raw.match(ANY_TEXTURE_PATH) ?? []) if (!declared.has(path)) throw Error(`${row.folder}: descriptor uses undeclared texture vehicles/${path}`);
  for (const path of raw.match(ANY_VOLUME_PATH) ?? []) if (!declaredVolumes.has(path)) throw Error(`${row.folder}: descriptor uses undeclared volume vehicles/${path}`);
  for (const path of declaredVolumes) if (!usedVolumes.has(path)) throw Error(`${row.folder}: volume vehicles/${path} is declared but no material uses it`);
  return value as BodyDescriptor;
}
