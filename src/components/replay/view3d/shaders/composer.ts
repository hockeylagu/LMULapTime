import { Matrix3, ShaderMaterial, Vector2, type IUniform, type Material, type ShaderMaterialParameters, type Texture, type UniformsGroup, type Vector4 } from 'three';

/**
 * The slots of every template, in the order a template must place them; one list, so the order of the composed program is read
 * here, not inferred from insertion. An exclusive slot takes one part at most; a template may give it code of its own, which the
 * part that fills it replaces.
 */
export const SLOTS = [
  /** Vertex declarations: uniforms, varyings, functions. */
  {name: 'vertexPars', exclusive: false},
  /** Lit: on the object-space normal (`objectNormal`) before it is turned to view space. */
  {name: 'vertexNormal', exclusive: false},
  /** On the object-space position (`transformed`, and the vertex's own attributes) before it is projected. */
  {name: 'vertexPosition', exclusive: false},
  /** After the projection (`mvPosition`, `gl_Position`), reading it as projected, before a part moves it. */
  {name: 'vertexProjected', exclusive: false},
  /** After the view-space position (`mvPosition`, `gl_Position`): a part that moves the drawn position. */
  {name: 'vertexView', exclusive: true},
  /** After the position is final: the varyings parts pass on. */
  {name: 'vertexOutputs', exclusive: false},
  /** Fragment declarations: uniforms, varyings, functions. */
  {name: 'fragmentPars', exclusive: false},
  /** Lit: on `diffuseColor` before the vertex colour: a family's own albedo. */
  {name: 'fragmentAlbedo', exclusive: false},
  /** On `diffuseColor` once the template's colour (and vertex colour) is in. */
  {name: 'fragmentColour', exclusive: false},
  /** Lit: on the shading normal (`normal`; `nonPerturbedNormal` is the geometry's) before the light model reads it. */
  {name: 'fragmentNormal', exclusive: false},
  /** Lit: on the surface's own light (`totalEmissiveRadiance`). */
  {name: 'fragmentEmission', exclusive: false},
  /** Lit: on the light model's material (`material`) once three has set it up, before the light reads it. */
  {name: 'fragmentMaterial', exclusive: false},
  /** Lit: on the sun's light (`directLight`, view space) before it is applied. */
  {name: 'fragmentSunLight', exclusive: false},
  /** Lit: on `reflectedLight` right after the sun's direct term. */
  {name: 'fragmentSunDirect', exclusive: false},
  /** Lit: the environment's light on the surface (`iblIrradiance`); the template looks it up along the normal unless a part does. */
  {name: 'fragmentIrradiance', exclusive: true},
  /**
   * Lit: the environment's reflection along the view (`radiance`, and `clearcoatRadiance` under a coat); the template reads three's
   * lookups unless a part reads its own.
   */
  {name: 'fragmentRadiance', exclusive: true},
  /** Lit: on the environment's reflection (`radiance`, `clearcoatRadiance`) once read, before the indirect light takes it. */
  {name: 'fragmentReflection', exclusive: false},
  /** Lit: the environment's reflection (`reflectedLight.indirectSpecular`); three's unless a part gives its own. */
  {name: 'fragmentIndirectSpecular', exclusive: true},
  /** Lit: on `reflectedLight` once every light is in, before it is summed (light a surface takes under its occlusion, the occlusion). */
  {name: 'fragmentOcclusion', exclusive: false},
  /** Lit: on `outgoingLight` (and `diffuseColor.a`) before the opaque write. */
  {name: 'fragmentLight', exclusive: false},
  /** On `gl_FragColor` after the output encode. */
  {name: 'fragmentOutput', exclusive: false},
] as const;

export type SlotName = typeof SLOTS[number]['name'];

/** A part's code for one slot, at its declared position among the slot's parts (lower first; two parts never share one). */
export interface SlotCode {
  readonly at: number;
  readonly glsl: string;
}

/**
 * A feature written once against the slots, never against three's source. `uniforms` gives a material its uniform objects: a shared
 * object is scene-wide (every program reads it), a fresh one the material's own. `ownTextures` names the uniforms that hold the
 * material's own textures (the warm-up uploads them; scene-wide atlases and states are not its own). `needs` are the parts whose
 * functions its code calls. The scene-wide values are no part's uniforms: the template's blocks carry them (sceneBlock.ts). `cutOut`
 * gives, from the part's uniforms, the texture whose alpha cuts the surface out at the material's `alphaTest` and where the surface
 * reads it (`composedCutOut`). `ghost` gives the values of its uniforms a lap's ghost car draws with (`composedGhost`).
 */
