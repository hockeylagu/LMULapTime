import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderTarget, Color, type Object3D, type Texture, type WebGLRenderer } from 'three';
import type { CarReadout } from '../../../../../shared/types/scenes/car.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { RenderPose } from '../scene/replayPose.js';
import { readoutQuads, type ReadoutQuad } from './readoutDraw.js';

/** Side of the square readout canvas in pixels: the game's canvases are 1024 or 2048 px square; element quads are in canvas units. */
export const READOUT_CANVAS_PX = 1024;

/**
 * A car's readout canvas: the texture the game redraws every frame for the screen materials the readout names (`CarReadout.material`).
 * `draw` takes the lap's sample; the canvas is repainted at the next `readoutPainter.flush` when its quads changed.
 */
export interface ReadoutCanvas {
  readonly texture: Texture;
  draw(point: ReplayTrajectoryPoint, timeSec: number): void;
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

/**
 * The canvas of `readout`: one quad per element, drawn in the file's order over a transparent canvas, each its atlas (`atlas` returns
 * the car's own copy of a body texture; a null texture is the game's plain white) times its colour. Canvas y runs down from the top;
 * the screen samples it as the game's texture (v = 0 at the top). Freed with its texture (the screen material frees it).
 */
export function createReadoutCanvas(readout: CarReadout, atlas: (path: string) => Texture): ReadoutCanvas {
  const target = new WebGLRenderTarget(READOUT_CANVAS_PX, READOUT_CANVAS_PX, {depthBuffer: false});
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
    mesh.renderOrder = order; mesh.frustumCulled = false; mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
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
    draw(point, timeSec) {
      const next = readoutQuads(readout, point, timeSec), key = JSON.stringify(next);
      if (key === shown) return;
      shown = key;
      next.forEach((quad, index) => {
        const mesh = quads[index];
        mesh.visible = quad !== null;
        if (quad) place(mesh, quad);
      });
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
    for (const mesh of quads) { mesh.geometry.dispose(); mesh.material.dispose(); }
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
export function createReadoutStates(car: Object3D, points: ReplayTrajectoryPoint[]): ReadoutStates | null {
  const canvases = new Set<ReadoutCanvas>();
  car.traverse(object => { const canvas = object.userData.readoutCanvas as ReadoutCanvas | undefined; if (canvas) canvases.add(canvas); });
  if (!canvases.size || !points.some(point => point.engineRpm !== undefined)) return null;
  return {
    update(pose) {
      const point = points[pose.index], next = points[pose.index + 1] ?? point;
      if (!point) return;
      const timeSec = (point.timeSec ?? 0) + ((next?.timeSec ?? 0) - (point.timeSec ?? 0)) * pose.fraction;
      for (const canvas of canvases) canvas.draw(point, timeSec);
    },
  };
}
