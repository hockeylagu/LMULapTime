import fs from 'fs';
import path from 'path';
import { Point2D, NativeTrackPoint, TrackConfig } from './trackConfigs.js';
import { decompressTrajectory } from '../../server/core/replayTrajectoryCodec.js';

const LMU_API_BASE_URL = process.env.LMU_API_BASE_URL ?? 'http://localhost:6397';
const NATIVE_TRACKMAP_CACHE = path.resolve('tools/analysis/cache/lmu_all_trackmaps.json');

export function parseNativeTrackmap(value: unknown): NativeTrackPoint[] | null {
  if (!Array.isArray(value)) return null;

  const points: NativeTrackPoint[] = [];
  for (const point of value) {
    if (typeof point !== 'object' || point === null) return null;
    const candidate = point as Record<string, unknown>;
    if (
      typeof candidate.type !== 'number' || !Number.isInteger(candidate.type) ||
      typeof candidate.x !== 'number' || !Number.isFinite(candidate.x) ||
      typeof candidate.y !== 'number' || !Number.isFinite(candidate.y) ||
      typeof candidate.z !== 'number' || !Number.isFinite(candidate.z)
    ) {
      return null;
    }
    points.push({ type: candidate.type, x: candidate.x, y: candidate.y, z: candidate.z });
  }

  return points.length > 0 ? points : null;
}

export async function loadNativeTrackmap(trackId: string): Promise<NativeTrackPoint[]> {
  if (fs.existsSync(NATIVE_TRACKMAP_CACHE)) {
    try {
      const cachedMaps: unknown = JSON.parse(fs.readFileSync(NATIVE_TRACKMAP_CACHE, 'utf8'));
      if (typeof cachedMaps === 'object' && cachedMaps !== null) {
        const cachedTrackmap = parseNativeTrackmap((cachedMaps as Record<string, unknown>)[trackId]);
        if (cachedTrackmap) {
          console.log(`Loaded cached LMU trackmap for ${trackId} from ${NATIVE_TRACKMAP_CACHE}`);
          return cachedTrackmap;
        }
      }
      console.warn(`Cache has no valid trackmap for ${trackId}; trying LMU API`);
    } catch (error) {
      console.warn(`Could not read LMU trackmap cache; trying LMU API:`, error);
    }
  }

  const apiUrl = `${LMU_API_BASE_URL}/rest/race/track/${trackId}/trackmap`;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const trackmap = parseNativeTrackmap(await response.json() as unknown);
    if (!trackmap) throw new Error('response did not contain valid track points');
    console.log(`Loaded LMU API trackmap for ${trackId} from ${apiUrl}`);
    return trackmap;
  } catch (error) {
    throw new Error(
      `Could not load LMU trackmap for ${trackId} from cache or running LMU API (${apiUrl})`,
      { cause: error }
    );
  }
}

export function parseTumCsv(content: string): Array<{ x: number; y: number; wRight: number; wLeft: number }> {
  const lines = content.trim().split(/\r?\n/);
  const pts: Array<{ x: number; y: number; wRight: number; wLeft: number }> = [];
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const parts = line.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 4 && !isNaN(parts[0])) {
      pts.push({ x: parts[0], y: parts[1], wRight: parts[2], wLeft: parts[3] });
    }
  }
  return pts;
}

export function gpsToLocalMeters(coords: Array<[number, number]>): Point2D[] {
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of coords) {
    sumLon += lon; sumLat += lat;
  }
  const lon0 = sumLon / coords.length, lat0 = sumLat / coords.length;
  const R = 6378137.0;
  const lat0Rad = (lat0 * Math.PI) / 180;
  return coords.map(([lon, lat]) => {
    const dLon = ((lon - lon0) * Math.PI) / 180;
    const dLat = ((lat - lat0) * Math.PI) / 180;
    return {
      x: dLon * R * Math.cos(lat0Rad),
      y: dLat * R,
    };
  });
}

