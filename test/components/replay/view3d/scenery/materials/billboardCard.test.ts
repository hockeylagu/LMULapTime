import { describe, expect, it } from 'vitest';
import { Matrix4, OrthographicCamera, PerspectiveCamera } from 'three';
import {
  billboardPart, billboardShadowMaterial, billboardShadowPart, trackCardFacing, trackShadowEye,
} from '../../../../../../src/components/replay/view3d/scenery/materials/billboardCard.js';
import { composedParts } from '../../../../../../src/components/replay/view3d/shaders/composer.js';
import { depthTemplate } from '../../../../../../src/components/replay/view3d/shaders/depthTemplate.js';
import { SCENE_BLOCK, sceneBlock } from '../../../../../../src/components/replay/view3d/shaders/sceneBlock.js';

/** `count` floats of the scene block from a member's offset. */
const block = (name: keyof typeof SCENE_BLOCK.offsets, count: number) => [...sceneBlock.subarray(SCENE_BLOCK.offsets[name], SCENE_BLOCK.offsets[name] + count)];

describe('camera-facing cards', () => {
  it("turns a card and its normal toward the eye in the vertex stage, a leaf card's normal shaped as its crown", () => {
    const card = billboardPart(false), leaf = billboardPart(true);
    expect(card.slots.vertexPosition?.glsl).toContain('vec3 directionToCamera = cardToEye(cameraPosition, pivotWorld);');
    expect(card.slots.vertexNormal?.glsl).toContain('objectNormal = normalize(normalize(toEye) * mat3(CARD_MODEL));');
    // In a batch the card turns in its instance's frame (three's batching matrix), else in its mesh's.
    expect(card.slots.vertexPars?.glsl).toMatch(/#ifdef USE_BATCHING\s+#define CARD_MODEL \(modelMatrix \* batchingMatrix\)\s+#else\s+#define CARD_MODEL modelMatrix/);
    expect(card.slots.vertexNormal?.glsl).not.toContain('crownNormal');
    expect(leaf.slots.vertexNormal?.glsl).toContain('float up = clamp(2.0 * clamp(_lmu_corner.y, 0.0, 1.0) - 1.0, 0.0, 1.0) * clamp(1.0 - dot(facing, surface_crownSun), 0.0, 1.0);');
    expect(card.slots.fragmentPars?.glsl).toBe('#define SURFACE_CARD');
    // The turn and the crown's sun are the scene block's.
    expect(card.uniforms).toBeUndefined(); expect(leaf.uniforms).toBeUndefined();
    expect(leaf.slots.vertexPars?.glsl).not.toContain('uniform');
  });
  it('turns shadow-pass cards toward the viewing camera on the depth template, one material for every card', () => {
    const material = billboardShadowMaterial();
    expect(billboardShadowMaterial()).toBe(material);
    expect(composedParts(material)).toEqual([billboardShadowPart]);
    expect(material.customProgramCacheKey()).toContain(`-${depthTemplate.name}-`);
    expect(material.vertexShader).toContain('vec3 directionToCamera = cardToEye(surface_shadowEye, pivotWorld);');
    trackShadowEye(Object.assign(new PerspectiveCamera(), { matrixWorld: new Matrix4().makeTranslation(3, 4, 5) }));
    expect(block('surface_shadowEye', 3)).toEqual([3, 4, 5]);
    expect(material.uniforms).not.toHaveProperty('surface_shadowEye'); expect(material.uniforms).not.toHaveProperty('surface_cardFacing');
  });
  it("turns every card the overhead camera's own way, so none turns as it moves, and each toward the eye under a perspective camera", () => {
    // Straight down, the screen's top towards -z: the cards face +z (the screen's bottom), wherever the camera is.
    const overhead = new OrthographicCamera();
    for (const x of [0, 250]) {
      overhead.position.set(x, 180, 0.01); overhead.lookAt(x, 0, 0);
      trackCardFacing(overhead);
      expect(block('surface_cardFacing', 4).map(value => Math.round(value * 1e6) / 1e6)).toEqual([0, 0, 1, 1]);
    }
    trackCardFacing(new PerspectiveCamera());
    expect(block('surface_cardFacing', 4)[3]).toBe(0);
  });
});
