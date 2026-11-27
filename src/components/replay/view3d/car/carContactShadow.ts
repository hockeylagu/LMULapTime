import { Box3, DataTexture, LinearFilter, Mesh, PlaneGeometry, RGBAFormat, Vector3, type IUniform, type Object3D, type ShaderMaterial, type Texture, type WebGLRenderTarget } from 'three';
import { hazePart } from '../atmosphere/haze.js';
import { cascadeLookupPart } from '../shadows/cascadeSampling.js';
import { composedMaterial, type ShaderPart } from '../shaders/composer.js';
import { unlitTemplate } from '../shaders/unlitTemplate.js';
import { bakeArea, bakeParts, bakeUnderCar, underCarQuadGeometry, CONTACT_SHADOW_NAME, type BakePart, type BakeRenderer } from './underCarBake.js';

/** How far the darkening spreads beyond the body, its strength under the body, and the lift that keeps it off the road. */
export const CONTACT_SHADOW_SPREAD_M = 0.5, CONTACT_SHADOW_LIFT_M = 0.02;
const STRENGTH = 0.6, CORNER_M = 0.3, TEXELS_PER_M = 24;
/** The share of its darkening the shade keeps where the sun reaches the road: the sky's share of the light, which the car still hides. */
const SUN_LIT_SHARE = 0.25;
/**
 * How far toward the eye the shade draws, metres: the quad is flat and rides the body's roll and pitch, so on a cambered or bumpy road
 * most of it lay under the surface, and which part cleared it changed every frame (the shade popped). The car's body still hides it.
 */
export const CONTACT_SHADOW_PULL_M = 0.15;
/** Drawn after the road and before the racing line (renderOrder 2), which stays readable over it. */
export const CONTACT_SHADOW_ORDER = 1;

/**
 * The shade's own part: black, its alpha from the shade map (the analytic quad's, then the body's bake), drawn pulled toward the eye.
 * The shade under the car takes the sky's light: where the sun reaches the road (under an overhang, around the body) it keeps
 * SUN_LIT_SHARE of its darkening. Without sun shadows (none, or past their fade), the shade grounds the car whole. The fade follows
 * the day share (the scene block's `lit_dayLight`): at night the cascades follow the moon, whose light is nothing beside the track lights and the sky
 * the car still hides, so the shade stays whole there instead of following the moon's shadow and the view.
 */
export const CONTACT_SHADOW_GLSL = {
  vertexPars: '  varying vec2 vContactShadowUv;',
  vertexView: `
  mvPosition.xyz *= max( 0.0, 1.0 - ${CONTACT_SHADOW_PULL_M.toFixed(2)} / length( mvPosition.xyz ) );
  gl_Position = projectionMatrix * mvPosition;`,
  vertexOutputs: '  vContactShadowUv = uv;',
  fragmentPars: '  uniform sampler2D contactShadow_map;\n  varying vec2 vContactShadowUv;',
  fragmentColour: `
  diffuseColor.rgb = vec3( 0.0 );
  diffuseColor.a *= texture2D( contactShadow_map, vContactShadowUv ).g;
  {
    float sunLit = surfaceCascadeShadow( vCascadeViewDepth ) * lit_dayLight;
    float beyond = surface_cascadeCount > 0.0
      ? clamp( ( vCascadeViewDepth - surface_cascadeFade.x ) / ( surface_cascadeFade.y - surface_cascadeFade.x ), 0.0, 1.0 ) : 1.0;
    diffuseColor.a *= mix( 1.0 - ${(1 - SUN_LIT_SHARE).toFixed(2)} * sunLit, 1.0, beyond );
  }`,
};

/** Each shade's map uniform: the bake swaps the body's map in. */
const shadeMaps = new WeakMap<ShaderMaterial, IUniform<Texture>>();