export interface ShaderPart {
  readonly name: string;
  readonly slots: Partial<Record<SlotName, SlotCode>>;
  readonly uniforms?: () => Record<string, IUniform>;
  readonly ownTextures?: readonly string[];
  readonly needs?: readonly ShaderPart[];
  readonly cutOut?: (uniforms: Readonly<Record<string, IUniform>>) => CutOut;
  readonly ghost?: Readonly<Record<string, number>>;
}

/**
 * The texture a composed surface is cut out by and its coordinates, as the surface reads them: the UV sets' weights (uv0 to uv3; all
 * 0, the position's XZ: `surfaceUv`, scenery/materials/shaderContext.ts), turned by `transform` (a texture's own matrix), then times
 * `scale` plus `shift`. The material's own uniform objects, so a pass that cuts by them reads them as they change.
 */
export interface CutOut {
  readonly map: IUniform<Texture | null>;
  readonly uvSets: IUniform<Vector4>;
  readonly transform: IUniform<Matrix3>;
  readonly scale: IUniform<Vector2>;
  readonly shift: IUniform<Vector2>;
}

/** A cut-out by `map` on `uvSets`; without a `transform`, `scale` or `shift`, unturned, whole and unshifted. */
export function cutOutOf(map: IUniform, uvSets: IUniform, coordinates: {transform?: IUniform; scale?: IUniform; shift?: IUniform} = {}): CutOut {
  for (const uniform of [map, uvSets, ...Object.values(coordinates)]) if (!uniform || !('value' in uniform)) throw Error('A cut-out names a uniform its part does not give');
  return {
    map: map as IUniform<Texture | null>, uvSets: uvSets as IUniform<Vector4>,
    transform: (coordinates.transform ?? {value: new Matrix3()}) as IUniform<Matrix3>,
    scale: (coordinates.scale ?? {value: new Vector2(1, 1)}) as IUniform<Vector2>,
    shift: (coordinates.shift ?? {value: new Vector2()}) as IUniform<Vector2>,
  };
}

export type ShaderDefines = Readonly<Record<string, string | number | boolean>>;

/**
 * Returns the composed code of slot `name`; `own` is the template's code for an exclusive slot no part fills.
 */
export type SlotWriter = (name: SlotName, own?: string) => string;

/** A program of our own with named slots: `slot(name)` returns the composed code of that slot, called in `SLOTS` order. */
export interface ShaderTemplate {
  readonly name: string;
  readonly vertex: (slot: SlotWriter) => string;
  readonly fragment: (slot: SlotWriter) => string;
  /** The template's own uniforms for `material` (its colour and opacity, the scene's light). */
  readonly uniforms: (material: ShaderMaterial) => Record<string, IUniform>;
  /** Defines every program of the template carries (the environment's kind). */
  readonly defines?: ShaderDefines;
  /** The uniform blocks its source declares, in their order: every material on it binds them (sceneBlock.ts). */
  readonly uniformsGroups?: readonly UniformsGroup[];
}

/** What a composed program is: the template, the parts (by name) with their shape, and the defines. */
export interface ComposedShader {
  readonly vertexShader: string;
  readonly fragmentShader: string;
  /** The hash of the description: same description, same key; a value is never part of it. */
  readonly key: string;
  readonly description: string;
}

/** The composition of a material built by `composedMaterial`. */
interface Composition {
  readonly template: ShaderTemplate;
  readonly parts: readonly ShaderPart[];
  readonly defines: ShaderDefines;
  readonly key: string;
  /** The uniforms that hold the material's own textures. */
  readonly ownTextures: readonly IUniform[];
  /** The texture it is cut out by and its coordinates, if a part gives them. */
  readonly cutOut: CutOut | null;
}

const compositions = new WeakMap<Material, Composition>();

