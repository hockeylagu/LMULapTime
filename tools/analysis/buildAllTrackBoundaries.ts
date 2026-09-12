import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import zlib from 'zlib';

export interface Point2D {
  x: number;
  y: number;
}

export interface TrackBoundaryGeometry {
  layoutKey: string;
  circuitId: string;
  layoutId: string;
  trackVenue: string;
  trackCourse: string;
  lengthM: number;
  source: 'TUM-survey' | 'track-atlas' | 'OSM-FIA-profile' | 'telemetry-corridor';
  transform?: {
    scale: number;
    rotationDeg: number;
    tx: number;
    tz: number;
    rmse: number;
  };
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    spanX: number;
    spanZ: number;
  };
  leftBoundary: Array<[number, number]>;
  rightBoundary: Array<[number, number]>;
  centerline: Array<[number, number]>;
  nominalWidthM: number;
  createdAt: string;
}

export interface TrackConfig {
  layoutKey: string;
  circuitId: string;
  layoutId: string;
  trackVenue: string;
  trackCourse: string;
  sourceType: 'TUM' | 'atlas' | 'telemetry';
  sourceFile?: string;
  replayPattern: string;
  preferredLap?: number;
  nominalWidthM: number;
}

// 21 Track Configurations across all driven tracks and layouts
export const TRACK_CONFIGS: TrackConfig[] = [
  // 1. Monza GP
  {
    layoutKey: 'monza_gp',
    circuitId: 'monza',
    layoutId: 'gp',
    trackVenue: 'Autodromo Nazionale Monza',
    trackCourse: 'Autodromo Nazionale Monza',
    sourceType: 'TUM',
    sourceFile: 'Monza.csv',
    replayPattern: 'Autodromo Nazionale Monza P1 18.Vcr',
    preferredLap: 1,
    nominalWidthM: 12.0,
  },
  // 2. Monza Curva Grande
  {
    layoutKey: 'monza_curvagrande',
    circuitId: 'monza',
    layoutId: 'curvagrande',
    trackVenue: 'Autodromo Nazionale Monza',
    trackCourse: 'Monza Curva Grande Circuit',
    sourceType: 'telemetry',
    replayPattern: 'Monza Curva Grande Circuit P1 15.Vcr',
    preferredLap: 3,
    nominalWidthM: 12.0,
  },
  // 3. Spa-Francorchamps
  {
    layoutKey: 'spa_gp',
    circuitId: 'spa',
    layoutId: 'gp',
    trackVenue: 'Circuit de Spa-Francorchamps',
    trackCourse: 'Circuit de Spa-Francorchamps',
    sourceType: 'TUM',
    sourceFile: 'Spa.csv',
    replayPattern: 'Circuit de Spa-Francorchamps P1 80.Vcr',
    preferredLap: 1,
    nominalWidthM: 14.0,
  },
  // 4. Circuit de la Sarthe (24h Le Mans)
  {
    layoutKey: 'sarthe_full',
    circuitId: 'sarthe',
    layoutId: 'full',
    trackVenue: 'Circuit de la Sarthe',
    trackCourse: 'Circuit de la Sarthe',
    sourceType: 'atlas',
    sourceFile: 'circuit-de-la-sarthe_24h.geojson',
    replayPattern: 'Circuit de la Sarthe P1 43.Vcr',
    preferredLap: 2,
    nominalWidthM: 12.5,
  },
  // 5. Circuit of the Americas
  {
    layoutKey: 'cota_gp',
    circuitId: 'cota',
    layoutId: 'gp',
    trackVenue: 'Circuit of the Americas',
    trackCourse: 'Circuit of the Americas',
    sourceType: 'TUM',
    sourceFile: 'Austin.csv',
    replayPattern: 'Circuit of the Americas P1 2.Vcr',
    preferredLap: 2,
    nominalWidthM: 14.0,
  },
  // 6. Circuit de Barcelona-Catalunya
  {
    layoutKey: 'barcelona_gp',
    circuitId: 'barcelona',
    layoutId: 'gp',
    trackVenue: 'Circuit de Barcelona',
    trackCourse: 'Circuit de Barcelona',
    sourceType: 'TUM',
    sourceFile: 'Catalunya.csv',
    replayPattern: 'Circuit de Barcelona P1 1.Vcr',
    preferredLap: 1,
    nominalWidthM: 12.0,
  },
  // 7. Autódromo José Carlos Pace (Interlagos)
  {
    layoutKey: 'interlagos_gp',
    circuitId: 'interlagos',
    layoutId: 'gp',
    trackVenue: 'Autódromo José Carlos Pace',
    trackCourse: 'Autódromo José Carlos Pace',
    sourceType: 'TUM',
    sourceFile: 'SaoPaulo.csv',
    replayPattern: 'Aut+~c3+~b3dromo Jos+~c3+~a9 Carlos Pace P1 1.Vcr',
    preferredLap: 2,
    nominalWidthM: 13.0,
  },
  // 8. Silverstone GP (WEC)
  {
    layoutKey: 'silverstone_wec',
    circuitId: 'silverstone',
    layoutId: 'gp',
    trackVenue: 'Silverstone Circuit',
    trackCourse: 'Silverstone Grand Prix Circuit - WEC',
    sourceType: 'TUM',
    sourceFile: 'Silverstone.csv',
    replayPattern: 'Silverstone Grand Prix Circuit - WEC P1 1.Vcr',
    preferredLap: 1,
    nominalWidthM: 15.0,
  },
  // 9. Bahrain International Circuit (GP)
  {
    layoutKey: 'bahrain_wec',
    circuitId: 'bahrain',
    layoutId: 'wec',
    trackVenue: 'Bahrain International Circuit',
    trackCourse: 'Bahrain International Circuit',
    sourceType: 'TUM',
    sourceFile: 'Sakhir.csv',
    replayPattern: 'Bahrain International Circuit P1 14.Vcr',
    preferredLap: 4,
    nominalWidthM: 14.0,
  },
  // 10. Bahrain Outer Circuit
  {
    layoutKey: 'bahrain_outer',
    circuitId: 'bahrain',
    layoutId: 'outer',
    trackVenue: 'Bahrain International Circuit',
    trackCourse: 'Bahrain Outer Circuit',
    sourceType: 'telemetry',
    replayPattern: 'Bahrain Outer Circuit P1 20.Vcr',
    preferredLap: 2,
    nominalWidthM: 14.0,
  },
  // 11. Bahrain Paddock Circuit
  {
    layoutKey: 'bahrain_paddock',
    circuitId: 'bahrain',
    layoutId: 'paddock',
    trackVenue: 'Bahrain International Circuit',
    trackCourse: 'Bahrain Paddock Circuit',
    sourceType: 'telemetry',
    replayPattern: 'Bahrain Paddock Circuit P1 18.Vcr',
    preferredLap: 2,
    nominalWidthM: 13.0,
  },
  // 12. Imola (Autodromo Enzo e Dino Ferrari)
  {
    layoutKey: 'imola_gp',
    circuitId: 'imola',
    layoutId: 'gp',
    trackVenue: 'Autodromo Enzo e Dino Ferrari',
    trackCourse: 'Autodromo Enzo e Dino Ferrari',
    sourceType: 'atlas',
    sourceFile: 'imola_gp.geojson',
    replayPattern: 'Autodromo Enzo e Dino Ferrari Q1 10.Vcr',
    preferredLap: 2,
    nominalWidthM: 12.0,
  },
  // 13. Daytona Road Course
  {
    layoutKey: 'daytona_road_course',
    circuitId: 'daytona',
    layoutId: 'road_course',
    trackVenue: 'Daytona International Speedway',
    trackCourse: 'Daytona International Speedway Road Course',
    sourceType: 'atlas',
    sourceFile: 'daytona_gp.geojson',
    replayPattern: 'Daytona International Speedway Road Course P1 16.Vcr',
    preferredLap: 2,
    nominalWidthM: 13.0,
  },
  // 14. Fuji Speedway (GP)
  {
    layoutKey: 'fuji_chicane',
    circuitId: 'fuji',
    layoutId: 'chicane',
    trackVenue: 'Fuji Speedway',
    trackCourse: 'Fuji Speedway',
    sourceType: 'atlas',
    sourceFile: 'fuji_gp.geojson',
    replayPattern: 'Fuji Speedway P1 53.Vcr',
    preferredLap: 2,
    nominalWidthM: 15.0,
  },
  // 15. Fuji Speedway Classic
  {
    layoutKey: 'fuji_classic',
    circuitId: 'fuji',
    layoutId: 'classic',
    trackVenue: 'Fuji Speedway',
    trackCourse: 'Fuji Speedway Classic',
    sourceType: 'telemetry',
    replayPattern: 'Fuji Speedway Classic P1 10.Vcr',
    preferredLap: 2,
    nominalWidthM: 15.0,
  },
  // 16. Algarve International Circuit (Portimão WEC 2023)
  {
    layoutKey: 'portimao_wec',
    circuitId: 'portimao',
    layoutId: 'wec',
    trackVenue: 'Algarve International Circuit',
    trackCourse: 'Algarve International Circuit',
    sourceType: 'telemetry',
    replayPattern: 'Algarve International Circuit P1 47.Vcr',
    preferredLap: 2,
    nominalWidthM: 14.0,
  },
  // 17. Sebring International Raceway (Full)
  {
    layoutKey: 'sebring_full',
    circuitId: 'sebring',
    layoutId: 'full',
    trackVenue: 'Sebring International Raceway',
    trackCourse: 'Sebring International Raceway',
    sourceType: 'atlas',
    sourceFile: 'sebring_wec.geojson',
    replayPattern: 'Sebring International Raceway P1 33.Vcr',
    preferredLap: 2,
    nominalWidthM: 12.5,
  },
  // 18. Sebring School Circuit
  {
    layoutKey: 'sebring_school',
    circuitId: 'sebring',
    layoutId: 'school',
    trackVenue: 'Sebring International Raceway',
    trackCourse: 'Sebring School Circuit',
    sourceType: 'telemetry',
    replayPattern: 'Sebring School Circuit P1 1.Vcr',
    preferredLap: 3,
    nominalWidthM: 12.0,
  },
  // 19. WeatherTech Raceway Laguna Seca
  {
    layoutKey: 'laguna_seca',
    circuitId: 'laguna_seca',
    layoutId: 'full',
    trackVenue: 'WeatherTech Raceway Laguna Seca',
    trackCourse: 'WeatherTech Raceway Laguna Seca',
    sourceType: 'atlas',
    sourceFile: 'laguna-seca_gp.geojson',
    replayPattern: 'WeatherTech Raceway Laguna Seca P1 5.Vcr',
    preferredLap: 2,
    nominalWidthM: 12.0,
  },
  // 20. Lusail Short Circuit
  {
    layoutKey: 'qatar_short',
    circuitId: 'qatar',
    layoutId: 'short',
    trackVenue: 'Lusail International Circuit',
    trackCourse: 'Lusail Short Circuit',
    sourceType: 'telemetry',
    replayPattern: 'Lusail Short Circuit P1 2.Vcr',
    preferredLap: 3,
    nominalWidthM: 12.0,
  },
  // 21. Paul Ricard - 1A-V2-Short
  {
    layoutKey: 'paul_ricard_1a_v2_short',
    circuitId: 'paul_ricard',
    layoutId: '1a_v2_short',
    trackVenue: 'Paul Ricard Circuit',
    trackCourse: 'Paul Ricard - 1A-V2-Short',
    sourceType: 'telemetry',
    replayPattern: 'Paul Ricard - 1A-V2-Short P1 2.Vcr',
    preferredLap: 2,
    nominalWidthM: 12.0,
  },
];

