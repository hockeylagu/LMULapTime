import { Vector3, type Camera, type OrthographicCamera, type ShaderMaterial } from 'three';
import { composedMaterial, type ShaderPart } from '../../shaders/composer.js';
import { depthTemplate } from '../../shaders/depthTemplate.js';
import { SCENE_BLOCK, sceneBlock, setScene } from '../../shaders/sceneBlock.js';

/**
 * Camera-facing cards (a surface's `billboard`: leaf and crowd cards, `_lmu_pivot` and `_lmu_corner` attributes): each card turns about
 * its pivot toward the eye, its normal with it, in the scene pass and in the sun shadow pass alike.
 */

const shadowEyeAt = new Vector3(), axisX = new Vector3(), axisY = new Vector3(), axisZ = new Vector3();

/**
 * Where camera-facing cards turn to in a shadow pass (the scene block's `surface_shadowEye`): `camera`, the camera the frame is seen
 * from, so a card casts the shape that is drawn (shadows/shadowCasterPass.ts sets it before each pass).
 */
export function trackShadowEye(camera: Camera): void {
  shadowEyeAt.setFromMatrixPosition(camera.matrixWorld).toArray(sceneBlock, SCENE_BLOCK.offsets.surface_shadowEye);
}

/**
 * How cards turn, in the main and shadow passes alike (the scene block's `surface_cardFacing`): under an orthographic camera (the
 * overhead view) every card faces the camera's own way (xyz, w = 1), so the cards hold still as the camera moves with the car; under a
 * perspective camera (w = 0) each turns toward the eye. The camera's way is its backward axis less its up axis, level: behind it when
 * it looks ahead, below the screen's top when it looks straight down. Sets it for the frame `camera` draws.
 */
export function trackCardFacing(camera: Camera): void {
  const w = SCENE_BLOCK.offsets.surface_cardFacing + 3;
  if (!(camera as OrthographicCamera).isOrthographicCamera) { sceneBlock[w] = 0; return; }
  camera.updateMatrixWorld();
  camera.matrixWorld.extractBasis(axisX, axisY, axisZ);
  axisZ.sub(axisY).setY(0);
  if (axisZ.lengthSq() < 1e-8) { sceneBlock[w] = 0; return; }
  axisZ.normalize();
  setScene('surface_cardFacing', [axisZ.x, 0, axisZ.z, 1]);
}

/** The card's attributes and its turn toward an eye (level), or the overhead camera's own way (`surface_cardFacing`). */
const CARD_PARS = `
    attribute vec3 _lmu_pivot;
    attribute vec2 _lmu_corner;
    vec3 cardToEye(vec3 eye, vec3 pivotWorld) {
      vec3 toEye = surface_cardFacing.w > 0.5 ? surface_cardFacing.xyz : eye - pivotWorld;
      return vec3(toEye.x, 0.0, toEye.z);
    }`;

/**
 * After `begin_vertex`: the card's corner, turned about its pivot toward `eye` (a world position in GLSL). transpose(M) * d is the
 * local direction whose world direction is d.
 */
const cardPosition = (eye: string) => `
    vec3 pivotWorld = (modelMatrix * vec4(_lmu_pivot, 1.0)).xyz;
    vec3 directionToCamera = cardToEye(${eye}, pivotWorld);
    bool facingCamera = length(directionToCamera) > 0.0001;
    vec3 rightWorld = facingCamera ? normalize(cross(vec3(0.0,1.0,0.0), directionToCamera)) : vec3(1.0,0.0,0.0);
    vec3 rightLocal = normalize(rightWorld * mat3(modelMatrix));
    transformed = _lmu_pivot + rightLocal * _lmu_corner.x + vec3(0.0,_lmu_corner.y,0.0);`;

/**
 * After `beginnormal_vertex`: the card's normal turned with it toward `eye` (the authored normal belongs to the rest plane and, kept,
 * left whole crowds facing away from the sun).
 */
const cardNormal = (eye: string) => `
    { vec3 toEye = cardToEye(${eye}, (modelMatrix * vec4(_lmu_pivot, 1.0)).xyz);
      if (length(toEye) > 0.0001) objectNormal = normalize(normalize(toEye) * mat3(modelMatrix));
      #ifdef USE_TANGENT
        objectTangent = normalize(normalize(cross(vec3(0.0,1.0,0.0), toEye)) * mat3(modelMatrix));
      #endif
    }`;

/**
 * Lighting normals for leaf cards: the card's facing normal tilts sideways by the corner's side (saturating at a metre, so the two
 * halves of a wide card read as the two sides of a crown) and upward above a metre over the pivot, the up-tilt fading as the card
 * comes to face the sun. Nothing tilts downward: the base of a tree keeps the facing normal, so it is lit like the trunk around it
 * rather than reading as an underside. Backlit cards get a normal the translucency can use. A local normal (transpose(M) * world).
 */
const crownNormal = (eye: string) => `
    { vec3 toEye = cardToEye(${eye}, (modelMatrix * vec4(_lmu_pivot, 1.0)).xyz);
      if (length(toEye) > 0.0001) {
        vec3 facing = normalize(toEye), across = normalize(cross(vec3(0.0,1.0,0.0), toEye));
        float side = clamp(2.0 * clamp(_lmu_corner.x, 0.0, 1.0) - 1.0, -1.0, 1.0);
        float up = clamp(2.0 * clamp(_lmu_corner.y, 0.0, 1.0) - 1.0, 0.0, 1.0) * clamp(1.0 - dot(facing, surface_crownSun), 0.0, 1.0);
        vec3 crownNormal = facing + across * side + vec3(0.0, up, 0.0);
        objectNormal = normalize(normalize(crownNormal) * mat3(modelMatrix));
      } }`;

/**
 * A card drawn in the scene: turned toward the camera, its normal with it (a leaf card's then shaped as its crown's), and its cascade
 * lookup skipping its own depth (`SURFACE_CARD`, shadows/cascadeSampling.ts: a card and its own shadow lie in one plane), so it must
 * come before the cascade's declarations. Under the overhead camera every card turns the camera's own way instead (`surface_cardFacing`).
 */
export function billboardPart(crown: boolean): ShaderPart {
  return {
    name: 'billboard',
    slots: {
      vertexPars: {at: 50, glsl: CARD_PARS},
      vertexNormal: {at: 0, glsl: `${cardNormal('cameraPosition')}${crown ? crownNormal('cameraPosition') : ''}`},
      vertexPosition: {at: 0, glsl: cardPosition('cameraPosition')},
      fragmentPars: {at: -10, glsl: '#define SURFACE_CARD'},
    },
  };
}

/** A card in the sun's shadow pass: turned toward the viewing camera, not the light, so a crown's own shadow falls on the card drawn. */
export const billboardShadowPart: ShaderPart = {
  name: 'billboardShadow',
  slots: {
    vertexPars: {at: 50, glsl: CARD_PARS},
    vertexPosition: {at: 0, glsl: cardPosition('surface_shadowEye')},
  },
};

let shadowMaterial: ShaderMaterial | null = null;

/**
 * The sun shadow pass's material for every camera-facing card, shared as three shares its default depth material: the depth
 * template with the card's turn. The pass draws each card with a variant of it of the card's side and cut (`depthCutOutPart` on
 * the card's own cut-out, read where the card reads it). The shadow pass keeps the eye current (`trackShadowEye`).
 */
export function billboardShadowMaterial(): ShaderMaterial {
  shadowMaterial ??= composedMaterial(depthTemplate, [billboardShadowPart]);
  return shadowMaterial;
}