/** 53-bit string hash (cyrb53): a short key for a long description. */
function hash(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Each slot's code, the parts' entries ordered by their declared position. Throws on any part the template cannot place. */
function slotCode(template: ShaderTemplate, parts: readonly ShaderPart[]): Map<SlotName, string> {
  const names = new Set<string>();
  for (const part of parts) {
    if (names.has(part.name)) throw Error(`Shader part ${part.name} is given twice`);
    names.add(part.name);
  }
  for (const part of parts) {
    for (const needed of part.needs ?? []) if (!parts.includes(needed)) throw Error(`Shader part ${part.name} needs ${needed.name}`);
  }
  // The template's slots, as it places them: each once, in SLOTS order.
  const placed: SlotName[] = [];
  const record: SlotWriter = (name, own) => {
    if (own !== undefined && !SLOTS.some(slot => slot.name === name && slot.exclusive)) throw Error(`Template ${template.name} gives code of its own to slot ${name}, which is not exclusive`);
    placed.push(name);
    return '';
  };
  template.vertex(record); template.fragment(record);
  const order = SLOTS.map(slot => slot.name).filter(name => placed.includes(name));
  if (placed.length !== order.length || placed.some((name, i) => name !== order[i])) {
    throw Error(`Template ${template.name} places its slots out of order: ${placed.join(', ')}`);
  }
  const code = new Map<SlotName, string>();
  for (const {name, exclusive} of SLOTS) {
    const entries = parts.flatMap(part => {
      const entry = part.slots[name];
      return entry ? [{part: part.name, ...entry}] : [];
    });
    if (!entries.length) continue;
    if (!placed.includes(name)) throw Error(`Template ${template.name} has no slot ${name} for ${entries.map(entry => entry.part).join(', ')}`);
    if (exclusive && entries.length > 1) throw Error(`Slot ${name} is exclusive: ${entries.map(entry => entry.part).join(' and ')} both fill it`);
    entries.sort((a, b) => a.at - b.at);
    entries.forEach((entry, i) => {
      if (!Number.isFinite(entry.at)) throw Error(`Shader part ${entry.part} has no position in ${name}`);
      if (i > 0 && entries[i - 1].at === entry.at) throw Error(`Shader parts ${entries[i - 1].part} and ${entry.part} share position ${entry.at} in ${name}`);
    });
    code.set(name, entries.map(entry => `// ${entry.part}\n${entry.glsl}`).join('\n'));
  }
  return code;
}

/** The template's defines with a family's: a family never sets one the template sets. */
function allDefines(template: ShaderTemplate, defines: ShaderDefines): ShaderDefines {
  const own = template.defines ?? {};
  for (const name of Object.keys(defines)) if (Object.hasOwn(own, name)) throw Error(`Define ${name} is the ${template.name} template's own`);
  return {...own, ...defines};
}

/**
 * Composes `parts` into `template`: each slot's code in the parts' declared order. The description lists the template, the defines
 * (the template's and the family's) and the parts sorted by name with their slots, positions, code and uniform names; its hash is
 * the program key.
 */
export function composeShader(template: ShaderTemplate, parts: readonly ShaderPart[], familyDefines: ShaderDefines = {}): ComposedShader {
  const code = slotCode(template, parts), defines = allDefines(template, familyDefines);
  const slot: SlotWriter = (name, own = '') => code.get(name) ?? own;
  const description = JSON.stringify({
    template: template.name,
    defines: Object.keys(defines).sort().map(name => [name, defines[name]]),
    parts: [...parts].sort((a, b) => (a.name < b.name ? -1 : 1)).map(part => ({
      name: part.name,
      slots: SLOTS.flatMap(({name}) => { const entry = part.slots[name]; return entry ? [[name, entry.at, entry.glsl]] : []; }),
      uniforms: Object.keys(part.uniforms?.() ?? {}).sort(),
    })),
  });
  return {vertexShader: template.vertex(slot), fragmentShader: template.fragment(slot), key: `lmu-composed-${template.name}-${hash(description)}`, description};
}

/** The material properties a composed material takes: its program, uniforms and blocks come from the composition, and three's fog is off. */
export type ComposedParameters = Omit<ShaderMaterialParameters, 'uniforms' | 'vertexShader' | 'fragmentShader' | 'defines' | 'glslVersion' | 'fog' | 'lights'>;

/**
 * A `ShaderMaterial` drawing `template` with `parts`, bound to the template's uniform blocks. Its program key is the composition's
 * (`composeShader`); `glslVersion` stays unset, so three compiles it as GLSL 3 with its `gl_FragColor` output. Values go in uniforms
 * and blocks only, never in the source or defines.
 */
export function composedMaterial(template: ShaderTemplate, parts: readonly ShaderPart[], parameters: ComposedParameters = {}, defines: ShaderDefines = {}): ShaderMaterial {
  const {vertexShader, fragmentShader, key} = composeShader(template, parts, defines);
  const material = new ShaderMaterial({...parameters, vertexShader, fragmentShader, defines: {...allDefines(template, defines)}, fog: false, lights: false});
  material.uniformsGroups = [...template.uniformsGroups ?? []];
  const uniforms: Record<string, IUniform> = {};
  const add = (source: string, from: Record<string, IUniform>) => {
    for (const [name, uniform] of Object.entries(from)) {
      if (Object.hasOwn(uniforms, name) && uniforms[name] !== uniform) throw Error(`Uniform ${name} of ${source} is declared twice`);
      uniforms[name] = uniform;
    }
  };
  add(template.name, template.uniforms(material));
  const ownTextures: IUniform[] = [];
  let cutOut: CutOut | null = null;
  for (const part of parts) {
    const own = part.uniforms?.() ?? {};
    add(part.name, own);
    for (const name of part.ownTextures ?? []) {
      if (!Object.hasOwn(own, name)) throw Error(`Shader part ${part.name} has no uniform ${name} for its texture`);
      ownTextures.push(own[name]);
    }
    if (part.cutOut === undefined) continue;
    if (cutOut) throw Error(`Shader part ${part.name} cuts out a material another part already cuts out`);
    cutOut = part.cutOut(own);
  }
  material.uniforms = uniforms;
  material.customProgramCacheKey = () => key;
  compositions.set(material, {template, parts, defines, key, ownTextures, cutOut});
  return material;
}

/** The parts of a composed material, or null for any other material. */
export function composedParts(material: Material): readonly ShaderPart[] | null {
  return compositions.get(material)?.parts ?? null;
}

/** The template a composed material draws, or null for any other material. */
export function composedTemplate(material: Material): ShaderTemplate | null {
  return compositions.get(material)?.template ?? null;
}

/**
 * Puts a composed material in ghost mode (a lap's ghost car): each part's uniforms take the values the part gives a ghost (`ghost`),
 * the others keep theirs. The material's own state (transparency, opacity, depth write) is the caller's: the templates read the
 * opacity from the material. Throws for a material the composer did not build.
 */
export function composedGhost(material: Material): void {
  const composition = compositions.get(material);
  if (!composition) throw Error(`Material ${material.name || material.type} is not composed`);
  const uniforms = (material as ShaderMaterial).uniforms;
  for (const part of composition.parts) {
    for (const [name, value] of Object.entries(part.ghost ?? {})) {
      if (!Object.hasOwn(uniforms, name)) throw Error(`Shader part ${part.name} has no uniform ${name} for its ghost`);
      uniforms[name].value = value;
    }
  }
}

/**
 * The texture a composed material is cut out by (its alpha against the material's `alphaTest`) and its coordinates, or null for a
 * material no part cuts out and for any other material. The shadow pass reads them to cut a caster's shadow as the surface is cut.
 */
export function composedCutOut(material: Material): CutOut | null {
  return compositions.get(material)?.cutOut ?? null;
}

/**
 * A new material of `material`'s composition (template, defines, parts) with `extra` parts after its own and `parameters` of its
 * own. Its uniforms are what each part's `uniforms` gives: a part that returns objects it holds (a family's surface values and
 * maps) shares them with `material`, so the variant draws and cuts out by the parent's values as they change; one that makes them
 * fresh gives the variant its own. The template's per-material ones (opacity, alpha test) are the variant's own, read off it. Throws for
 * a material the composer did not build.
 */
export function composedVariant(material: Material, extra: readonly ShaderPart[], parameters: ComposedParameters = {}): ShaderMaterial {
  const composition = compositions.get(material);
  if (!composition) throw Error(`Material ${material.name || material.type} is not composed`);
  return composedMaterial(composition.template, [...composition.parts, ...extra], parameters, composition.defines);
}

/** The textures a composed material holds as its own now (not the scene-wide ones), or null for any other material. */
export function composedTextures(material: Material): Texture[] | null {
  const composition = compositions.get(material);
  if (!composition) return null;
  return composition.ownTextures.flatMap(uniform => {
    const value: unknown = uniform.value;
    return value && (value as Texture).isTexture === true ? [value as Texture] : [];
  });
}
