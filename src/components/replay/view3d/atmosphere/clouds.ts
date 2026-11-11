import type { SceneryClouds, SceneryCloudMaterial, ScenerySunVisibility } from '../../../../../shared/types/scenes/clouds.js';

/** The replay's cloud field at a moment (ReplayDaylightClock.cloudField). */
export interface CloudMoment { cells: string; upperDrift: number; lowerDrift: number; startUpperDrift: number; startLowerDrift: number; variants?: string[] }

interface CellPhase { layer: 'lower' | 'upper'; index: number; code: number; p: number; remaining: number; a: number; b: number; centreLine: boolean }

/** Each cell's layer, code and grid phase p = (drift + offset + 0.5) mod n; its cloud is shown while n − p − endMargin > 0. */
function cellPhases(clouds: SceneryClouds, moment: CloudMoment): CellPhase[] {
  return clouds.cells.map(([offset, a, b, centreLine], cell) => {
    const lower = cell < clouds.lowerCells, layer = lower ? 'lower' : 'upper', n = clouds.layers[layer].cells;
    const p = (((lower ? moment.lowerDrift : moment.upperDrift) + offset + 0.5) % n + n) % n;
    return { layer, index: lower ? cell : cell - clouds.lowerCells, code: parseInt(moment.cells[cell] ?? 'f', 16), p, remaining: n - p - clouds.placement.endMargin, a, b, centreLine: centreLine === 1 };
  });
}

/**
 * The cloud coverage (0 clear to 1 overcast): per layer the mean darkness of the shown clouds, each cell weighted by
 * 1 − falloff·min(1, grid distance·2 / n); the larger layer counts, at most 1.
 */
export function cloudCoverage(clouds: SceneryClouds, moment: CloudMoment): number {
  const sums = { lower: [0, 0], upper: [0, 0] };
  for (const cell of cellPhases(clouds, moment)) {
    const w = 1 - clouds.coverage.falloff * Math.min(1, Math.hypot(cell.p + cell.b, cell.p + cell.a) * 2 / clouds.layers[cell.layer].cells);
    if (cell.remaining > 0) sums[cell.layer][0] += w * (clouds.types[clouds.codes[cell.code]]?.darkness ?? 0);
    sums[cell.layer][1] += w;
  }
  return Math.min(1, Math.max(sums.lower[0] / sums.lower[1], sums.upper[0] / sums.upper[1]));
}

/**
 * One placed cloud sheet: its vertices relative to the eye (m), the mesh's UVs and triangles, its fade and its type's materials.
 * `frame` is each vertex's tangent, binormal and normal turned with the sheet (nine values per vertex), which its light maps are read in.
 */
export interface CloudSheet {
  vertices: Float64Array; uvs: number[]; triangles: number[]; fade: number; materials: SceneryCloudMaterial[]; frame: Float32Array;
  /** Bounding sphere of the vertices. */
  centre: [number, number, number]; radius: number;
}

/**
 * The cloud sheets of a moment, placed around an eye at height `eyeY` (m). A cell's grid position follows its layer's drift; the
 * sheet sinks toward the field's edge and while it is young (age = drift since the replay's first weather sample plus the start
 * age), fades in and out at the ends of its run, and turns to face the centre (side cells) or along the drift (centre-line cells).
 * A sheet has its code's material when the moment names the variant (the material whose name ends with the id), else all of the type's.
 */
