import { CompressedTexture, RGBA_BPTC_Format, type Color, type Texture, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import type { CarReadout, CarReadoutFont } from '../../../../../shared/types/scenes/car.js';
import { createReadoutCanvas, readoutPainter } from '../../../../../src/components/replay/view3d/car/readoutCanvas.js';
import { startStreaming, streamTexture, type MipLevel } from '../../../../../src/components/replay/view3d/scenery/materials/mipStreaming.js';

/** A BC7 chain of `size` px: 16 bytes per 4×4 block. */
const levels = (size: number): MipLevel[] => Array.from({length: Math.log2(size) + 1}, (_, i) => {
  const side = size >> i;
  return {data: new Uint8Array(Math.ceil(side / 4) ** 2 * 16), width: side, height: side};
});

/** A renderer double: counts the canvas paints, and uploads a texture as three does (then runs its `onUpdate`). */
function fakeRenderer() {
  const paints = vi.fn();
  const renderer = {
    getRenderTarget: () => null, setRenderTarget: () => {}, getClearAlpha: () => 1, getClearColor: (colour: Color) => colour, setClearColor: () => {},
    clear: () => {}, render: paints, initTexture: (texture: Texture) => texture.onUpdate?.(texture),
  } as unknown as WebGLRenderer;
  return {renderer, paints};
}

const font: CarReadoutFont = {texture: 'textures/font.ktx2.zst', size: [256, 256], cell: [16, 16], columns: 16, advances: Array.from({length: 240}, () => 8)};
const readout: CarReadout = {material: 'SCREEN', rpm: {min: 0, max: -1, altMin: -1, altMax: -1}, revLimitRpm: 8000, canvasSize: [64, 64], elements: [],
  texts: [{name: 'RPM', font: 0, scale: [1, 1], offset: [0.5, 0.5], alignW: 0, alignH: 0, alphaColor: null, units: 1, defaultValue: ''}], fonts: [font]};

it('paints a still canvas again once its font sheet sharpens, and only then', async () => {
  const gpu = fakeRenderer(), sheets: Texture[] = [];
  // The font sheet first draws from its start file's 64 px levels; the two levels above stream in later.
  const canvas = createReadoutCanvas(readout, () => {
    const sheet = new CompressedTexture(levels(64), 64, 64, RGBA_BPTC_Format);
    startStreaming(sheet, {missing: 2, load: async () => levels(256).slice(0, 2), drop: () => {}});
    sheet.needsUpdate = true;
    gpu.renderer.initTexture(sheet); // On the GPU from the first paint.
    sheets.push(sheet);
    return sheet;
  });
  canvas.draw({x: 0, y: 0, z: 0, engineRpm: 7000}, 0, {});
  readoutPainter.flush(gpu.renderer);
  readoutPainter.flush(gpu.renderer);
  expect(gpu.paints).toHaveBeenCalledTimes(1); // A paused lap draws nothing new while the sheet is still blurred.
  // The sheet sharpens, as the scene's streaming does: the same digits are painted again from its full levels, once.
  await vi.waitFor(() => { expect(streamTexture(sheets[0], gpu.renderer)).toBeGreaterThan(0); });
  readoutPainter.flush(gpu.renderer);
  readoutPainter.flush(gpu.renderer);
  expect(gpu.paints).toHaveBeenCalledTimes(2);
  canvas.texture.dispose();
});