export function resamplePolyline(pts: Point2D[], numSamples: number): Point2D[] {
  const n = pts.length;
  const cumDists = [0];
  for (let i = 1; i < n; i++) {
    cumDists.push(cumDists[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cumDists[n - 1];
  const step = total / numSamples;
  const res: Point2D[] = [];
  let curr = 0;
  for (let i = 0; i < numSamples; i++) {
    const target = i * step;
    while (curr < n - 2 && cumDists[curr + 1] < target) curr++;
    const seg = cumDists[curr + 1] - cumDists[curr];
    const t = seg > 0 ? (target - cumDists[curr]) / seg : 0;
    res.push({
      x: pts[curr].x + t * (pts[curr + 1].x - pts[curr].x),
      y: pts[curr].y + t * (pts[curr + 1].y - pts[curr].y),
    });
  }
  return res;
}

export function resampleStep(pts: Point2D[], stepM: number = 2.5): Point2D[] {
  const clean: Point2D[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = clean[clean.length - 1];
    const d = Math.hypot(pts[i].x - last.x, pts[i].y - last.y);
    if (d >= 0.3) clean.push(pts[i]);
  }
  const n = clean.length;
  const cumDists = [0];
  for (let i = 1; i < n; i++) {
    cumDists.push(cumDists[i - 1] + Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y));
  }
  const total = cumDists[n - 1];
  const numSteps = Math.floor(total / stepM);
  const res: Point2D[] = [];
  let curr = 0;
  for (let i = 0; i < numSteps; i++) {
    const target = i * stepM;
    while (curr < n - 2 && cumDists[curr + 1] < target) curr++;
    const seg = cumDists[curr + 1] - cumDists[curr];
    const t = seg > 0 ? (target - cumDists[curr]) / seg : 0;
    res.push({
      x: clean[curr].x + t * (clean[curr + 1].x - clean[curr].x),
      y: clean[curr].y + t * (clean[curr + 1].y - clean[curr].y),
    });
  }
  return res;
}

export function smoothPolyline(pts: Point2D[], windowSize: number = 5): Point2D[] {
  const m = pts.length;
  const half = Math.floor(windowSize / 2);
  const smoothed: Point2D[] = [];
  for (let i = 0; i < m; i++) {
    let sx = 0, sy = 0;
    for (let k = -half; k <= half; k++) {
      const idx = (i + k + m) % m;
      sx += pts[idx].x;
      sy += pts[idx].y;
    }
    smoothed.push({ x: sx / windowSize, y: sy / windowSize });
  }
  return smoothed;
}

export function computeCorridorBoundaries(centerline: Point2D[], halfWidthM: number, isClosed: boolean = true): { left: Point2D[]; right: Point2D[] } {
  const m = centerline.length;
  const left: Point2D[] = [];
  const right: Point2D[] = [];

  for (let i = 0; i < m; i++) {
    const prev = isClosed ? centerline[(i - 1 + m) % m] : centerline[Math.max(0, i - 1)];
    const next = isClosed ? centerline[(i + 1) % m] : centerline[Math.min(m - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;

    const nx = -ty;
    const ny = tx;

    left.push({
      x: Number((centerline[i].x + nx * halfWidthM).toFixed(2)),
      y: Number((centerline[i].y + ny * halfWidthM).toFixed(2)),
    });
    right.push({
      x: Number((centerline[i].x - nx * halfWidthM).toFixed(2)),
      y: Number((centerline[i].y - ny * halfWidthM).toFixed(2)),
    });
  }

  return { left, right };
}

export function findSimilarityTransform(source: Point2D[], target: Point2D[]): {
  scale: number;
  rotationRad: number;
  tx: number;
  ty: number;
  rmse: number;
} {
  const n = Math.min(source.length, target.length);
  let srcMx = 0, srcMy = 0, tgtMx = 0, tgtMy = 0;
  for (let i = 0; i < n; i++) {
    srcMx += source[i].x; srcMy += source[i].y;
    tgtMx += target[i].x; tgtMy += target[i].y;
  }
  srcMx /= n; srcMy /= n; tgtMx /= n; tgtMy /= n;

  let srcVar = 0, sxx = 0, sxy = 0, syx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const sx = source[i].x - srcMx, sy = source[i].y - srcMy;
    const tx = target[i].x - tgtMx, ty = target[i].y - tgtMy;
    srcVar += sx * sx + sy * sy;
    sxx += sx * tx; sxy += sx * ty;
    syx += sy * tx; syy += sy * ty;
  }

  const a = (sxx + syy) / srcVar;
  const b = (sxy - syx) / srcVar;
  const scale = Math.hypot(a, b);
  const rotationRad = Math.atan2(b, a);
  const cosT = Math.cos(rotationRad), sinT = Math.sin(rotationRad);
  const tx = tgtMx - scale * (cosT * srcMx - sinT * srcMy);
  const ty = tgtMy - scale * (sinT * srcMx + cosT * srcMy);

  let sqErr = 0;
  for (let i = 0; i < n; i++) {
    const px = scale * (cosT * source[i].x - sinT * source[i].y) + tx;
    const py = scale * (sinT * source[i].x + cosT * source[i].y) + ty;
    sqErr += (px - target[i].x) ** 2 + (py - target[i].y) ** 2;
  }

  return { scale, rotationRad, tx, ty, rmse: Math.sqrt(sqErr / n) };
}

export function loadReplayLap(db: any, filename: string, lapKey: number): Array<{ x: number; z: number }> {
  // The player's laps are keyed by their real slot; -1 is only a pointer in replay_trajectory_defaults.
  let row = db.prepare(`
    SELECT rt.trajectory_br FROM replay_trajectories rt
    JOIN replay_trajectory_defaults d
      ON d.filename = rt.filename AND d.driver_slot = -1 AND d.resolved_driver_slot = rt.driver_slot
    WHERE (rt.filename = ? OR rt.filename LIKE ?) AND rt.lap_key = ?
  `).get(filename, `%${filename}%`, lapKey);
  if (!row) {
    row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE (filename = ? OR filename LIKE ?) AND lap_key = ? ORDER BY points_count DESC').get(filename, `%${filename}%`, lapKey);
  }
  if (!row) {
    row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE (filename = ? OR filename LIKE ?) ORDER BY points_count DESC LIMIT 1').get(filename, `%${filename}%`);
  }
  if (!row) {
    throw new Error(`Replay trajectory not found for ${filename}`);
  }
  const data = decompressTrajectory(row.trajectory_br);
  return data.points.map(p => ({ x: p.x, z: p.z }));
}

export function getVenuePrefix(replayPattern: string): string {
  const venueMatch = replayPattern.match(/^(.*?)\s+(?:P|Q|R|FP)\d+\s+\d+\.Vcr$/i);
  return venueMatch ? venueMatch[1] : replayPattern.replace(/\.Vcr$/i, '');
}

export function extractTrackGateSamples(db: any, layoutKey: string, replayPattern: string): {
  sfSamples: Point2D[];
  s1Samples: Point2D[];
  s2Samples: Point2D[];
} {
  const venuePrefix = getVenuePrefix(replayPattern);

  let rows = db.prepare(`
    SELECT rt.trajectory_br FROM replay_trajectories rt
    JOIN replay_trajectory_defaults d
      ON d.filename = rt.filename AND d.driver_slot = -1 AND d.resolved_driver_slot = rt.driver_slot
    WHERE (rt.filename = ? OR rt.filename LIKE ?)
      AND rt.lap_key >= 1
    ORDER BY rt.filename, rt.lap_key
    LIMIT 40
  `).all(replayPattern, `${venuePrefix} %`);

  if (rows.length === 0) {
    const cleanKey = layoutKey.replace(/_(gp|full|short|wec|classic|chicane|outer|paddock|school|curvagrande|road_course)$/i, '');
    console.warn(`[${layoutKey}] No replays matched venue prefix "${venuePrefix}", falling back to broader "${cleanKey}" match.`);
    rows = db.prepare(`
      SELECT rt.trajectory_br FROM replay_trajectories rt
      JOIN replay_trajectory_defaults d
        ON d.filename = rt.filename AND d.driver_slot = -1 AND d.resolved_driver_slot = rt.driver_slot
      WHERE rt.filename LIKE ?
        AND rt.lap_key >= 1
      ORDER BY rt.filename, rt.lap_key
      LIMIT 40
    `).all(`%${cleanKey}%`);
  }

  const sfSamples: Point2D[] = [];
  const s1Samples: Point2D[] = [];
  const s2Samples: Point2D[] = [];

  for (const r of rows as any[]) {
    try {
      const d = decompressTrajectory(r.trajectory_br);
      if (!d.points || d.points.length < 10) continue;

      const p0 = d.points[0];
      sfSamples.push({ x: p0.x, y: p0.z });

      const plast = d.points[d.points.length - 1];
      if (Math.hypot(plast.x - p0.x, plast.z - p0.z) < 40) {
        sfSamples.push({ x: plast.x, y: plast.z });
      }

      if (d.sectors) {
        if (d.sectors.s1Frame && d.points[d.sectors.s1Frame]) {
          const p = d.points[d.sectors.s1Frame];
          s1Samples.push({ x: p.x, y: p.z });
        }
        if (d.sectors.s2Frame && d.points[d.sectors.s2Frame]) {
          const p = d.points[d.sectors.s2Frame];
          s2Samples.push({ x: p.x, y: p.z });
        }
      }
    } catch {}
  }

  return { sfSamples, s1Samples, s2Samples };
}

export function applyUniformCorridorMargin(center: Point2D[], left: Point2D[], right: Point2D[], marginM: number): void {
  if (marginM <= 0) return;
  for (let i = 0; i < center.length; i++) {
    const c = center[i];
    const dl = { x: left[i].x - c.x, y: left[i].y - c.y };
    const lenL = Math.hypot(dl.x, dl.y) || 1e-6;
    left[i] = { x: Number((c.x + (dl.x / lenL) * (lenL + marginM)).toFixed(2)), y: Number((c.y + (dl.y / lenL) * (lenL + marginM)).toFixed(2)) };

    const dr = { x: right[i].x - c.x, y: right[i].y - c.y };
    const lenR = Math.hypot(dr.x, dr.y) || 1e-6;
    right[i] = { x: Number((c.x + (dr.x / lenR) * (lenR + marginM)).toFixed(2)), y: Number((c.y + (dr.y / lenR) * (lenR + marginM)).toFixed(2)) };
  }
}

export function fitGateLine(
  samples: Point2D[],
  fallbackPoint: Point2D,
  trackTangent: Point2D
): { point: Point2D; dir: Point2D } {
  if (samples.length < 2) {
    return { point: fallbackPoint, dir: { x: -trackTangent.y, y: trackTangent.x } };
  }

  const meanX = samples.reduce((a, b) => a + b.x, 0) / samples.length;
  const meanY = samples.reduce((a, b) => a + b.y, 0) / samples.length;

  let sxx = 0, sxy = 0, syy = 0;
  for (const p of samples) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  const variance = (sxx + syy) / samples.length;
  if (variance < 0.25) {
    return { point: { x: meanX, y: meanY }, dir: { x: -trackTangent.y, y: trackTangent.x } };
  }

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let dirX = Math.cos(theta);
  let dirY = Math.sin(theta);

  const cross = trackTangent.x * dirY - trackTangent.y * dirX;
  if (cross < 0) {
    dirX = -dirX;
    dirY = -dirY;
  }

  return { point: { x: meanX, y: meanY }, dir: { x: dirX, y: dirY } };
}

export function intersectLineWithPolyline(
  linePoint: Point2D,
  lineDir: Point2D,
  polyline: Point2D[],
  maxDistanceM: number = 35
): { point: Point2D; index: number } | null {
  const nx = -lineDir.y;
  const ny = lineDir.x;
  const m = polyline.length;
  let bestInter: { point: Point2D; index: number; dist: number } | null = null;

  for (let i = 0; i < m; i++) {
    const p1 = polyline[i];
    const p2 = polyline[(i + 1) % m];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const denom = dx * nx + dy * ny;
    if (Math.abs(denom) < 1e-6) continue;

    const s = ((linePoint.x - p1.x) * nx + (linePoint.y - p1.y) * ny) / denom;
    if (s >= 0 && s <= 1) {
      const ix = p1.x + s * dx;
      const iy = p1.y + s * dy;
      const dist = Math.hypot(ix - linePoint.x, iy - linePoint.y);
      if (dist > maxDistanceM) continue;

      if (!bestInter || dist < bestInter.dist) {
        bestInter = {
          point: { x: Number(ix.toFixed(2)), y: Number(iy.toFixed(2)) },
          index: i + s,
          dist,
        };
      }
    }
  }

  return bestInter ? { point: bestInter.point, index: bestInter.index } : null;
}

export function findClosestOnPolyline(target: Point2D, polyline: Point2D[]): { point: Point2D; index: number } {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < polyline.length; i++) {
    const d = Math.hypot(polyline[i].x - target.x, polyline[i].y - target.y);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { point: polyline[bestIdx], index: bestIdx };
}

export function findConsensusCluster(samples: Point2D[], radiusM: number, minCount: number): Point2D[] | null {
  let best: Point2D[] = [];
  for (const seed of samples) {
    const cluster = samples.filter(p => Math.hypot(p.x - seed.x, p.y - seed.y) <= radiusM);
    if (cluster.length > best.length) best = cluster;
  }
  return best.length >= minCount ? best : null;
}

export function rollPolyline(polyline: Point2D[], shift: number, exactPoint0?: Point2D): Point2D[] {
  const m = polyline.length;
  const k = ((Math.round(shift) % m) + m) % m;
  const rolled: Point2D[] = [];
  for (let i = 0; i < m; i++) {
    rolled.push(polyline[(i + k) % m]);
  }
  if (exactPoint0) {
    rolled[0] = { x: Number(exactPoint0.x.toFixed(2)), y: Number(exactPoint0.y.toFixed(2)) };
  }
  return rolled;
}

export function rollNumberArray(arr: number[], shift: number): number[] {
  const m = arr.length;
  const k = ((Math.round(shift) % m) + m) % m;
  const rolled: number[] = [];
  for (let i = 0; i < m; i++) {
    rolled.push(arr[(i + k) % m]);
  }
  return rolled;
}

export function computeStationAlongPolyline(polyline: Point2D[], targetIndex: number): number {
  const m = polyline.length;
  let dist = 0;
  const fullIdx = Math.floor(targetIndex);
  const frac = targetIndex - fullIdx;
  for (let i = 0; i < fullIdx && i < m; i++) {
    const p1 = polyline[i];
    const p2 = polyline[(i + 1) % m];
    dist += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  if (frac > 0 && fullIdx < m) {
    const p1 = polyline[fullIdx];
    const p2 = polyline[(fullIdx + 1) % m];
    dist += frac * Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  return dist;
}

export async function ensureSourceFile(cfg: TrackConfig): Promise<string> {
  const cacheDir = path.resolve('tools/analysis/cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const localPath = path.join(cacheDir, cfg.sourceFile!);
  if (fs.existsSync(localPath)) return localPath;

  if (cfg.sourceType === 'TUM') {
    const url = `https://raw.githubusercontent.com/TUMFTM/racetrack-database/master/tracks/${cfg.sourceFile}`;
    console.log(`Downloading TUM source: ${url}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download TUM file: ${res.statusText}`);
    fs.writeFileSync(localPath, await res.text(), 'utf8');
  } else if (cfg.sourceType === 'atlas') {
    const parts = cfg.sourceFile!.replace('.geojson', '').split('_');
    const slug = parts[0];
    const layer = parts.slice(1).join('_');
    const url = `https://raw.githubusercontent.com/tobi/track-atlas/main/tracks/${slug}/raw/layers/${layer}.geojson`;
    console.log(`Downloading Track-Atlas source: ${url}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download Track-Atlas file: ${res.statusText}`);
    fs.writeFileSync(localPath, await res.text(), 'utf8');
  } else if (cfg.sourceType === 'osm') {
    console.log(`Fetching OpenStreetMap relation ${cfg.osmRelationId}...`);
    const res = await fetch(`https://api.openstreetmap.org/api/0.6/relation/${cfg.osmRelationId}/full.json`, {
      headers: { 'User-Agent': 'LMULapTime-Analyzer/1.0' },
    });
    if (!res.ok) throw new Error(`Failed to fetch OSM relation ${cfg.osmRelationId}: ${res.statusText}`);
    const data = await res.json();
    const nodesMap = new Map<number, [number, number]>();
    for (const e of (data as any).elements) {
      if (e.type === 'node') nodesMap.set(e.id, [e.lon, e.lat]);
    }
    const rel = (data as any).elements.find((e: any) => e.type === 'relation');
    let wayOrder: number[] = [];
    if (cfg.osmRelationId === 5254136) {
      wayOrder = [
        352067004, 352070311, 198466856, 352070316, 352696267,
        352104911, 352104914, 1315971773, 352070313, 352104912,
        352070310, 352070308
      ];
    } else if (rel) {
      wayOrder = rel.members.filter((m: any) => m.type === 'way').map((m: any) => m.ref);
    }
    const waysMap = new Map<number, any>();
    for (const e of (data as any).elements) {
      if (e.type === 'way') waysMap.set(e.id, e);
    }
    const coords: Array<[number, number]> = [];
    for (const wid of wayOrder) {
      const w = waysMap.get(wid);
      if (w) {
        for (let i = 0; i < w.nodes.length - 1; i++) {
          const pt = nodesMap.get(w.nodes[i]);
          if (pt) coords.push(pt);
        }
      }
    }
    if (coords.length > 0) coords.push(coords[0]);
    const geojson = {
      type: 'FeatureCollection',
      name: `${cfg.trackCourse} (OpenStreetMap)`,
      features: [
        {
          type: 'Feature',
          properties: { name: cfg.trackCourse, source: `OpenStreetMap relation ${cfg.osmRelationId}` },
          geometry: { type: 'LineString', coordinates: coords },
        },
      ],
    };
    fs.writeFileSync(localPath, JSON.stringify(geojson, null, 2), 'utf8');
  }
  return localPath;
}