export function cloudSheets(clouds: SceneryClouds, moment: CloudMoment, eyeY: number): CloudSheet[] {
  const { placement: P, averagedInputs: A } = clouds, sheets: CloudSheet[] = [];
  for (const cell of cellPhases(clouds, moment)) {
    const type = clouds.types[clouds.codes[cell.code]], layer = clouds.layers[cell.layer], n = layer.cells, lower = cell.layer === 'lower';
    const meshKey = type ? (cell.centreLine ? type.centreLineMesh : type.sideMesh) : null, mesh = meshKey ? clouds.meshes[meshKey] : undefined;
    if (!type || !mesh || cell.remaining <= 0) continue;
    const age = (lower ? moment.lowerDrift - moment.startLowerDrift : moment.upperDrift - moment.startUpperDrift) + A.startAgeCells;
    const m = Math.min(age, cell.remaining), fade = Math.min(1, P.fadeGain * Math.max(0, m));
    let x = cell.p + cell.a + layer.jitter * A.jitter, z = cell.p + cell.b - layer.jitter * A.jitter;
    const d = Math.hypot(x, z);
    if (type.pushNearCentre && cell.centreLine && d < P.pushRadius) {
      const k = (z < x ? 1 : -1) * P.push * (1 - Math.cos(Math.PI - d * Math.PI / 2));
      x += k; z -= k;
    }
    const s = P.gridScale * layer.spacingM, X = s * x, Z = s * z, r = Math.min(1, Math.hypot(X, Z) / (n * layer.spacingM / 2));
    const H = layer.heightM + cell.index * clouds.height.perCellM + cell.code * clouds.height.perCodeM + type.heightOffsetM, k = Math.max(0, eyeY / H);
    const Y = eyeY * k / (k + 1) + H - P.edgeDrop * H * r * r - P.riseDrop * H * (1 - Math.min(1, m)) - eyeY;
    let pitch: number, yaw: number, roll = 0;
    if (!cell.centreLine || type.pushNearCentre) { pitch = P.edgePitchRad * r; yaw = Math.PI - Math.atan2(X, -Z); }
    else {
      const u = 2 * cell.remaining / n - 1;
      pitch = -P.centreLinePitchRad * u; yaw = P.centreLineYawRad; roll = P.centreLineRollRad * (Z - X) / (s * n) * (1 - u * u);
    }
    // R = Ry(yaw)·Rx(pitch)·Rz(roll), applied to column vectors.
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
    const R = [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx, cx * sz, cx * cz, -sx, -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx];
    const count = mesh.positions.length / 3, vertices = new Float64Array(count * 3), centre: [number, number, number] = [0, 0, 0], frame = new Float32Array(count * 9);
    for (let v = 0; v < count; v++) {
      const px = mesh.positions[v * 3], py = mesh.positions[v * 3 + 1], pz = mesh.positions[v * 3 + 2];
      const out = [R[0] * px + R[1] * py + R[2] * pz + X, R[3] * px + R[4] * py + R[5] * pz + Y, R[6] * px + R[7] * py + R[8] * pz + Z];
      for (let c = 0; c < 3; c++) { vertices[v * 3 + c] = out[c]; centre[c] += out[c] / count; }
      [mesh.tangents, mesh.binormals, mesh.normals].forEach((axis, k) => {
        const ax = axis[v * 3], ay = axis[v * 3 + 1], az = axis[v * 3 + 2];
        for (let c = 0; c < 3; c++) frame[v * 9 + k * 3 + c] = R[c * 3] * ax + R[c * 3 + 1] * ay + R[c * 3 + 2] * az;
      });
    }
    let radius = 0;
    for (let v = 0; v < count; v++) radius = Math.max(radius, Math.hypot(vertices[v * 3] - centre[0], vertices[v * 3 + 1] - centre[1], vertices[v * 3 + 2] - centre[2]));
    const variant = moment.variants?.[cell.code], named = variant ? type.materials.filter(material => material.name.endsWith(variant)) : [];
    sheets.push({ vertices, uvs: mesh.uvs, triangles: mesh.triangles, fade, materials: named.length ? named : type.materials, frame, centre, radius });
  }
  return sheets;
}

type MapSampler = (u: number, v: number) => number;

