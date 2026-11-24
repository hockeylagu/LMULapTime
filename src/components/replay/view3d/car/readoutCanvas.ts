import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderTarget, Color, type Object3D, type Texture, type WebGLRenderer } from 'three';
import type { CarReadout } from '../../../../../shared/types/scenes/car.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { RenderPose } from '../scene/replayPose.js';
import { readoutQuads, type ReadoutQuad } from './readoutDraw.js';
import { readoutTextQuads, type ReadoutLapContext } from './readoutText.js';

/** Side of the readout canvas in pixels where the package gives no size (the game's canvases are 1024 or 2048 px square); quads are in canvas units. */
export const READOUT_CANVAS_PX = 1024;
/** The most glyphs a text field draws (the game's text buffer holds 63 characters). */
const MAX_GLYPHS = 63;

/**
 * A car's readout canvas: the texture the game redraws every frame for the screen materials the readout names (`CarReadout.material`).
 * `draw` takes the lap's sample; the canvas is repainted at the next `readoutPainter.flush` when its quads changed.
 */
export interface ReadoutCanvas {
  readonly texture: Texture;
  draw(point: ReplayTrajectoryPoint, timeSec: number, lap: ReadoutLapContext): void;
}

interface PaintedCanvas extends ReadoutCanvas { paint(renderer: WebGLRenderer): void }

const due = new Set<PaintedCanvas>();
const clearColour = new Color(), savedColour = new Color();

/** Paints the canvases whose quads changed since the last frame; called once per frame before the scene draws. */
export const readoutPainter = {
  flush(renderer: WebGLRenderer) {
    if (!due.size) return;
    const target = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
    renderer.getClearColor(savedColour);
    renderer.setClearColor(clearColour, 0);
    try { for (const canvas of due) canvas.paint(renderer); }
    finally { due.clear(); renderer.setRenderTarget(target); renderer.setClearColor(savedColour, alpha); }
  },
};

/** One quad per glyph slot: positions, UVs and the two triangles of each, drawn up to the text's length. */
function glyphGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(MAX_GLYPHS * 12), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(MAX_GLYPHS * 8), 2));
  geometry.setIndex(Array.from({length: MAX_GLYPHS}, (_, i) => [0, 1, 2, 0, 2, 3].map(corner => i * 4 + corner)).flat());
  return geometry;
}

/**
 * The canvas of `readout`: one quad per element over a transparent canvas, each its atlas (`atlas` returns the car's own copy of a body
 * texture; a null texture is the game's plain white) times its colour, and each text field's glyphs in its font. Drawn in the game's
 * order: elements of RenderOrder 0 and below in file order, then the texts, then the elements of higher RenderOrder (the BMW's icons
 * cover its digits). Canvas y runs down from the top; the screen samples it as the game's texture (v = 0 at the top). Freed with its
 * texture (the screen material frees it).
 */
