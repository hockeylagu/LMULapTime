import { DataTexture, LinearFilter, RedFormat, Color, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { TrackSurfacePolygon } from '../../../../shared/types/trackGeometry.js';

/** The lap's layout reads dark; roads it never uses stay a lighter grey, like the 2D map's other roads. */
export const ACTIVE_ROAD_COLOR = '#3b3f45', OTHER_ROAD_COLOR = '#6d7176';
const MASK_M_PER_PX = 0.25, MASK_MAX_PX = 8192;

/**
 * The mask's native x/z extent: the road outline plus 2 m, not the scene, whose filler ground reaches 700 m
 * out and would coarsen the mask. Road past it samples the empty edge texels: an other-road colour.
 */
export function activeRoadBounds(polygons: TrackSurfacePolygon[], fallback: {min: number[]; max: number[]}): {min: number[]; max: number[]} {
  const min = [Infinity, fallback.min[1], Infinity], max = [-Infinity, fallback.max[1], -Infinity];
  for (const polygon of polygons) for (const ring of polygon) for (const [x, z] of ring) {
    min[0] = Math.min(min[0], x - 2); min[2] = Math.min(min[2], z - 2); max[0] = Math.max(max[0], x + 2); max[2] = Math.max(max[2], z + 2);
  }
  return Number.isFinite(min[0]) ? {min, max} : fallback;
}

/** Rasterises the 2D map's active-layout road polygons (native x/z) over the scene bounds; one byte per texel. */
export function rasterizeActiveRoad(polygons: TrackSurfacePolygon[], bounds: {min: number[]; max: number[]}): DataTexture | null {
  const spanX = bounds.max[0] - bounds.min[0], spanZ = bounds.max[2] - bounds.min[2];
  const scale = Math.min(1 / MASK_M_PER_PX, MASK_MAX_PX / Math.max(spanX, spanZ));
  const width = Math.max(1, Math.ceil(spanX * scale)), height = Math.max(1, Math.ceil(spanZ * scale));
  const context = polygons.length ? document.createElement('canvas').getContext('2d') : null;
  if (!context) return null;
  context.canvas.width = width; context.canvas.height = height;
  context.beginPath();
  for (const polygon of polygons) for (const ring of polygon) ring.forEach(([x, z], i) => {
    const px = (x - bounds.min[0]) * scale, py = (z - bounds.min[2]) * scale;
    if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
  });
  context.fill('evenodd');
  const rgba = context.getImageData(0, 0, width, height).data, mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3];
  const texture = new DataTexture(mask, width, height, RedFormat);
  texture.magFilter = LinearFilter; texture.minFilter = LinearFilter; texture.needsUpdate = true;
  return texture;
}

/**
 * Colours the scanned road by the active-layout mask, per pixel so the edge follows the 2D map's road
 * outline exactly. Without a mask the whole road is the active colour. `root` must still be in native coordinates.
 */
export function applyActiveRoad(root: Object3D, mask: DataTexture | null, bounds: {min: number[]; max: number[]}): void {
  const road = root.getObjectByName('road');
  if (!(road instanceof Mesh) || !(road.material instanceof MeshStandardMaterial)) return;
  const material = road.material;
  if (!mask) { material.color.set(ACTIVE_ROAD_COLOR); return; }
  material.color.set('#ffffff');
  const active = new Color(ACTIVE_ROAD_COLOR), other = new Color(OTHER_ROAD_COLOR);
  const vec3 = (c: Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  material.onBeforeCompile = shader => {
    shader.uniforms.activeRoad = {value: mask};
    shader.uniforms.activeRoadMin = {value: [bounds.min[0], bounds.min[2]]};
    shader.uniforms.activeRoadSpan = {value: [bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]]};
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 activeRoadMin;\nuniform vec2 activeRoadSpan;\nvarying vec2 vActiveRoadUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvActiveRoadUv = (position.xz - activeRoadMin) / activeRoadSpan;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D activeRoad;\nvarying vec2 vActiveRoadUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      float activeRoadMask = texture2D(activeRoad, vActiveRoadUv).r, activeRoadEdge = max(fwidth(activeRoadMask), 1e-3);
      diffuseColor.rgb *= mix(${vec3(other)}, ${vec3(active)}, smoothstep(0.5 - activeRoadEdge, 0.5 + activeRoadEdge, activeRoadMask));`);
  };
  material.needsUpdate = true;
}
