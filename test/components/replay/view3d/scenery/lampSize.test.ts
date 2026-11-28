import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { LAMP_ATTRIBUTE, lampCentres, lampSizePart, prepareLampSizes } from '../../../../../src/components/replay/view3d/scenery/lampSize.js';
import { sceneValue, setViewPixel } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';

/** Two lamps: a square of two triangles split by normal (no shared vertex) about (0, 0, 0), and a triangle about (10, 0, 0). */
const POSITIONS = [
  -1, 0, -1, 1, 0, -1, 1, 0, 1, // first half of the square
  -1, 0, -1, 1, 0, 1, -1, 0, 1, // second half, its own vertices at the same points
  9, 0, 0, 11, 0, 0, 10, 0, 3,
];

describe('lamp sizes', () => {
  it('gives every vertex its lamp centre and negated radius, joining faces at shared points', () => {
    const out = lampCentres(POSITIONS, null);
    for (let v = 0; v < 6; v++) expect([...out.subarray(4 * v, 4 * v + 4)].map(x => +x.toFixed(4))).toEqual([0, 0, 0, -Math.SQRT2].map(x => +x.toFixed(4)));
    expect(out[4 * 6]).toBeCloseTo(10); expect(out[4 * 6 + 2]).toBeCloseTo(1);
    expect(out[4 * 8 + 3]).toBeCloseTo(-2); // From the centre (10, 0, 1) to (10, 0, 3).
  });

  it('joins faces through the index', () => {
    const out = lampCentres([0, 0, 0, 2, 0, 0, 0, 0, 2, 2, 0, 2], [0, 1, 2, 1, 3, 2]);
    expect(out[0]).toBeCloseTo(1); expect(out[2]).toBeCloseTo(1); expect(out[12]).toBeCloseTo(1);
  });

  it('prepares the glowing parts only, once', () => {
    const glow = new MeshStandardMaterial(), wall = new MeshStandardMaterial();
    glow.userData.lmuSurface = {kind: 'highLumTrackside'}; wall.userData.lmuSurface = {kind: 'standard'};
    const geometry = () => new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(POSITIONS), 3));
    const lamp = new Mesh(geometry(), glow), other = new Mesh(geometry(), wall), root = new Group().add(lamp, other);
    prepareLampSizes(root);
    const attribute = lamp.geometry.getAttribute(LAMP_ATTRIBUTE);
    expect(attribute.itemSize).toBe(4); expect(other.geometry.getAttribute(LAMP_ATTRIBUTE)).toBeUndefined();
    prepareLampSizes(root);
    expect(lamp.geometry.getAttribute(LAMP_ATTRIBUTE)).toBe(attribute);
  });

  it('keeps a pixel in clip space for the frame', () => {
    setViewPixel(1000); expect(sceneValue('view_pixel')).toBeCloseTo(0.002);
    setViewPixel(0); expect(sceneValue('view_pixel')).toBe(0);
  });
});

it('grows a lamp on screen in the slot that moves the drawn position, and passes its light share', () => {
  const {slots} = lampSizePart;
  expect(slots.vertexPars?.glsl).toContain(`attribute vec4 ${LAMP_ATTRIBUTE};`);
  expect(slots.vertexView?.glsl).toContain('gl_Position = projectionMatrix * mvPosition;');
  expect(slots.vertexView?.glsl).toContain('vSurfaceLampShare = 1.0 / (growth * growth);');
  // The pixel and the day share are the scene block's.
  expect(slots.vertexView?.glsl).toContain('growth = mix(growth, 1.0, clamp(lit_dayLight, 0.0, 1.0));'); expect(lampSizePart.uniforms).toBeUndefined();
});