/** A wrapping bilinear reader (0 to 1) of an opacity map's first level. */
function mapSampler(map: { width: number; height: number; mips: string[] }): MapSampler {
  const { width, height } = map, bytes = Uint8Array.from(atob(map.mips[0]), c => c.charCodeAt(0));
  const at = (x: number, y: number) => bytes[((y % height + height) % height) * width + (x % width + width) % width] / 255;
  return (u, v) => {
    const x = u * width - 0.5, y = v * height - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
}

/**
 * How much of the sun's light passes the clouds (ScenerySunVisibility): the sheets' alpha summed over a square view from the eye
 * toward the sun, one ray per texel. A sheet's materials count equally (all of its type's when the replay names no variant). The
 * sheets' alphas add up where they overlap. The view's far limit is not applied: the sheets lie beyond it and still count.
 */
export function sunVisibility(rule: ScenerySunVisibility, clouds: SceneryClouds, sheets: CloudSheet[], sunDirection: [number, number, number], rain = 0): number {
  const length = Math.hypot(...sunDirection), f = sunDirection.map(c => c / length), { limit, gain } = rule.horizon;
  if (f[1] <= limit) return 0;
  const horizon = Math.min(1, Math.max(0, (f[1] - limit) * gain)), size = rule.view.resolution, tan = Math.tan(rule.view.fovRad / 2);
  // A view frame around the sun direction; its roll does not change the sum.
  const side = Math.abs(f[1]) < 0.99 ? [f[2], 0, -f[0]] : [1, 0, 0], sideLength = Math.hypot(...side), right = side.map(c => c / sideLength);
  const up = [f[1] * right[2] - f[2] * right[1], f[2] * right[0] - f[0] * right[2], f[0] * right[1] - f[1] * right[0]];
  const coneCos = Math.cos(Math.atan(tan * Math.SQRT2)), coneSin = Math.sqrt(1 - coneCos * coneCos);
  const inView = sheets.filter(sheet => {
    const distance = Math.hypot(...sheet.centre), along = (sheet.centre[0] * f[0] + sheet.centre[1] * f[1] + sheet.centre[2] * f[2]);
    const across = Math.sqrt(Math.max(0, distance * distance - along * along));
    // Outside the cone widened by the sheet's radius: no ray can reach it.
    return along * coneSin - across * coneCos > -sheet.radius;
  });
  const samplers = new Map<string, MapSampler>();
  const sample = (material: SceneryCloudMaterial, u: number, v: number) => {
    let sampler = samplers.get(material.cloudMap);
    if (!sampler) { sampler = mapSampler(clouds.maps[material.cloudMap]); samplers.set(material.cloudMap, sampler); }
    return sampler(u, v);
  };
  let sum = 0;
  for (let j = 0; j < size && inView.length; j++) for (let i = 0; i < size; i++) {
    const a = ((i + 0.5) / size * 2 - 1) * tan, b = ((j + 0.5) / size * 2 - 1) * tan;
    const dx = f[0] + right[0] * a + up[0] * b, dy = f[1] + right[1] * a + up[1] * b, dz = f[2] + right[2] * a + up[2] * b;
    let alpha = 0;
    for (const sheet of inView) {
      const hit = sheetHit(sheet, dx, dy, dz);
      if (!hit) continue;
      let mean = 0;
      for (const material of sheet.materials) {
        const s = material.opacity.visibility * sheet.fade * (1 - material.opacity.randomRange * clouds.averagedInputs.red);
        const power = clouds.alpha.powerFrom + (clouds.alpha.powerTo - clouds.alpha.powerFrom) * s;
        mean += Math.min(1, Math.max(0, clouds.alpha.gain * s)) * sample(material, hit[0], hit[1]) ** power * material.opacity.scalar / sheet.materials.length;
      }
      alpha += mean;
    }
    sum += alpha;
  }
  const { bias, dryMax, wetMax } = rule.occlusion;
  const occlusion = Math.sqrt(Math.min(1, Math.max(0, (bias + sum) / (size * size)))) * (dryMax + (wetMax - dryMax) * rain);
  return (1 - occlusion) * horizon;
}

/** Where a ray from the eye along (dx, dy, dz) meets a sheet: the UV there, or null. A sheet is one surface, so the first triangle hit is it. */
function sheetHit(sheet: CloudSheet, dx: number, dy: number, dz: number): [number, number] | null {
  const { vertices: p, triangles, uvs } = sheet;
  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t], i1 = triangles[t + 1], i2 = triangles[t + 2], a = i0 * 3, b = i1 * 3, c = i2 * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2], e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-9) continue;
    // The ray starts at the eye (the origin), so the offset to the first vertex is minus that vertex.
    const sx = -p[a], sy = -p[a + 1], sz = -p[a + 2], u = (sx * hx + sy * hy + sz * hz) / det;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dy * qy + dz * qz) / det;
    if (v < 0 || u + v > 1 || (e2x * qx + e2y * qy + e2z * qz) / det <= 0) continue;
    const w = 1 - u - v;
    return [uvs[i0 * 2] * w + uvs[i1 * 2] * u + uvs[i2 * 2] * v, uvs[i0 * 2 + 1] * w + uvs[i1 * 2 + 1] * u + uvs[i2 * 2 + 1] * v];
  }
  return null;
}