/** The composed contact shadow material on `map`: its own part, the cascade lookup and the haze. */
function contactShadowMaterial(map: Texture): ShaderMaterial {
  const uniform: IUniform<Texture> = {value: map};
  const shade: ShaderPart = {
    name: 'contactShadow',
    slots: {
      vertexPars: {at: 10, glsl: CONTACT_SHADOW_GLSL.vertexPars},
      vertexView: {at: 0, glsl: CONTACT_SHADOW_GLSL.vertexView},
      vertexOutputs: {at: 10, glsl: CONTACT_SHADOW_GLSL.vertexOutputs},
      fragmentPars: {at: 10, glsl: CONTACT_SHADOW_GLSL.fragmentPars},
      fragmentColour: {at: 0, glsl: CONTACT_SHADOW_GLSL.fragmentColour},
    },
    uniforms: () => ({contactShadow_map: uniform}),
    ownTextures: ['contactShadow_map'],
    needs: [cascadeLookupPart],
  };
  const material = composedMaterial(unlitTemplate, [shade, cascadeLookupPart, hazePart], {transparent: true, depthWrite: false});
  material.name = 'contact-shadow';
  shadeMaps.set(material, uniform);
  return material;
}

/**
 * The contact shadow of a footprint `halfX` × `halfZ` metres about its centre: a flat quad (normal up) whose alpha falls from
 * STRENGTH inside the body outline (a rounded rectangle) to nothing CONTACT_SHADOW_SPREAD_M beyond it. Its alpha map goes with
 * the material's disposal.
 */
export function contactShadowQuad(halfX: number, halfZ: number): {geometry: PlaneGeometry; material: ShaderMaterial} {
  const sizeX = 2 * (halfX + CONTACT_SHADOW_SPREAD_M), sizeZ = 2 * (halfZ + CONTACT_SHADOW_SPREAD_M);
  const width = Math.max(8, Math.round(sizeX * TEXELS_PER_M)), height = Math.max(8, Math.round(sizeZ * TEXELS_PER_M));
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      // Signed distance to the rounded footprint (negative inside), in metres.
      const x = Math.abs(((column + 0.5) / width - 0.5) * sizeX) - (halfX - CORNER_M), z = Math.abs(((row + 0.5) / height - 0.5) * sizeZ) - (halfZ - CORNER_M);
      const distance = Math.hypot(Math.max(x, 0), Math.max(z, 0)) + Math.min(Math.max(x, z), 0) - CORNER_M;
      const t = Math.min(Math.max((distance + CORNER_M) / (CONTACT_SHADOW_SPREAD_M + CORNER_M), 0), 1);
      data.fill(Math.round(255 * STRENGTH * (1 - t * t * (3 - 2 * t))), (row * width + column) * 4, (row * width + column) * 4 + 4);
    }
  }
  const alpha = new DataTexture(data, width, height, RGBAFormat);
  alpha.magFilter = LinearFilter; alpha.minFilter = LinearFilter; alpha.needsUpdate = true;
  const material = contactShadowMaterial(alpha);
  material.addEventListener('dispose', () => { alpha.dispose(); });
  return {geometry: new PlaneGeometry(sizeX, sizeZ).rotateX(-Math.PI / 2), material};
}

type ContactShadow = Mesh<PlaneGeometry, ShaderMaterial>;

/**
 * The shadows of one body (they share one bake): its footprint and the parts the bake draws (until baked), the cars' shadows (waiting
 * ones have been about to draw), the baked map.
 */
interface BodyShade {
  readonly bounds: Box3;
  parts: BakePart[] | null;
  readonly shadows: Set<ContactShadow>;
  readonly waiting: Set<ContactShadow>;
  map: WebGLRenderTarget | null;
}

/**
 * Bakes the shade under each car body once and hands it to every car of that body. A car's contact shadow starts on the analytic
 * quad; the first time it is about to draw it asks for the bake, and `flush` (the scene shell calls it before each draw) bakes at
 * most ONE body per frame, then swaps the baked map in. The map is released with the last shadow of its body.
 */