// Coordinate & Geometry Math Utilities
function parseTumCsv(content: string): Array<{ x: number; y: number; wRight: number; wLeft: number }> {
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

function gpsToLocalMeters(coords: Array<[number, number]>): Point2D[] {
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

function resamplePolyline(pts: Point2D[], numSamples: number): Point2D[] {
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

function resampleStep(pts: Point2D[], stepM: number = 2.5): Point2D[] {
  const clean: Point2D[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (d > 0.3) clean.push(pts[i]);
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

function smoothPolyline(pts: Point2D[], windowSize: number = 5): Point2D[] {
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

function computeCorridorBoundaries(centerline: Point2D[], halfWidthM: number): { left: Point2D[]; right: Point2D[] } {
  const m = centerline.length;
  const left: Point2D[] = [];
  const right: Point2D[] = [];

  for (let i = 0; i < m; i++) {
    const prev = centerline[(i - 1 + m) % m];
    const next = centerline[(i + 1) % m];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;

    // Normal vector perpendicular to direction of travel
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

function findSimilarityTransform(source: Point2D[], target: Point2D[]): {
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

function loadReplayLap(db: any, filename: string, lapKey: number): Array<{ x: number; z: number }> {
  let row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE filename = ? AND lap_key = ?').get(filename, lapKey);
  if (!row) {
    row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE filename = ? LIMIT 1').get(filename);
  }
  if (!row) {
    throw new Error(`Replay trajectory not found for ${filename}`);
  }
  const data = JSON.parse(zlib.brotliDecompressSync(row.trajectory_br).toString('utf8'));
  return data.points.map((p: any) => ({ x: p.x, z: p.z }));
}

async function ensureSourceFile(cfg: TrackConfig): Promise<string> {
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
  }
  return localPath;
}

export async function processTrack(cfg: TrackConfig, db: any): Promise<TrackBoundaryGeometry> {
  console.log(`\n==================================================`);
  console.log(`Processing [${cfg.layoutKey}]: ${cfg.trackVenue} - ${cfg.trackCourse}`);
  console.log(`Strategy: ${cfg.sourceType} | Nominal Width: ${cfg.nominalWidthM}m`);

  const replayLap = loadReplayLap(db, cfg.replayPattern, cfg.preferredLap || 2);
  const lmu2D = replayLap.map(p => ({ x: p.x, y: p.z }));
  const N_SAMPLE = 400;
  const lmuResampled = resamplePolyline(lmu2D, N_SAMPLE);

  let finalCenter: Point2D[] = [];
  let finalLeft: Point2D[] = [];
  let finalRight: Point2D[] = [];
  let transformInfo: any = undefined;

  if (cfg.sourceType === 'TUM') {
    const tumPath = await ensureSourceFile(cfg);
    const tumPts = parseTumCsv(fs.readFileSync(tumPath, 'utf8'));

    // Compute TUM Cartesian boundaries
    const tumCenter: Point2D[] = [];
    const tumLeft: Point2D[] = [];
    const tumRight: Point2D[] = [];
    const m = tumPts.length;

    for (let i = 0; i < m; i++) {
      const prev = tumPts[(i - 1 + m) % m];
      const next = tumPts[(i + 1) % m];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;

      tumCenter.push({ x: tumPts[i].x, y: tumPts[i].y });
      tumLeft.push({ x: tumPts[i].x + nx * tumPts[i].wLeft, y: tumPts[i].y + ny * tumPts[i].wLeft });
      tumRight.push({ x: tumPts[i].x - nx * tumPts[i].wRight, y: tumPts[i].y - ny * tumPts[i].wRight });
    }

    // Align with LMU
    const variants = [
      { name: 'normal', pts: tumCenter },
      { name: 'flipY', pts: tumCenter.map(p => ({ x: p.x, y: -p.y })) },
      { name: 'reversed', pts: [...tumCenter].reverse() },
      { name: 'reversed_flipY', pts: [...tumCenter].reverse().map(p => ({ x: p.x, y: -p.y })) },
      { name: 'flipX', pts: tumCenter.map(p => ({ x: -p.x, y: p.y })) },
      { name: 'reversed_flipX', pts: [...tumCenter].reverse().map(p => ({ x: -p.x, y: p.y })) },
    ];

    let bestVariant = variants[0];
    let bestShift = 0, minRmse = Infinity, bestTransform: any = null;

    for (const v of variants) {
      const vRes = resamplePolyline(v.pts, N_SAMPLE);
      for (let s = 0; s < N_SAMPLE; s += 2) {
        const shifted = [];
        for (let i = 0; i < N_SAMPLE; i++) shifted.push(vRes[(i + s) % N_SAMPLE]);
        const t = findSimilarityTransform(shifted, lmuResampled);
        if (t.rmse < minRmse) {
          minRmse = t.rmse;
          bestShift = s;
          bestTransform = t;
          bestVariant = v;
        }
      }
    }

    const cosT = Math.cos(bestTransform.rotationRad);
    const sinT = Math.sin(bestTransform.rotationRad);
    const scale = bestTransform.scale;
    const tx = bestTransform.tx;
    const ty = bestTransform.ty;

    const applyTransform = (p: Point2D): Point2D => {
      let x = p.x, y = p.y;
      if (bestVariant.name.includes('flipY')) y = -y;
      if (bestVariant.name.includes('flipX')) x = -x;
      return {
        x: Number((scale * (cosT * x - sinT * y) + tx).toFixed(2)),
        y: Number((scale * (sinT * x + cosT * y) + ty).toFixed(2)),
      };
    };

    let orientedCenter = tumCenter;
    let orientedLeft = tumLeft;
    let orientedRight = tumRight;
    if (bestVariant.name.startsWith('reversed')) {
      orientedCenter = [...tumCenter].reverse();
      orientedLeft = [...tumLeft].reverse();
      orientedRight = [...tumRight].reverse();
    }

    finalCenter = orientedCenter.map(applyTransform);
    finalLeft = orientedLeft.map(applyTransform);
    finalRight = orientedRight.map(applyTransform);

    transformInfo = {
      scale: Number(scale.toFixed(5)),
      rotationDeg: Number((bestTransform.rotationRad * 180 / Math.PI).toFixed(2)),
      tx: Number(tx.toFixed(2)),
      tz: Number(ty.toFixed(2)),
      rmse: Number(bestTransform.rmse.toFixed(2)),
    };

    console.log(`TUM Alignment: scale=${transformInfo.scale}, rot=${transformInfo.rotationDeg}°, rmse=${transformInfo.rmse}m`);

  } else if (cfg.sourceType === 'atlas') {
    const atlasPath = await ensureSourceFile(cfg);
    const geojson = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
    const feature0 = geojson.features.find((f: any) => f.geometry.type === 'LineString') || geojson.features[0];
    const coords: Array<[number, number]> = feature0.geometry.coordinates;

    const rawMeters = gpsToLocalMeters(coords);
    const smoothCenter = smoothPolyline(resampleStep(rawMeters, 2.5), 5);
    const corridor = computeCorridorBoundaries(smoothCenter, cfg.nominalWidthM / 2);

    const variants = [
      { name: 'normal', pts: smoothCenter },
      { name: 'flipY', pts: smoothCenter.map(p => ({ x: p.x, y: -p.y })) },
      { name: 'reversed', pts: [...smoothCenter].reverse() },
      { name: 'reversed_flipY', pts: [...smoothCenter].reverse().map(p => ({ x: p.x, y: -p.y })) },
      { name: 'flipX', pts: smoothCenter.map(p => ({ x: -p.x, y: p.y })) },
      { name: 'reversed_flipX', pts: [...smoothCenter].reverse().map(p => ({ x: -p.x, y: p.y })) },
    ];

    let bestVariant = variants[0];
    let bestShift = 0, minRmse = Infinity, bestTransform: any = null;

    for (const v of variants) {
      const vRes = resamplePolyline(v.pts, N_SAMPLE);
      for (let s = 0; s < N_SAMPLE; s += 2) {
        const shifted = [];
        for (let i = 0; i < N_SAMPLE; i++) shifted.push(vRes[(i + s) % N_SAMPLE]);
        const t = findSimilarityTransform(shifted, lmuResampled);
        if (t.rmse < minRmse) {
          minRmse = t.rmse;
          bestShift = s;
          bestTransform = t;
          bestVariant = v;
        }
      }
    }

    const cosT = Math.cos(bestTransform.rotationRad);
    const sinT = Math.sin(bestTransform.rotationRad);
    const scale = bestTransform.scale;
    const tx = bestTransform.tx;
    const ty = bestTransform.ty;

    const applyTransform = (p: Point2D): Point2D => {
      let x = p.x, y = p.y;
      if (bestVariant.name.includes('flipY')) y = -y;
      if (bestVariant.name.includes('flipX')) x = -x;
      return {
        x: Number((scale * (cosT * x - sinT * y) + tx).toFixed(2)),
        y: Number((scale * (sinT * x + cosT * y) + ty).toFixed(2)),
      };
    };

    let orientedCenter = smoothCenter;
    let orientedLeft = corridor.left;
    let orientedRight = corridor.right;
    if (bestVariant.name.startsWith('reversed')) {
      orientedCenter = [...smoothCenter].reverse();
      orientedLeft = [...corridor.left].reverse();
      orientedRight = [...corridor.right].reverse();
    }

    finalCenter = orientedCenter.map(applyTransform);
    finalLeft = orientedLeft.map(applyTransform);
    finalRight = orientedRight.map(applyTransform);

    transformInfo = {
      scale: Number(scale.toFixed(5)),
      rotationDeg: Number((bestTransform.rotationRad * 180 / Math.PI).toFixed(2)),
      tx: Number(tx.toFixed(2)),
      tz: Number(ty.toFixed(2)),
      rmse: Number(bestTransform.rmse.toFixed(2)),
    };

    console.log(`Atlas Alignment: scale=${transformInfo.scale}, rot=${transformInfo.rotationDeg}°, rmse=${transformInfo.rmse}m`);

  } else {
    // Strategy: Telemetry Corridor directly in LMU coordinates
    // We resample and smooth the clean flying lap trajectory, then project the nominal FIA half-width
    const stepCenter = smoothPolyline(resampleStep(lmu2D, 2.5), 7);
    const corridor = computeCorridorBoundaries(stepCenter, cfg.nominalWidthM / 2);

    finalCenter = stepCenter.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }));
    finalLeft = corridor.left;
    finalRight = corridor.right;

    transformInfo = {
      scale: 1.0,
      rotationDeg: 0.0,
      tx: 0.0,
      tz: 0.0,
      rmse: 0.0,
    };

    console.log(`Telemetry Corridor: direct 1:1 LMU native space with ${cfg.nominalWidthM}m width profile`);
  }

  // Calculate circuit length
  let lengthM = 0;
  for (let i = 1; i < finalCenter.length; i++) {
    lengthM += Math.hypot(finalCenter[i].x - finalCenter[i - 1].x, finalCenter[i].y - finalCenter[i - 1].y);
  }

  // Calculate bounding box
  const allX = [...finalLeft.map(p => p.x), ...finalRight.map(p => p.x)];
  const allZ = [...finalLeft.map(p => p.y), ...finalRight.map(p => p.y)];
  const minX = Number(Math.min(...allX).toFixed(2));
  const maxX = Number(Math.max(...allX).toFixed(2));
  const minZ = Number(Math.min(...allZ).toFixed(2));
  const maxZ = Number(Math.max(...allZ).toFixed(2));

  const geometry: TrackBoundaryGeometry = {
    layoutKey: cfg.layoutKey,
    circuitId: cfg.circuitId,
    layoutId: cfg.layoutId,
    trackVenue: cfg.trackVenue,
    trackCourse: cfg.trackCourse,
    lengthM: Number(lengthM.toFixed(1)),
    source: cfg.sourceType === 'TUM' ? 'TUM-survey' : cfg.sourceType === 'atlas' ? 'track-atlas' : 'telemetry-corridor',
    transform: transformInfo,
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ,
      spanX: Number((maxX - minX).toFixed(2)),
      spanZ: Number((maxZ - minZ).toFixed(2)),
    },
    leftBoundary: finalLeft.map(p => [p.x, p.y]),
    rightBoundary: finalRight.map(p => [p.x, p.y]),
    centerline: finalCenter.map(p => [p.x, p.y]),
    nominalWidthM: cfg.nominalWidthM,
    createdAt: new Date().toISOString(),
  };

  console.log(`Completed: ${geometry.lengthM}m length, ${geometry.centerline.length} points, bounds [${minX}, ${maxX}] x [${minZ}, ${maxZ}]`);
  return geometry;
}

async function main() {
  console.log('🏁 Starting Comprehensive Track Boundary Generation for All 21 Driven Layouts...');

  const db = new Database('server/lmu_cache.db');
  const serverDir = path.resolve('server/data/tracks');
  const publicDir = path.resolve('public/tracks');

  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const indexManifest: Array<{
    layoutKey: string;
    circuitId: string;
    layoutId: string;
    trackVenue: string;
    trackCourse: string;
    lengthM: number;
    source: string;
    bounds: any;
    pointsCount: number;
  }> = [];

  for (const cfg of TRACK_CONFIGS) {
    try {
      const geom = await processTrack(cfg, db);
      const jsonStr = JSON.stringify(geom, null, 2);

      // Save to both server/data/tracks and public/tracks
      fs.writeFileSync(path.join(serverDir, `${cfg.layoutKey}.json`), jsonStr, 'utf8');
      fs.writeFileSync(path.join(publicDir, `${cfg.layoutKey}.json`), jsonStr, 'utf8');

      indexManifest.push({
        layoutKey: geom.layoutKey,
        circuitId: geom.circuitId,
        layoutId: geom.layoutId,
        trackVenue: geom.trackVenue,
        trackCourse: geom.trackCourse,
        lengthM: geom.lengthM,
        source: geom.source,
        bounds: geom.bounds,
        pointsCount: geom.centerline.length,
      });
    } catch (err: any) {
      console.error(`❌ Failed processing ${cfg.layoutKey}:`, err.message);
    }
  }

  // Save index.json
  const indexStr = JSON.stringify(indexManifest, null, 2);
  fs.writeFileSync(path.join(serverDir, 'index.json'), indexStr, 'utf8');
  fs.writeFileSync(path.join(publicDir, 'index.json'), indexStr, 'utf8');

  console.log(`\n🎉 Successfully processed and saved ${indexManifest.length} / ${TRACK_CONFIGS.length} track boundary geometries!`);
  console.log(`Output locations:`);
  console.log(` - Server Data: ${serverDir}`);
  console.log(` - Public Web:  ${publicDir}`);
}

main().catch(e => {
  console.error('Fatal error running pipeline:', e);
  process.exit(1);
});