export function createReadoutCanvas(readout: CarReadout, atlas: (path: string) => Texture): ReadoutCanvas {
  const [width, height] = readout.canvasSize ?? [READOUT_CANVAS_PX, READOUT_CANVAS_PX];
  const target = new WebGLRenderTarget(width, height, {depthBuffer: false});
  target.texture.colorSpace = SRGBColorSpace;
  const scene = new Scene(), camera = new OrthographicCamera(0, 1, 1, 0, -1, 1);
  const atlases = new Map<string, Texture>();
  const quads = readout.elements.map((element, order) => {
    let map: Texture | null = null;
    if (element.texture !== null) {
      map = atlases.get(element.texture) ?? atlas(element.texture);
      atlases.set(element.texture, map);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(8), 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const material = new MeshBasicMaterial({map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = (element.renderOrder > 0 ? 2000 + element.renderOrder * 100 : 0) + order; mesh.frustumCulled = false; mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  const texts = readout.texts.map((field, order) => {
    const font = readout.fonts[field.font];
    const map = atlases.get(font.texture) ?? atlas(font.texture);
    atlases.set(font.texture, map);
    const [a, r, g, b] = field.alphaColor ?? [255, 255, 255, 255];
    const material = new MeshBasicMaterial({map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: a / 255});
    material.color.setRGB(r / 255, g / 255, b / 255);
    const mesh = new Mesh(glyphGeometry(), material);
    mesh.renderOrder = 1000 + order; mesh.frustumCulled = false; mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  const write = (mesh: Mesh<BufferGeometry, MeshBasicMaterial>, glyphs: ReadoutQuad[]) => {
    const position = mesh.geometry.attributes.position as BufferAttribute, uv = mesh.geometry.attributes.uv as BufferAttribute;
    const count = Math.min(glyphs.length, MAX_GLYPHS);
    for (let i = 0; i < count; i++) {
      const quad = glyphs[i], at = i * 4;
      position.setXYZ(at, quad.x0, quad.y0, 0); position.setXYZ(at + 1, quad.x1, quad.y0, 0); position.setXYZ(at + 2, quad.x1, quad.y1, 0); position.setXYZ(at + 3, quad.x0, quad.y1, 0);
      uv.setXY(at, quad.u0, quad.v0); uv.setXY(at + 1, quad.u1, quad.v0); uv.setXY(at + 2, quad.u1, quad.v1); uv.setXY(at + 3, quad.u0, quad.v1);
    }
    position.needsUpdate = true; uv.needsUpdate = true;
    mesh.geometry.setDrawRange(0, count * 6);
    mesh.visible = count > 0;
  };
  let shown = '';
  const place = (mesh: Mesh<BufferGeometry, MeshBasicMaterial>, quad: ReadoutQuad) => {
    const position = mesh.geometry.attributes.position as BufferAttribute, uv = mesh.geometry.attributes.uv as BufferAttribute;
    position.setXYZ(0, quad.x0, quad.y0, 0); position.setXYZ(1, quad.x1, quad.y0, 0); position.setXYZ(2, quad.x1, quad.y1, 0); position.setXYZ(3, quad.x0, quad.y1, 0);
    uv.setXY(0, quad.u0, quad.v0); uv.setXY(1, quad.u1, quad.v0); uv.setXY(2, quad.u1, quad.v1); uv.setXY(3, quad.u0, quad.v1);
    position.needsUpdate = true; uv.needsUpdate = true;
    // The game's colour multiplies the texel as stored (a raw factor, not a colour to convert).
    const [a, r, g, b] = quad.argb;
    mesh.material.color.setRGB(r / 255, g / 255, b / 255); mesh.material.opacity = a / 255;
  };
  const canvas: PaintedCanvas = {
    texture: target.texture,
    draw(point, timeSec, lap) {
      const next = readoutQuads(readout, point, timeSec), glyphs = readoutTextQuads(readout, point, timeSec, lap), key = JSON.stringify([next, glyphs]);
      if (key === shown) return;
      shown = key;
      next.forEach((quad, index) => {
        const mesh = quads[index];
        mesh.visible = quad !== null;
        if (quad) place(mesh, quad);
      });
      glyphs.forEach((quadsOfText, index) => write(texts[index], quadsOfText));
      due.add(canvas);
    },
    paint(renderer) {
      renderer.setRenderTarget(target);
      renderer.clear(true, false, false);
      renderer.render(scene, camera);
    },
  };
  target.texture.addEventListener('dispose', () => {
    due.delete(canvas); target.dispose();
    for (const mesh of [...quads, ...texts]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    for (const map of atlases.values()) map.dispose();
  });
  return canvas;
}

/** Redraws a car's readout canvases from its lap. */
export interface ReadoutStates { update(pose: RenderPose): void }

/**
 * Draws the readouts of `car` (the canvases its screen meshes name, `userData.readoutCanvas`) from its lap's samples. Null when the
 * car has none, or the track carries no engine rpm (the race's samples: readouts are drawn in the lap view only).
 */
export function createReadoutStates(car: Object3D, points: ReplayTrajectoryPoint[], lap: ReadoutLapContext = {}): ReadoutStates | null {
  const canvases = new Set<ReadoutCanvas>();
  car.traverse(object => { const canvas = object.userData.readoutCanvas as ReadoutCanvas | undefined; if (canvas) canvases.add(canvas); });
  if (!canvases.size || !points.some(point => point.engineRpm !== undefined)) return null;
  return {
    update(pose) {
      const point = points[pose.index], next = points[pose.index + 1] ?? point;
      if (!point) return;
      const timeSec = (point.timeSec ?? 0) + ((next?.timeSec ?? 0) - (point.timeSec ?? 0)) * pose.fraction;
      for (const canvas of canvases) canvas.draw(point, timeSec, lap);
    },
  };
}