export function createUnderCarBaker() {
  const bodies = new Map<string, BodyShade>(), active = new Set<BodyShade>();
  const noop = () => {};
  const dropParts = (body: BodyShade) => { for (const part of body.parts ?? []) part.geometry.dispose(); body.parts = null; };
  const swapIn = (body: BodyShade, shadow: ContactShadow) => {
    const map = shadeMaps.get(shadow.material)!, previous = map.value;
    shadow.geometry.dispose(); shadow.geometry = underCarQuadGeometry(bakeArea(body.bounds).size);
    // The same program: only the map uniform changes.
    map.value = body.map!.texture;
    previous.dispose();
  };
  /** Registers a car's shadow under its body `key`; `bounds` is the car's footprint in its own frame, `parts` what a bake draws of it. */
  const register = (key: string, shadow: ContactShadow, bounds: Box3, parts: () => BakePart[]) => {
    let found = bodies.get(key);
    if (!found) { found = {bounds, parts: parts(), shadows: new Set(), waiting: new Set(), map: null}; bodies.set(key, found); }
    const body = found;
    body.shadows.add(shadow);
    shadow.onBeforeRender = () => { shadow.onBeforeRender = noop; body.waiting.add(shadow); active.add(body); };
    shadow.material.addEventListener('dispose', () => {
      body.shadows.delete(shadow); body.waiting.delete(shadow);
      if (body.shadows.size > 0) return;
      body.map?.dispose(); body.map = null; active.delete(body); dropParts(body);
      if (bodies.get(key) === body) bodies.delete(key);
    });
  };
  /** Bakes the next body due (at most one) and swaps the shade into every waiting shadow of a baked body. */
  const flush = (renderer: BakeRenderer) => {
    let baked = false;
    for (const body of active) {
      if (!body.map) {
        if (baked) continue;
        body.map = bakeUnderCar(renderer, body.parts ?? [], body.bounds); baked = true; dropParts(body);
      }
      for (const shadow of body.waiting) swapIn(body, shadow);
      body.waiting.clear(); active.delete(body);
    }
  };
  /** The baked map of a body, once baked and while a car of it lives. */
  const mapOf = (key: string) => bodies.get(key)?.map ?? null;
  return {register, flush, mapOf};
}

/** The scene's baker: the shell flushes it before each draw. */
export const underCarBaker = createUnderCarBaker();

/**
 * Grounds the car: the contact shadow under the car's footprint. It starts as the analytic quad (`contactShadowQuad` over the
 * model's bounds) and becomes the body's baked under-car shade (`underCarBaker`; `key` names the body: its liveries share one bake). It sits on the model's
 * lowest point (the tyre contact plane) and moves with the body. The bounds are the union of its parts' exact boxes in the
 * model's frame (`userData.footprint`, measured from their vertices once per body: the vertices may have left the CPU since).
 */
export function createContactShadow(model: Object3D, key: string, baker = underCarBaker): ContactShadow {
  const bounds = new Box3(), part = new Box3();
  model.traverse(object => {
    const footprint: unknown = object.userData.footprint;
    if (Array.isArray(footprint) && footprint.length === 6) bounds.union(part.set(new Vector3().fromArray(footprint as number[]), new Vector3().fromArray(footprint as number[], 3)));
  });
  if (bounds.isEmpty()) throw Error('Car model has no measured parts for its contact shadow');
  const {geometry, material} = contactShadowQuad((bounds.max.x - bounds.min.x) / 2, (bounds.max.z - bounds.min.z) / 2);
  const shadow = new Mesh(geometry, material);
  shadow.name = CONTACT_SHADOW_NAME;
  shadow.position.set((bounds.min.x + bounds.max.x) / 2, bounds.min.y + CONTACT_SHADOW_LIFT_M, (bounds.min.z + bounds.max.z) / 2);
  shadow.renderOrder = CONTACT_SHADOW_ORDER; shadow.castShadow = false; shadow.receiveShadow = false;
  baker.register(key, shadow, bounds, () => bakeParts(model));
  return shadow;
}
