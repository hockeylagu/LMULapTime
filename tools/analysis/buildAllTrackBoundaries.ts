import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import zlib from 'zlib';

export interface Point2D {
  x: number;
  y: number;
}

interface NativeTrackPoint {
  type: number;
  x: number;
  y: number;
  z: number;
}

interface PitLaneData {
  centerline: Array<[number, number]>;
  elevation?: number[];
}

interface PitStallData {
  id: number;
  center: [number, number];
  widthM: number;
  angleDeg?: number;
}

interface GridSlotData {
  slot: number;
  center: [number, number];
}

const LMU_API_BASE_URL = process.env.LMU_API_BASE_URL ?? 'http://localhost:6397';
const NATIVE_TRACKMAP_CACHE = path.resolve('tools/analysis/cache/lmu_all_trackmaps.json');

function parseNativeTrackmap(value: unknown): NativeTrackPoint[] | null {
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

async function loadNativeTrackmap(trackId: string): Promise<NativeTrackPoint[]> {
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

export interface TimingGateGeometry {
  name: string;
  center: [number, number];
  left: [number, number];
  right: [number, number];
  stationM: number;
}

export interface TrackBoundaryGeometry {
  layoutKey: string;
  circuitId: string;
  layoutId: string;
  trackVenue: string;
  trackCourse: string;
  lengthM: number;
  source: string;
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
  startFinish?: [number, number];
  timingGates?: {
    startFinish: TimingGateGeometry;
    sector1?: TimingGateGeometry;
    sector2?: TimingGateGeometry;
  };
  elevationProfile?: number[];
  pitLane?: {
    centerline: Array<[number, number]>;
    elevation?: number[];
  };
  pitStalls?: Array<{
    id: number;
    center: [number, number];
    widthM: number;
    angleDeg?: number;
  }>;
  gridSlots?: Array<{
    slot: number;
    center: [number, number];
  }>;
  createdAt: string;
  updatedAt?: string;
}

export interface TrackSectionWidth {
  startM: number;
  endM: number;
  widthM: number;
  description?: string;
}

export interface TrackConfig {
  layoutKey: string;
  circuitId: string;
  layoutId: string;
  trackVenue: string;
  trackCourse: string;
  sourceType: 'TUM' | 'atlas' | 'telemetry' | 'osm' | 'hybrid' | 'lmu_api';
  lmuTrackId?: string;
  sourceFile?: string;
  osmRelationId?: number;
  parentLayoutKey?: string;
  replayPattern: string;
  preferredLap?: number;
  nominalWidthM: number;
  // Flat outward padding (meters) added to this track's own survey/corridor width - opt-in,
  // only for tracks confirmed (via real clean telemetry) to need it. Never alters the shape.
  corridorMarginM?: number;
  // Optional section-by-section width profile (stationM -> widthM) for authentic road ribbons
  sectionWidths?: TrackSectionWidth[];
  // Optional index along native centerline for authoritative S/F anchor
  sfCenterIndex?: number;
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
    lmuTrackId: '6c01c2bba8c97798950b12756de021f34bcf7ba9',
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
    sourceType: 'hybrid',
    lmuTrackId: '3bc64b0a74e68af07f03c41be6b30166cd699e21',
    parentLayoutKey: 'monza_gp',
    replayPattern: 'Monza Curva Grande Circuit Q1 5.Vcr',
    preferredLap: 2,
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
    // TUM's satellite-derived width consistently ran ~3-4m narrower than real clean telemetry
    // (curbs/run-off the survey doesn't count as track) - see repo memory for how this was
    // measured and why a flat margin was used instead of a telemetry-derived per-index widen.
    corridorMarginM: 3.0,
  },
  // 4. Circuit de la Sarthe (24h Le Mans)
  {
    layoutKey: 'sarthe_full',
    circuitId: 'sarthe',
    layoutId: 'full',
    trackVenue: 'Circuit de la Sarthe',
    trackCourse: 'Circuit de la Sarthe',
    sourceType: 'lmu_api',
    lmuTrackId: '4cdc72fe3acb2c912fd6cbd6828095625ba2d5a7',
    sfCenterIndex: 206,
    replayPattern: 'Circuit de la Sarthe P1 43.Vcr',
    preferredLap: 2,
    nominalWidthM: 13.5,
    corridorMarginM: 0,
    sectionWidths: [
      { startM: 0, endM: 650, widthM: 15.5, description: 'Pit / Start-Finish straight' },
      { startM: 650, endM: 1150, widthM: 13.5, description: 'Dunlop Curve & Chicane' },
      { startM: 1150, endM: 2050, widthM: 14.0, description: 'Esses & Tertre Rouge' },
      { startM: 2050, endM: 4000, widthM: 15.0, description: 'Mulsanne Straight Part 1 (D338 full road width)' },
      { startM: 4000, endM: 4350, widthM: 13.5, description: 'First Mulsanne Chicane (Forza)' },
      { startM: 4350, endM: 6000, widthM: 15.0, description: 'Mulsanne Straight Part 2 (D338 full road width)' },
      { startM: 6000, endM: 6350, widthM: 13.5, description: 'Second Mulsanne Chicane (Michelin)' },
      { startM: 6350, endM: 7650, widthM: 15.0, description: 'Mulsanne Straight Part 3 (D338 full road width)' },
      { startM: 7650, endM: 8050, widthM: 14.0, description: 'Mulsanne Corner 90-degree right' },
      { startM: 8050, endM: 9400, widthM: 14.0, description: 'Kink to Indianapolis' },
      { startM: 9400, endM: 9850, widthM: 14.0, description: 'Indianapolis curve' },
      { startM: 9850, endM: 10250, widthM: 11.5, description: 'Arnage hairpin (narrow road)' },
      { startM: 10250, endM: 11100, widthM: 13.5, description: 'Straight to Porsche curves' },
      { startM: 11100, endM: 12500, widthM: 13.5, description: 'Porsche Curves' },
      { startM: 12500, endM: 13200, widthM: 13.5, description: 'Maison Blanche & Karting' },
      { startM: 13200, endM: 13650, widthM: 13.5, description: 'Ford Chicanes' },
    ],
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
    sourceType: 'hybrid',
    lmuTrackId: '2aafcc7f60619a5426d1e03ce3e2161d1e11e92e',
    parentLayoutKey: 'bahrain_wec',
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
    sourceType: 'hybrid',
    lmuTrackId: '16845c4c1e9a97b4616f413449b931a26cb7a978',
    parentLayoutKey: 'bahrain_wec',
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
    sourceType: 'osm',
    sourceFile: 'daytona_road_course.geojson',
    osmRelationId: 5254136,
    replayPattern: 'Daytona International Speedway Road Course R1 7.Vcr',
    preferredLap: -1,
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
    sourceType: 'hybrid',
    lmuTrackId: '26e5f7934fde68f653f0036c8992f3215b744df4',
    parentLayoutKey: 'fuji_chicane',
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
    sourceType: 'osm',
    sourceFile: 'portimao_wec.geojson',
    osmRelationId: 7509968,
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
    sourceType: 'hybrid',
    lmuTrackId: 'be032d2eac22f32a2110e1eaa6a779d95046bb91',
    parentLayoutKey: 'sebring_full',
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
    sourceType: 'osm',
    sourceFile: 'paul_ricard_1a_v2_short.geojson',
    osmRelationId: 17590236,
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

function computeCorridorBoundaries(centerline: Point2D[], halfWidthM: number, isClosed: boolean = true): { left: Point2D[]; right: Point2D[] } {
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
  let row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE (filename = ? OR filename LIKE ?) AND lap_key = ? AND driver_slot = -1').get(filename, `%${filename}%`, lapKey);
  if (!row) {
    row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE (filename = ? OR filename LIKE ?) AND lap_key = ? ORDER BY points_count DESC').get(filename, `%${filename}%`, lapKey);
  }
  if (!row && lapKey !== -1) {
    row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE (filename = ? OR filename LIKE ?) AND lap_key = -1 AND driver_slot = -1').get(filename, `%${filename}%`);
  }
  if (!row && lapKey !== -1) {
    row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE (filename = ? OR filename LIKE ?) AND lap_key = -1 ORDER BY points_count DESC').get(filename, `%${filename}%`);
  }
  if (!row) {
    row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE (filename = ? OR filename LIKE ?) ORDER BY points_count DESC LIMIT 1').get(filename, `%${filename}%`);
  }
  if (!row) {
    throw new Error(`Replay trajectory not found for ${filename}`);
  }
  const data = JSON.parse(zlib.brotliDecompressSync(row.trajectory_br).toString('utf8'));
  return data.points.map((p: any) => ({ x: p.x, z: p.z }));
}

// Everything before "<session><num> <lap>.Vcr" - matching on this full venue name (not a
// single generic word) avoids pulling in an unrelated track that happens to share a common
// word like "Circuit" or "Autodromo" (Monza vs Imola, Spa vs Portimão/Barcelona/COTA/Sarthe).
function getVenuePrefix(replayPattern: string): string {
  const venueMatch = replayPattern.match(/^(.*?)\s+(?:P|Q|R|FP)\d+\s+\d+\.Vcr$/i);
  return venueMatch ? venueMatch[1] : replayPattern.replace(/\.Vcr$/i, '');
}

function extractTrackGateSamples(db: any, layoutKey: string, replayPattern: string): {
  sfSamples: Point2D[];
  s1Samples: Point2D[];
  s2Samples: Point2D[];
} {
  const venuePrefix = getVenuePrefix(replayPattern);

  let rows = db.prepare(`
    SELECT trajectory_br FROM replay_trajectories 
    WHERE (filename = ? OR filename LIKE ?) 
      AND lap_key >= 1 AND driver_slot = -1 
    ORDER BY filename, lap_key 
    LIMIT 40
  `).all(replayPattern, `${venuePrefix} %`);

  if (rows.length === 0) {
    // Defensive fallback for a replayPattern that doesn't match the usual naming convention -
    // broader, so only used when the precise venue match found nothing at all.
    const cleanKey = layoutKey.replace(/_(gp|full|short|wec|classic|chicane|outer|paddock|school|curvagrande|road_course)$/i, '');
    console.warn(`[${layoutKey}] No replays matched venue prefix "${venuePrefix}", falling back to broader "${cleanKey}" match.`);
    rows = db.prepare(`
      SELECT trajectory_br FROM replay_trajectories 
      WHERE filename LIKE ? 
        AND lap_key >= 1 AND driver_slot = -1 
      ORDER BY filename, lap_key 
      LIMIT 40
    `).all(`%${cleanKey}%`);
  }

  const sfSamples: Point2D[] = [];
  const s1Samples: Point2D[] = [];
  const s2Samples: Point2D[] = [];

  for (const r of rows as any[]) {
    try {
      const d = JSON.parse(zlib.brotliDecompressSync(r.trajectory_br).toString('utf8'));
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

// Only widens a boundary, never narrows it below what the source/corridor already provides.
// A naive per-index running max is dangerously sensitive to a single contaminated sample (e.g.
// a car taking the pit entry right next to a corner apex - spatially close to the track, but a
// different physical lane entirely) - one such lap can spike a single index's "observed width"
// far beyond reality, cutting a sharp spike straight across the ribbon. So instead: aggregate
// per-index samples with a robust percentile + minimum sample count (outvotes rare outliers),
// cap how much wider than survey we'll ever go, then smooth with an averaging window and clamp
// the index-to-index rate of change - both of which suppress an isolated spike instead of
// spreading/preserving it.
//
// ABANDONED: even with all of the above, a hairpin (e.g. Spa's La Source) still produced a
// straight-line artefact cutting across the loop - the nearest-centerline-index search matches
// a telemetry sample to whichever index is spatially closest, but at a hairpin the entry and
// exit straights run right past each other; a sample on one side can nearest-match an index on
// the OTHER side of the gap, and that one wrong index then gets pushed outward towards a point
// that's actually across the corner, not along its own local edge. No amount of per-sample
// smoothing fixes a per-INDEX assignment error. Do not resurrect per-index telemetry-derived
// widening - see applyUniformCorridorMargin below for the safe replacement (opt-in per track,
// a single flat margin added to the existing survey width, so it can never redirect a boundary
// point towards a different part of the track).

/**
 * Pushes `left[i]`/`right[i]` outward by a single flat `marginM`, along the direction each
 * point already has from the centerline - i.e. every boundary point moves further along its own
 * existing edge, never towards some other index. This can't produce the hairpin cross-track
 * artefact per-index telemetry widening did, at the cost of being a blunter instrument (a flat
 * amount everywhere, not shaped to where curbs/run-off actually are).
 */
function applyUniformCorridorMargin(center: Point2D[], left: Point2D[], right: Point2D[], marginM: number): void {
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


function fitGateLine(
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

  // Orient line direction so cross product with trackTangent is positive (pointing towards left)
  const cross = trackTangent.x * dirY - trackTangent.y * dirX;
  if (cross < 0) {
    dirX = -dirX;
    dirY = -dirY;
  }

  return { point: { x: meanX, y: meanY }, dir: { x: dirX, y: dirY } };
}

function intersectLineWithPolyline(
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
      // Reject intersections on distant parallel tracks
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

function findClosestOnPolyline(target: Point2D, polyline: Point2D[]): { point: Point2D; index: number } {
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

/**
 * Finds the largest group of mutually-nearby samples (each within radiusM of some seed sample),
 * i.e. the point independent replay laps agree on most - a robust stand-in for "the real gate
 * location" that doesn't get dragged off by a handful of outliers the way a plain mean would.
 * Returns null if no group reaches minCount (not enough agreement to trust).
 */
function findConsensusCluster(samples: Point2D[], radiusM: number, minCount: number): Point2D[] | null {
  let best: Point2D[] = [];
  for (const seed of samples) {
    const cluster = samples.filter(p => Math.hypot(p.x - seed.x, p.y - seed.y) <= radiusM);
    if (cluster.length > best.length) best = cluster;
  }
  return best.length >= minCount ? best : null;
}

function rollPolyline(polyline: Point2D[], shift: number, exactPoint0?: Point2D): Point2D[] {
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

function rollNumberArray(arr: number[], shift: number): number[] {
  const m = arr.length;
  const k = ((Math.round(shift) % m) + m) % m;
  const rolled: number[] = [];
  for (let i = 0; i < m; i++) {
    rolled.push(arr[(i + k) % m]);
  }
  return rolled;
}

function computeStationAlongPolyline(polyline: Point2D[], targetIndex: number): number {
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
      // Daytona: custom order ensures Le Mans chicane is traversed
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

export function synthesizeHybridTrack(
  parentGeom: any,
  telem2D: Point2D[],
  nominalWidthM: number,
  divThresholdM: number = 12.0,
  parentElevation?: number[],
  telemElevation?: number[]
): {
  centerline: Point2D[];
  left: Point2D[];
  right: Point2D[];
  elevation?: number[];
  sharedPct: number;
} {
  const P_center: Point2D[] = parentGeom.centerline.map(([x, y]: [number, number]) => ({ x, y }));
  const P_left: Point2D[] = parentGeom.leftBoundary.map(([x, y]: [number, number]) => ({ x, y }));
  const P_right: Point2D[] = parentGeom.rightBoundary.map(([x, y]: [number, number]) => ({ x, y }));
  const N_parent = P_center.length;

  const T = telem2D.length > 500 ? telem2D : smoothPolyline(resampleStep(telem2D, 2.5), 5);
  const N_telem = T.length;

  // Closest parent search
  const closestParent: Array<{ i: number; minD: number; k: number }> = [];
  for (let i = 0; i < N_telem; i++) {
    let minD = Infinity, bestK = 0;
    for (let k = 0; k < N_parent; k++) {
      const d = Math.hypot(T[i].x - P_center[k].x, T[i].y - P_center[k].y);
      if (d < minD) { minD = d; bestK = k; }
    }
    closestParent.push({ i, minD, k: bestK });
  }

  // Find contiguous runs of divergence
  const runs: Array<{ start: number; end: number; len: number; maxD: number }> = [];
  let curRun: { start: number; end: number; len: number; maxD: number } | null = null;
  for (let i = 0; i < N_telem; i++) {
    if (closestParent[i].minD >= divThresholdM) {
      if (!curRun) curRun = { start: i, end: i, len: 1, maxD: closestParent[i].minD };
      else {
        curRun.end = i;
        curRun.len++;
        if (closestParent[i].minD > curRun.maxD) curRun.maxD = closestParent[i].minD;
      }
    } else {
      if (curRun) {
        runs.push(curRun);
        curRun = null;
      }
    }
  }
  if (curRun) runs.push(curRun);

  // Filter major divergent runs (peak deviation >= 18m and length >= 10 points)
  let majorRuns = runs.filter(r => r.maxD >= 18.0 && r.len >= 10);
  if (majorRuns.length === 0) {
    const modRuns = runs.filter(r => r.maxD >= 12.0 && r.len >= 15);
    if (modRuns.length > 0) majorRuns.push(...modRuns);
  }

  if (majorRuns.length === 0) {
    console.log('No significant divergence detected, using parent track directly');
    return {
      centerline: P_center,
      left: P_left,
      right: P_right,
      elevation: parentElevation,
      sharedPct: 100,
    };
  }

  // Sort runs in telemetry progression order
  majorRuns.sort((a, b) => a.start - b.start);

  interface SplicedRun {
    divStartT: number;
    divEndT: number;
    kExit: number;
    kEntry: number;
  }

  const splicedRuns: SplicedRun[] = [];
  for (const r of majorRuns) {
    let startT = r.start;
    while (startT > 0 && closestParent[startT].minD > 1.0) {
      if (closestParent[startT - 1].minD > closestParent[startT].minD && closestParent[startT].minD <= 2.5) {
        break;
      }
      startT--;
    }
    let endT = r.end;
    while (endT < N_telem - 1 && closestParent[endT].minD > 1.0) {
      if (closestParent[endT + 1].minD > closestParent[endT].minD && closestParent[endT].minD <= 2.5) {
        break;
      }
      endT++;
    }
    const kExit = closestParent[startT].k;
    const kEntry = closestParent[endT].k;
    splicedRuns.push({ divStartT: startT, divEndT: endT, kExit, kEntry });
  }

  // Helper to slice circular parent array
  function sliceParentRange<TItem>(arr: TItem[], kFrom: number, kTo: number): TItem[] {
    const res: TItem[] = [];
    let curr = kFrom;
    while (curr !== kTo) {
      res.push(arr[curr]);
      curr = (curr + 1) % arr.length;
    }
    res.push(arr[kTo]);
    return res;
  }

  const finalCenter: Point2D[] = [];
  const finalLeft: Point2D[] = [];
  const finalRight: Point2D[] = [];
  const finalElevation: number[] = [];
  let totalParentPoints = 0;

  const M = splicedRuns.length;
  for (let m = 0; m < M; m++) {
    const prevRun = splicedRuns[(m - 1 + M) % M];
    const curRun = splicedRuns[m];

    // Parent segment from previous entry up to current exit
    const parentKFrom = m === 0 ? splicedRuns[M - 1].kEntry : prevRun.kEntry;
    const parentKTo = curRun.kExit;

    const parentSegCenter = sliceParentRange(P_center, parentKFrom, parentKTo);
    const parentSegLeft = sliceParentRange(P_left, parentKFrom, parentKTo);
    const parentSegRight = sliceParentRange(P_right, parentKFrom, parentKTo);
    totalParentPoints += parentSegCenter.length;

    let parentSegElev: number[] | undefined;
    if (parentElevation && parentElevation.length === N_parent) {
      parentSegElev = sliceParentRange(parentElevation, parentKFrom, parentKTo);
    }

    // Divergent connector points
    const rawDiv = T.slice(curRun.divStartT, curRun.divEndT + 1);
    const L = rawDiv.length;

    // Linearly distribute endpoint offsets so connector lands with exact 0.00m error at parent junctions
    const dStart = { x: P_center[curRun.kExit].x - rawDiv[0].x, y: P_center[curRun.kExit].y - rawDiv[0].y };
    const dEnd = { x: P_center[curRun.kEntry].x - rawDiv[L - 1].x, y: P_center[curRun.kEntry].y - rawDiv[L - 1].y };

    const divCenter: Point2D[] = [];
    for (let i = 0; i < L; i++) {
      const w = i / (L - 1 || 1);
      divCenter.push({
        x: rawDiv[i].x + (1 - w) * dStart.x + w * dEnd.x,
        y: rawDiv[i].y + (1 - w) * dStart.y + w * dEnd.y,
      });
    }

    // Measure parent boundary widths at exit and entry junctions
    const hwExit = Math.hypot(P_left[curRun.kExit].x - P_right[curRun.kExit].x, P_left[curRun.kExit].y - P_right[curRun.kExit].y) / 2;
    const hwEntry = Math.hypot(P_left[curRun.kEntry].x - P_right[curRun.kEntry].x, P_left[curRun.kEntry].y - P_right[curRun.kEntry].y) / 2;
    const hwNom = nominalWidthM / 2;

    // Smooth width profile across connector
    const hwProfile: number[] = [];
    const BLEND_ZONE = Math.max(4, Math.floor(L / 4));
    for (let i = 0; i < L; i++) {
      let w = hwNom;
      if (i < BLEND_ZONE) {
        const u = 0.5 * (1 - Math.cos((Math.PI * i) / BLEND_ZONE));
        w = hwExit * (1 - u) + hwNom * u;
      } else if (i >= L - BLEND_ZONE) {
        const u = 0.5 * (1 - Math.cos((Math.PI * (L - 1 - i)) / BLEND_ZONE));
        w = hwEntry * (1 - u) + hwNom * u;
      }
      hwProfile.push(w);
    }

    // Curvature-driven road centerline reconstruction on the connector
    const divOffsets: number[] = [];
    for (let i = 0; i < L; i++) {
      const prev = divCenter[Math.max(0, i - 2)];
      const cur = divCenter[i];
      const next = divCenter[Math.min(L - 1, i + 2)];
      const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y;
      const dx2 = next.x - cur.x, dy2 = next.y - cur.y;
      const a1 = Math.atan2(dy1, dx1), a2 = Math.atan2(dy2, dx2);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const ds = (Math.hypot(dx1, dy1) + Math.hypot(dx2, dy2)) / 2;
      const k = diff / (ds || 1);

      const maxShift = Math.max(0, hwProfile[i] - 2.8);
      const shift = -Math.tanh(k * 80) * maxShift;
      divOffsets.push(shift);
    }

    // Smooth offsets with moving-average window and taper to 0 at junction endpoints
    const smoothOffsets: number[] = [];
    const W = Math.min(5, Math.floor(L / 4));
    for (let i = 0; i < L; i++) {
      let sum = 0, count = 0;
      for (let w = -W; w <= W; w++) {
        const idx = i + w;
        if (idx >= 0 && idx < L) {
          sum += divOffsets[idx];
          count++;
        }
      }
      const taper = Math.sin((Math.PI * i) / (L - 1 || 1));
      smoothOffsets.push((sum / count) * taper);
    }

    // Extrude connector road center, left, and right
    const divRoadCenter: Point2D[] = [];
    const divLeft: Point2D[] = [];
    const divRight: Point2D[] = [];
    for (let i = 0; i < L; i++) {
      const prev = divCenter[Math.max(0, i - 1)];
      const next = divCenter[Math.min(L - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const offset = smoothOffsets[i];
      const cx = divCenter[i].x + nx * offset;
      const cy = divCenter[i].y + ny * offset;
      divRoadCenter.push({ x: Number(cx.toFixed(2)), y: Number(cy.toFixed(2)) });
      divLeft.push({ x: Number((cx + nx * hwProfile[i]).toFixed(2)), y: Number((cy + ny * hwProfile[i]).toFixed(2)) });
      divRight.push({ x: Number((cx - nx * hwProfile[i]).toFixed(2)), y: Number((cy - ny * hwProfile[i]).toFixed(2)) });
    }

    // Smooth C1 blend of boundaries into parent boundaries at both junctions
    const deltaL_start = { x: P_left[curRun.kExit].x - divLeft[0].x, y: P_left[curRun.kExit].y - divLeft[0].y };
    const deltaR_start = { x: P_right[curRun.kExit].x - divRight[0].x, y: P_right[curRun.kExit].y - divRight[0].y };
    const deltaL_end = { x: P_left[curRun.kEntry].x - divLeft[L - 1].x, y: P_left[curRun.kEntry].y - divLeft[L - 1].y };
    const deltaR_end = { x: P_right[curRun.kEntry].x - divRight[L - 1].x, y: P_right[curRun.kEntry].y - divRight[L - 1].y };

    for (let b = 0; b < BLEND_ZONE; b++) {
      const u = 0.5 * (1 + Math.cos((Math.PI * b) / BLEND_ZONE));
      divLeft[b] = {
        x: Number((divLeft[b].x + deltaL_start.x * u).toFixed(2)),
        y: Number((divLeft[b].y + deltaL_start.y * u).toFixed(2)),
      };
      divRight[b] = {
        x: Number((divRight[b].x + deltaR_start.x * u).toFixed(2)),
        y: Number((divRight[b].y + deltaR_start.y * u).toFixed(2)),
      };

      const idx = L - 1 - b;
      divLeft[idx] = {
        x: Number((divLeft[idx].x + deltaL_end.x * u).toFixed(2)),
        y: Number((divLeft[idx].y + deltaL_end.y * u).toFixed(2)),
      };
      divRight[idx] = {
        x: Number((divRight[idx].x + deltaR_end.x * u).toFixed(2)),
        y: Number((divRight[idx].y + deltaR_end.y * u).toFixed(2)),
      };
    }

    // Connector elevation
    const divElevation: number[] = [];
    if (parentSegElev && parentElevation) {
      finalElevation.push(...parentSegElev);
      const elevExit = parentElevation[curRun.kExit];
      const elevEntry = parentElevation[curRun.kEntry];
      const dElevStart = telemElevation && telemElevation.length === N_telem ? elevExit - telemElevation[curRun.divStartT] : 0;
      const dElevEnd = telemElevation && telemElevation.length === N_telem ? elevEntry - telemElevation[curRun.divEndT] : 0;
      for (let i = 0; i < L; i++) {
        const frac = i / (L - 1 || 1);
        if (telemElevation && telemElevation.length === N_telem) {
          const rawElev = telemElevation[curRun.divStartT + i];
          divElevation.push(Number((rawElev + (1 - frac) * dElevStart + frac * dElevEnd).toFixed(3)));
        } else {
          divElevation.push(Number((elevExit * (1 - frac) + elevEntry * frac).toFixed(3)));
        }
      }
      finalElevation.push(...divElevation.slice(1, L - 1));
    }

    finalCenter.push(...parentSegCenter, ...divRoadCenter.slice(1, L - 1));
    finalLeft.push(...parentSegLeft, ...divLeft.slice(1, L - 1));
    finalRight.push(...parentSegRight, ...divRight.slice(1, L - 1));
  }

  const sharedPct = Number(((totalParentPoints / finalCenter.length) * 100).toFixed(1));

  return {
    centerline: finalCenter,
    left: finalLeft,
    right: finalRight,
    elevation: finalElevation.length === finalCenter.length ? finalElevation : undefined,
    sharedPct,
  };
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
  // For sources with an authoritative s=0 convention (TUM's published database always starts
  // each CSV at the real start/finish line), this is that point transformed into LMU space -
  // used to anchor and sanity-check the telemetry-derived gate fit below, since replay-derived
  // S/F samples have been found to cluster at the wrong point on the track for every TUM track.
  let surveyAnchor: Point2D | null = null;
  let elevationProfile: number[] | undefined = undefined;
  let pitLaneData: PitLaneData | undefined = undefined;
  let pitStallsData: PitStallData[] | undefined = undefined;
  let gridSlotsData: GridSlotData[] | undefined = undefined;

  if (cfg.sourceType === 'lmu_api') {
    const trackId = cfg.lmuTrackId || '4cdc72fe3acb2c912fd6cbd6828095625ba2d5a7';
    const trackmap = await loadNativeTrackmap(trackId);

    const t0 = trackmap.filter(p => p.type === 0);
    const t1 = trackmap.filter(p => p.type === 1);
    const rawStalls = trackmap.filter(p => p.type >= 2 && p.type < 100);
    const rawGrid = trackmap.filter(p => p.type >= 100);

    const nativeCenter: Point2D[] = t0.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.z.toFixed(2)) }));
    const rawElevation: number[] = t0.map(p => Number(p.y.toFixed(3)));

    transformInfo = {
      scale: 1.0,
      rotationDeg: 0.0,
      tx: 0.0,
      tz: 0.0,
      rmse: 0.0,
    };

    // Calculate cumulative station distance along nativeCenter
    const m = nativeCenter.length;
    const cumDist: number[] = [0];
    for (let i = 0; i < m - 1; i++) {
      cumDist.push(cumDist[i] + Math.hypot(nativeCenter[i + 1].x - nativeCenter[i].x, nativeCenter[i + 1].y - nativeCenter[i].y));
    }

    // Helper to get variable half-width for station s
    const getHalfWidth = (s: number): number => {
      if (!cfg.sectionWidths || cfg.sectionWidths.length === 0) {
        return cfg.nominalWidthM / 2;
      }
      for (const sec of cfg.sectionWidths) {
        if (s >= sec.startM && s <= sec.endM) {
          return sec.widthM / 2;
        }
      }
      return cfg.nominalWidthM / 2;
    };

    // Pre-calculate target widths and apply smoothing so adjacent sections blend with C1 continuity
    const targetHalfWidths: number[] = [];
    for (let i = 0; i < m; i++) {
      targetHalfWidths.push(getHalfWidth(cumDist[i]));
    }
    const smoothHalfWidths: number[] = [];
    const HW_WINDOW = 8;
    for (let i = 0; i < m; i++) {
      let sum = 0;
      let count = 0;
      for (let w = -HW_WINDOW; w <= HW_WINDOW; w++) {
        const idx = (i + w + m) % m;
        sum += targetHalfWidths[idx];
        count++;
      }
      smoothHalfWidths.push(sum / count);
    }

    // Compute signed curvature along nativeCenter to reconstruct physical road centerline
    // (A racing line cuts inside toward the apex; the physical road centerline sits further outside
    // around curves. Offsetting the road centerline toward the outside of turns allows the car
    // to realistically hug inside apex kerbs and track out to exit limits instead of sitting dead-center).
    const rawOffsets: number[] = [];
    for (let i = 0; i < m; i++) {
      const prev = nativeCenter[(i - 2 + m) % m];
      const cur = nativeCenter[i];
      const next = nativeCenter[(i + 2) % m];
      const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y;
      const dx2 = next.x - cur.x, dy2 = next.y - cur.y;
      const a1 = Math.atan2(dy1, dx1), a2 = Math.atan2(dy2, dx2);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const ds = (Math.hypot(dx1, dy1) + Math.hypot(dx2, dy2)) / 2;
      const k = diff / (ds || 1);

      // Max lateral apex shift: up to (hw - 2.8m) to ensure curb edge safety
      const maxShift = Math.max(0, smoothHalfWidths[i] - 2.8);
      const shift = -Math.tanh(k * 80) * maxShift;
      rawOffsets.push(shift);
    }

    // Smooth offsets with moving average window (window = 5 points ~ 25m) for C1 continuity
    const smoothOffsets: number[] = [];
    const SHIFT_WINDOW = 5;
    for (let i = 0; i < m; i++) {
      let sum = 0, count = 0;
      for (let w = -SHIFT_WINDOW; w <= SHIFT_WINDOW; w++) {
        sum += rawOffsets[(i + w + m) % m];
        count++;
      }
      smoothOffsets.push(sum / count);
    }

    const roadCenter: Point2D[] = [];
    const lmuLeft: Point2D[] = [];
    const lmuRight: Point2D[] = [];
    for (let i = 0; i < m; i++) {
      const prev = nativeCenter[(i - 1 + m) % m];
      const next = nativeCenter[(i + 1) % m];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const offset = smoothOffsets[i];
      const cx = nativeCenter[i].x + nx * offset;
      const cy = nativeCenter[i].y + ny * offset;
      roadCenter.push({
        x: Number(cx.toFixed(2)),
        y: Number(cy.toFixed(2)),
      });

      const hw = smoothHalfWidths[i];
      lmuLeft.push({
        x: Number((cx + nx * hw).toFixed(2)),
        y: Number((cy + ny * hw).toFixed(2)),
      });
      lmuRight.push({
        x: Number((cx - nx * hw).toFixed(2)),
        y: Number((cy - ny * hw).toFixed(2)),
      });
    }

    finalCenter = roadCenter;
    finalLeft = lmuLeft;
    finalRight = lmuRight;
    elevationProfile = rawElevation;

    // Pit lane polyline
    if (t1.length > 0) {
      pitLaneData = {
        centerline: t1.map(p => [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]),
        elevation: t1.map(p => Number(p.y.toFixed(3))),
      };
    }

    // Pit stalls
    if (rawStalls.length > 0) {
      const stallsByType = new Map<number, NativeTrackPoint[]>();
      for (const p of rawStalls) {
        if (!stallsByType.has(p.type)) stallsByType.set(p.type, []);
        stallsByType.get(p.type)!.push(p);
      }
      pitStallsData = [];
      for (const [typeId, pts] of stallsByType.entries()) {
        if (pts.length >= 2) {
          const cx = (pts[0].x + pts[1].x) / 2;
          const cz = (pts[0].z + pts[1].z) / 2;
          const w = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
          const angle = Math.atan2(pts[1].z - pts[0].z, pts[1].x - pts[0].x) * 180 / Math.PI;
          pitStallsData.push({
            id: typeId,
            center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
            widthM: Number(w.toFixed(2)),
            angleDeg: Number(angle.toFixed(1)),
          });
        }
      }
    }

    // Grid slots
    if (rawGrid.length > 0) {
      const gridByType = new Map<number, NativeTrackPoint[]>();
      for (const p of rawGrid) {
        if (!gridByType.has(p.type)) gridByType.set(p.type, []);
        gridByType.get(p.type)!.push(p);
      }
      gridSlotsData = [];
      for (const [typeId, pts] of gridByType.entries()) {
        if (pts.length >= 2) {
          const cx = (pts[0].x + pts[1].x) / 2;
          const cz = (pts[0].z + pts[1].z) / 2;
          gridSlotsData.push({
            slot: typeId,
            center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
          });
        }
      }
    }

    // Authoritative S/F anchor
    const anchorIdx = cfg.sfCenterIndex !== undefined ? cfg.sfCenterIndex : (cfg.layoutKey === 'sarthe_full' ? 206 : 0);
    surveyAnchor = nativeCenter[anchorIdx] || nativeCenter[0];
    console.log(`LMU API native ground truth: ${finalCenter.length} center pts, S/F anchor index ${anchorIdx}, pit lane: ${t1.length} pts, stalls: ${pitStallsData?.length || 0}, grid: ${gridSlotsData?.length || 0}`);

  } else if (cfg.sourceType === 'TUM') {
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

    // TUM's row 0 (before any reversal/orientation choice) is the survey's own documented
    // start/finish point - the authoritative anchor for this track's S/F gate.
    surveyAnchor = applyTransform(tumCenter[0]);

    // Enrich with cached native trackmap data, falling back to the running LMU API.
    if (cfg.lmuTrackId) {
      try {
        const lmuMap = await loadNativeTrackmap(cfg.lmuTrackId);
        const t0 = lmuMap.filter(p => p.type === 0);
        const t1 = lmuMap.filter(p => p.type === 1);
        const rawStalls = lmuMap.filter(p => p.type >= 2 && p.type < 100);
        const rawGrid = lmuMap.filter(p => p.type >= 100);

        if (t1.length > 0) {
          pitLaneData = {
            centerline: t1.map(p => [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]),
            elevation: t1.map(p => Number(p.y.toFixed(3))),
          };
        }

        if (rawStalls.length > 0) {
          const stallsByType = new Map<number, NativeTrackPoint[]>();
          for (const p of rawStalls) {
            if (!stallsByType.has(p.type)) stallsByType.set(p.type, []);
            stallsByType.get(p.type)!.push(p);
          }
          pitStallsData = [];
          for (const [typeId, pts] of stallsByType.entries()) {
            if (pts.length >= 2) {
              const cx = (pts[0].x + pts[1].x) / 2;
              const cz = (pts[0].z + pts[1].z) / 2;
              const w = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
              const angle = Math.atan2(pts[1].z - pts[0].z, pts[1].x - pts[0].x) * 180 / Math.PI;
              pitStallsData.push({
                id: typeId,
                center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
                widthM: Number(w.toFixed(2)),
                angleDeg: Number(angle.toFixed(1)),
              });
            }
          }
        }

        if (rawGrid.length > 0) {
          const gridByType = new Map<number, NativeTrackPoint[]>();
          for (const p of rawGrid) {
            if (!gridByType.has(p.type)) gridByType.set(p.type, []);
            gridByType.get(p.type)!.push(p);
          }
          gridSlotsData = [];
          for (const [typeId, pts] of gridByType.entries()) {
            if (pts.length >= 2) {
              const cx = (pts[0].x + pts[1].x) / 2;
              const cz = (pts[0].z + pts[1].z) / 2;
              gridSlotsData.push({
                slot: typeId,
                center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
              });
            }
          }
        }

        if (t0.length > 0) {
          elevationProfile = [];
          for (let i = 0; i < finalCenter.length; i++) {
            let minD = Infinity, bestY = 0;
            for (const p of t0) {
              const d = Math.hypot(finalCenter[i].x - p.x, finalCenter[i].y - p.z);
              if (d < minD) { minD = d; bestY = p.y; }
            }
            elevationProfile.push(Number(bestY.toFixed(3)));
          }
        }

        console.log(`[${cfg.layoutKey}] Enriched TUM survey with native trackmap pit infrastructure (pit: ${t1.length} pts, stalls: ${pitStallsData?.length || 0}, grid: ${gridSlotsData?.length || 0}) and 3D elevation`);
      } catch (err) {
        console.warn(`[${cfg.layoutKey}] Could not load native trackmap infrastructure for TUM layout:`, err);
      }
    }

  } else if (cfg.sourceType === 'atlas' || cfg.sourceType === 'osm') {
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

  } else if (cfg.sourceType === 'hybrid') {
    // Strategy: Hybrid synthesis anchored to parent circuit survey
    const parentFile = path.resolve('server/data/tracks', `${cfg.parentLayoutKey}.json`);
    if (!fs.existsSync(parentFile)) {
      throw new Error(`Parent track geometry not found for hybrid layout: ${parentFile}`);
    }
    const parentGeom = JSON.parse(fs.readFileSync(parentFile, 'utf8'));

    // Use cached native child geometry first, then query the running LMU API.
    let hybridInput2D = lmu2D;
    let telemElevation: number[] | undefined = undefined;
    let childPitLane: PitLaneData | undefined = undefined;
    let childStalls: PitStallData[] | undefined = undefined;
    let childGrid: GridSlotData[] | undefined = undefined;

    if (cfg.lmuTrackId) {
      try {
        const childMap = await loadNativeTrackmap(cfg.lmuTrackId);
        const t0 = childMap.filter(p => p.type === 0);
          if (t0.length > 0) {
            hybridInput2D = t0.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.z.toFixed(2)) }));
            telemElevation = t0.map(p => Number(p.y.toFixed(3)));
            console.log(`[${cfg.layoutKey}] Sourced child divergent trajectory from native LMU API ground truth (${t0.length} pts)`);
          }
          const t1 = childMap.filter(p => p.type === 1);
          if (t1.length > 0) {
            childPitLane = {
              centerline: t1.map(p => [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]),
              elevation: t1.map(p => Number(p.y.toFixed(3))),
            };
          }
          const rawStalls = childMap.filter(p => p.type >= 2 && p.type < 100);
          if (rawStalls.length > 0) {
            const stallsByType = new Map<number, NativeTrackPoint[]>();
            for (const p of rawStalls) {
              if (!stallsByType.has(p.type)) stallsByType.set(p.type, []);
              stallsByType.get(p.type)!.push(p);
            }
            childStalls = [];
            for (const [typeId, pts] of stallsByType.entries()) {
              if (pts.length >= 2) {
                const cx = (pts[0].x + pts[1].x) / 2;
                const cz = (pts[0].z + pts[1].z) / 2;
                const w = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
                const angle = Math.atan2(pts[1].z - pts[0].z, pts[1].x - pts[0].x) * 180 / Math.PI;
                childStalls.push({
                  id: typeId,
                  center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
                  widthM: Number(w.toFixed(2)),
                  angleDeg: Number(angle.toFixed(1)),
                });
              }
            }
          }
          const rawGrid = childMap.filter(p => p.type >= 100);
          if (rawGrid.length > 0) {
            const gridByType = new Map<number, NativeTrackPoint[]>();
            for (const p of rawGrid) {
              if (!gridByType.has(p.type)) gridByType.set(p.type, []);
              gridByType.get(p.type)!.push(p);
            }
            childGrid = [];
            for (const [typeId, pts] of gridByType.entries()) {
              if (pts.length >= 2) {
                const cx = (pts[0].x + pts[1].x) / 2;
                const cz = (pts[0].z + pts[1].z) / 2;
                childGrid.push({
                  slot: typeId,
                  center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
                });
              }
            }
          }
      } catch (err) {
        console.warn(`[${cfg.layoutKey}] Could not load LMU API map for child layout:`, err);
      }
    }

    const hybrid = synthesizeHybridTrack(
      parentGeom,
      hybridInput2D,
      cfg.nominalWidthM,
      12.0,
      parentGeom.elevationProfile,
      telemElevation
    );

    finalCenter = hybrid.centerline.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }));
    finalLeft = hybrid.left.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }));
    finalRight = hybrid.right.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }));
    elevationProfile = hybrid.elevation ?? parentGeom.elevationProfile;

    // Inherit pit lane & infrastructure from child map if present, else inherit from parent
    pitLaneData = childPitLane ?? parentGeom.pitLane;
    pitStallsData = childStalls ?? parentGeom.pitStalls;
    gridSlotsData = childGrid ?? parentGeom.gridSlots;

    // Inherit authoritative survey anchor from parent S/F line
    if (parentGeom.startFinish) {
      surveyAnchor = { x: parentGeom.startFinish[0], y: parentGeom.startFinish[1] };
    } else if (parentGeom.timingGates?.startFinish?.center) {
      surveyAnchor = { x: parentGeom.timingGates.startFinish.center[0], y: parentGeom.timingGates.startFinish.center[1] };
    }

    transformInfo = {
      scale: 1.0,
      rotationDeg: 0.0,
      tx: 0.0,
      tz: 0.0,
      rmse: 0.0,
    };

    console.log(`Hybrid Synthesis: ${hybrid.sharedPct}% anchored to parent survey [${cfg.parentLayoutKey}] (${parentGeom.source})`);

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

  // Flat, opt-in padding only - see applyUniformCorridorMargin's docs for why a telemetry-
  // derived per-index widen was tried and reverted (hairpin cross-track artefact). A per-track
  // self-correction splice (synthesizeHybridTrack against this track's own telemetry) was also
  // tried for La Sarthe and reverted - raw distance-to-centerline isn't a valid divergence
  // metric (a car legitimately sitting near one edge of a wide track reads the same as a real
  // shape mismatch), and it spliced in telemetry for 40% of the lap instead of just the one
  // chicane. Don't reuse that approach without a metric that accounts for normal track width.
  applyUniformCorridorMargin(finalCenter, finalLeft, finalRight, cfg.corridorMarginM ?? 0);

  // Multi-replay Timing Gate Fitting and Polyline Alignment
  const gateSamples = extractTrackGateSamples(db, cfg.layoutKey, cfg.replayPattern);

  // Fallback anchor for S/F: prefer the source survey's own authoritative start point when one
  // exists, over replayLap[0] - a replay's first recorded telemetry sample is not guaranteed to
  // be at the physical line (out-laps, mid-session joins, DB row splits unrelated to the gate).
  const sfFallback: Point2D = surveyAnchor ?? (replayLap[0] ? { x: replayLap[0].x, y: replayLap[0].z } : finalCenter[0]);
  const sfTangent: Point2D = {
    x: finalCenter[1].x - finalCenter[0].x,
    y: finalCenter[1].y - finalCenter[0].y,
  };

  // Telemetry-derived S/F samples have been found (across every TUM-sourced track) to cluster
  // tens to hundreds of meters from the real line when replays from an unrelated track slip
  // into the match (now fixed in extractTrackGateSamples) - but independent replay laps that
  // genuinely agree with each other are better ground truth than the survey anchor, which is
  // an external real-world reference that doesn't always land exactly on LMU's own modeled
  // line. So: prefer a well-supported consensus cluster among the samples themselves; fall
  // back to the survey anchor only when the samples don't agree with each other, and treat a
  // consensus that's wildly far from the survey anchor as leftover contamination, not signal.
  const CONSENSUS_RADIUS_M = 20;
  const MIN_CONSENSUS_SIZE = 3;
  const SANITY_MAX_DISTANCE_M = 200;

  const consensusCluster = findConsensusCluster(gateSamples.sfSamples, CONSENSUS_RADIUS_M, MIN_CONSENSUS_SIZE);
  let trustedSfSamples: Point2D[];
  if (consensusCluster) {
    const centroid = {
      x: consensusCluster.reduce((a, p) => a + p.x, 0) / consensusCluster.length,
      y: consensusCluster.reduce((a, p) => a + p.y, 0) / consensusCluster.length,
    };
    const distFromAnchor = surveyAnchor ? Math.hypot(centroid.x - surveyAnchor.x, centroid.y - surveyAnchor.y) : 0;
    if (surveyAnchor && distFromAnchor > SANITY_MAX_DISTANCE_M) {
      console.warn(`[${cfg.layoutKey}] Discarding a ${consensusCluster.length}-sample telemetry consensus ${distFromAnchor.toFixed(0)}m from the survey anchor - likely still contamination.`);
      trustedSfSamples = [];
    } else {
      trustedSfSamples = consensusCluster;
    }
  } else if (surveyAnchor) {
    const SURVEY_TRUST_RADIUS_M = 40;
    trustedSfSamples = gateSamples.sfSamples.filter(p => Math.hypot(p.x - surveyAnchor!.x, p.y - surveyAnchor!.y) <= SURVEY_TRUST_RADIUS_M);
    if (trustedSfSamples.length < gateSamples.sfSamples.length) {
      console.warn(`[${cfg.layoutKey}] No telemetry consensus; rejected ${gateSamples.sfSamples.length - trustedSfSamples.length}/${gateSamples.sfSamples.length} S/F samples > ${SURVEY_TRUST_RADIUS_M}m from the survey anchor.`);
    }
  } else {
    trustedSfSamples = gateSamples.sfSamples;
  }

  const sfGate = fitGateLine(trustedSfSamples, sfFallback, sfTangent);

  const sfCenterInter = intersectLineWithPolyline(sfGate.point, sfGate.dir, finalCenter, 35) || findClosestOnPolyline(sfGate.point, finalCenter);

  // Gate line across track must be strictly perpendicular to the track centerline tangent
  const mCenter = finalCenter.length;
  const sfIdx = Math.floor(sfCenterInter.index);
  const pSfPrev = finalCenter[(sfIdx - 1 + mCenter) % mCenter];
  const pSfNext = finalCenter[(sfIdx + 1) % mCenter];
  const sfTdx = pSfNext.x - pSfPrev.x;
  const sfTdy = pSfNext.y - pSfPrev.y;
  const sfTLen = Math.hypot(sfTdx, sfTdy) || 1;
  const sfNormal = { x: -sfTdy / sfTLen, y: sfTdx / sfTLen };

  const sfLeftInter = intersectLineWithPolyline(sfCenterInter.point, sfNormal, finalLeft, 35) || findClosestOnPolyline(sfCenterInter.point, finalLeft);
  const sfRightInter = intersectLineWithPolyline(sfCenterInter.point, { x: -sfNormal.x, y: -sfNormal.y }, finalRight, 35) || findClosestOnPolyline(sfCenterInter.point, finalRight);

  // Roll closed polylines so that index 0 is strictly at the Start/Finish gate
  const rolledCenter = rollPolyline(finalCenter, sfCenterInter.index, sfCenterInter.point);
  const rolledLeft = rollPolyline(finalLeft, sfCenterInter.index, sfLeftInter.point);
  const rolledRight = rollPolyline(finalRight, sfCenterInter.index, sfRightInter.point);
  const rolledElevation = elevationProfile ? rollNumberArray(elevationProfile, sfCenterInter.index) : undefined;

  // Calculate circuit length along rolled centerline (needed below to sanity-check sector gates).
  // Must include the closing segment back to index 0 (same closed-loop convention used by the
  // runtime's buildCenterlineSpatialIndex/projectTrajectoryToCenterline) - summing only
  // index 1..length-1 silently drops that final segment, under-reporting lengthM by a few
  // meters relative to the actual station space real telemetry gets projected into, which
  // breaks start/finish wraparound math for laps trimmed right at the line (see repo memory).
  const lengthM = computeStationAlongPolyline(rolledCenter, rolledCenter.length);

  // A real sector split is never this close to the start/finish line - telemetry-derived S1/S2
  // samples have been observed clustering right next to a wrongly-anchored S/F point, producing
  // "sector 1 at 10m" nonsense. Reject anything implausibly close to either lap boundary rather
  // than emit a gate that isn't a real sector split.
  const MIN_SECTOR_MARGIN_M = 150;
  const isPlausibleSectorStation = (stationM: number) => stationM >= MIN_SECTOR_MARGIN_M && stationM <= lengthM - MIN_SECTOR_MARGIN_M;

  // On the rolled centerline (where index 0 is s=0.0m), detect Sector 1 and Sector 2 timing gates
  let sector1Gate: TimingGateGeometry | undefined = undefined;
  if (gateSamples.s1Samples.length > 0) {
    const s1Fallback = gateSamples.s1Samples[0];
    const s1GateLine = fitGateLine(gateSamples.s1Samples, s1Fallback, { x: 1, y: 0 });
    const s1Center = intersectLineWithPolyline(s1GateLine.point, s1GateLine.dir, rolledCenter, 35) || findClosestOnPolyline(s1GateLine.point, rolledCenter);

    const mRolled = rolledCenter.length;
    const s1Idx = Math.floor(s1Center.index);
    const pS1Prev = rolledCenter[(s1Idx - 1 + mRolled) % mRolled];
    const pS1Next = rolledCenter[(s1Idx + 1) % mRolled];
    const s1Tdx = pS1Next.x - pS1Prev.x;
    const s1Tdy = pS1Next.y - pS1Prev.y;
    const s1TLen = Math.hypot(s1Tdx, s1Tdy) || 1;
    const s1Normal = { x: -s1Tdy / s1TLen, y: s1Tdx / s1TLen };

    const s1Left = intersectLineWithPolyline(s1Center.point, s1Normal, rolledLeft, 35) || findClosestOnPolyline(s1Center.point, rolledLeft);
    const s1Right = intersectLineWithPolyline(s1Center.point, { x: -s1Normal.x, y: -s1Normal.y }, rolledRight, 35) || findClosestOnPolyline(s1Center.point, rolledRight);
    const s1StationM = computeStationAlongPolyline(rolledCenter, s1Center.index);
    if (isPlausibleSectorStation(s1StationM)) {
      sector1Gate = {
        name: 'Sector 1',
        center: [s1Center.point.x, s1Center.point.y],
        left: [s1Left.point.x, s1Left.point.y],
        right: [s1Right.point.x, s1Right.point.y],
        stationM: Number(s1StationM.toFixed(1)),
      };
    } else {
      console.warn(`[${cfg.layoutKey}] Rejected implausible Sector 1 gate at stationM=${s1StationM.toFixed(1)} (lengthM=${lengthM.toFixed(1)}).`);
    }
  }

  let sector2Gate: TimingGateGeometry | undefined = undefined;
  if (gateSamples.s2Samples.length > 0) {
    const s2Fallback = gateSamples.s2Samples[0];
    const s2GateLine = fitGateLine(gateSamples.s2Samples, s2Fallback, { x: 1, y: 0 });
    const s2Center = intersectLineWithPolyline(s2GateLine.point, s2GateLine.dir, rolledCenter, 35) || findClosestOnPolyline(s2GateLine.point, rolledCenter);

    const mRolled = rolledCenter.length;
    const s2Idx = Math.floor(s2Center.index);
    const pS2Prev = rolledCenter[(s2Idx - 1 + mRolled) % mRolled];
    const pS2Next = rolledCenter[(s2Idx + 1) % mRolled];
    const s2Tdx = pS2Next.x - pS2Prev.x;
    const s2Tdy = pS2Next.y - pS2Prev.y;
    const s2TLen = Math.hypot(s2Tdx, s2Tdy) || 1;
    const s2Normal = { x: -s2Tdy / s2TLen, y: s2Tdx / s2TLen };

    const s2Left = intersectLineWithPolyline(s2Center.point, s2Normal, rolledLeft, 35) || findClosestOnPolyline(s2Center.point, rolledLeft);
    const s2Right = intersectLineWithPolyline(s2Center.point, { x: -s2Normal.x, y: -s2Normal.y }, rolledRight, 35) || findClosestOnPolyline(s2Center.point, rolledRight);
    const s2StationM = computeStationAlongPolyline(rolledCenter, s2Center.index);
    if (isPlausibleSectorStation(s2StationM) && (!sector1Gate || s2StationM > sector1Gate.stationM)) {
      sector2Gate = {
        name: 'Sector 2',
        center: [s2Center.point.x, s2Center.point.y],
        left: [s2Left.point.x, s2Left.point.y],
        right: [s2Right.point.x, s2Right.point.y],
        stationM: Number(s2StationM.toFixed(1)),
      };
    } else {
      console.warn(`[${cfg.layoutKey}] Rejected implausible Sector 2 gate at stationM=${s2StationM.toFixed(1)} (lengthM=${lengthM.toFixed(1)}).`);
    }
  }

  const timingGates = {
    startFinish: {
      name: 'Start / Finish',
      center: [sfCenterInter.point.x, sfCenterInter.point.y] as [number, number],
      left: [sfLeftInter.point.x, sfLeftInter.point.y] as [number, number],
      right: [sfRightInter.point.x, sfRightInter.point.y] as [number, number],
      stationM: 0,
    },
    sector1: sector1Gate,
    sector2: sector2Gate,
  };

  // Calculate bounding box
  const allX = [...rolledLeft.map(p => p.x), ...rolledRight.map(p => p.x)];
  const allZ = [...rolledLeft.map(p => p.y), ...rolledRight.map(p => p.y)];
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
    source: cfg.sourceType === 'lmu_api' ? 'LMU-API+Telemetry'
      : cfg.sourceType === 'TUM' ? 'TUM-survey'
      : cfg.sourceType === 'osm' ? 'OpenStreetMap'
      : cfg.sourceType === 'atlas' ? 'track-atlas'
      : cfg.sourceType === 'hybrid' ? `hybrid (${cfg.parentLayoutKey})`
      : 'telemetry-corridor',
    transform: transformInfo,
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ,
      spanX: Number((maxX - minX).toFixed(2)),
      spanZ: Number((maxZ - minZ).toFixed(2)),
    },
    leftBoundary: rolledLeft.map(p => [p.x, p.y]),
    rightBoundary: rolledRight.map(p => [p.x, p.y]),
    centerline: rolledCenter.map(p => [p.x, p.y]),
    nominalWidthM: cfg.nominalWidthM,
    startFinish: [sfCenterInter.point.x, sfCenterInter.point.y],
    timingGates,
    elevationProfile: rolledElevation,
    pitLane: pitLaneData,
    pitStalls: pitStallsData,
    gridSlots: gridSlotsData,
    createdAt: new Date().toISOString(),
  };

  console.log(`Completed [${geometry.layoutKey}]: ${geometry.lengthM}m length, S/F=[${sfCenterInter.point.x}, ${sfCenterInter.point.y}], S1=${sector1Gate?.stationM}m, S2=${sector2Gate?.stationM}m`);
  return geometry;
}

function hasGeometryChanged(existing: TrackBoundaryGeometry, current: TrackBoundaryGeometry): boolean {
  if (!existing.timingGates || !existing.startFinish) {
    return true;
  }
  if (
    Boolean(existing.elevationProfile) !== Boolean(current.elevationProfile) ||
    Boolean(existing.pitLane) !== Boolean(current.pitLane) ||
    Boolean(existing.pitStalls) !== Boolean(current.pitStalls) ||
    Boolean(existing.gridSlots) !== Boolean(current.gridSlots)
  ) {
    return true;
  }
  if (
    existing.elevationProfile && current.elevationProfile &&
    JSON.stringify(existing.elevationProfile) !== JSON.stringify(current.elevationProfile)
  ) {
    return true;
  }
  if (
    existing.pitLane && current.pitLane &&
    JSON.stringify(existing.pitLane) !== JSON.stringify(current.pitLane)
  ) {
    return true;
  }
  if (
    existing.pitStalls && current.pitStalls &&
    JSON.stringify(existing.pitStalls) !== JSON.stringify(current.pitStalls)
  ) {
    return true;
  }
  if (
    existing.gridSlots && current.gridSlots &&
    JSON.stringify(existing.gridSlots) !== JSON.stringify(current.gridSlots)
  ) {
    return true;
  }
  if (
    existing.startFinish[0] !== current.startFinish?.[0] ||
    existing.startFinish[1] !== current.startFinish?.[1]
  ) {
    return true;
  }
  if (
    existing.timingGates?.startFinish?.stationM !== current.timingGates?.startFinish?.stationM ||
    existing.timingGates?.sector1?.stationM !== current.timingGates?.sector1?.stationM ||
    existing.timingGates?.sector2?.stationM !== current.timingGates?.sector2?.stationM
  ) {
    return true;
  }
  if (
    existing.layoutKey !== current.layoutKey ||
    existing.circuitId !== current.circuitId ||
    existing.layoutId !== current.layoutId ||
    existing.trackVenue !== current.trackVenue ||
    existing.trackCourse !== current.trackCourse ||
    existing.lengthM !== current.lengthM ||
    existing.source !== current.source ||
    existing.nominalWidthM !== current.nominalWidthM
  ) {
    return true;
  }
  if (
    (existing.transform?.scale ?? 0) !== (current.transform?.scale ?? 0) ||
    (existing.transform?.rotationDeg ?? 0) !== (current.transform?.rotationDeg ?? 0) ||
    (existing.transform?.tx ?? 0) !== (current.transform?.tx ?? 0) ||
    (existing.transform?.tz ?? 0) !== (current.transform?.tz ?? 0) ||
    (existing.transform?.rmse ?? 0) !== (current.transform?.rmse ?? 0)
  ) {
    return true;
  }
  if (
    existing.bounds.minX !== current.bounds.minX ||
    existing.bounds.maxX !== current.bounds.maxX ||
    existing.bounds.minZ !== current.bounds.minZ ||
    existing.bounds.maxZ !== current.bounds.maxZ ||
    existing.bounds.spanX !== current.bounds.spanX ||
    existing.bounds.spanZ !== current.bounds.spanZ
  ) {
    return true;
  }
  if (
    existing.centerline.length !== current.centerline.length ||
    existing.leftBoundary.length !== current.leftBoundary.length ||
    existing.rightBoundary.length !== current.rightBoundary.length
  ) {
    return true;
  }
  if (
    JSON.stringify(existing.centerline) !== JSON.stringify(current.centerline) ||
    JSON.stringify(existing.leftBoundary) !== JSON.stringify(current.leftBoundary) ||
    JSON.stringify(existing.rightBoundary) !== JSON.stringify(current.rightBoundary)
  ) {
    return true;
  }
  return false;
}

async function main() {
  console.log('🏁 Starting Comprehensive Track Boundary Generation for All 21 Driven Layouts...');

  const db = new Database('server/lmu_cache.db');
  const serverDir = path.resolve('server/data/tracks');
  const publicDir = path.resolve('public/tracks');

  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const targetLayoutArg = process.argv.find(arg => arg.startsWith('--layout='))?.split('=')[1];
  const targetLayouts = targetLayoutArg ? targetLayoutArg.split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : null;
  const configsToProcess = targetLayouts
    ? TRACK_CONFIGS.filter(c => targetLayouts.includes(c.layoutKey))
    : TRACK_CONFIGS;

  if (targetLayouts && configsToProcess.length === 0) {
    console.error(`Layout "${targetLayoutArg}" not found in TRACK_CONFIGS.`);
    process.exit(1);
  }

  const serverIndexFile = path.join(serverDir, 'index.json');
  const publicIndexFile = path.join(publicDir, 'index.json');

  let indexManifest: Array<{
    layoutKey: string;
    circuitId: string;
    layoutId: string;
    trackVenue: string;
    trackCourse: string;
    lengthM: number;
    source: string;
    bounds: any;
    pointsCount: number;
    startFinish?: [number, number];
    timingGates?: any;
    hasElevation?: boolean;
    hasPitLane?: boolean;
  }> = [];

  if (fs.existsSync(serverIndexFile)) {
    try {
      indexManifest = JSON.parse(fs.readFileSync(serverIndexFile, 'utf8'));
    } catch {}
  }

  let updatedCount = 0;
  let unchangedCount = 0;

  for (const cfg of configsToProcess) {
    try {
      const geom = await processTrack(cfg, db);
      const serverFile = path.join(serverDir, `${cfg.layoutKey}.json`);
      const publicFile = path.join(publicDir, `${cfg.layoutKey}.json`);

      let existing: TrackBoundaryGeometry | null = null;
      if (fs.existsSync(serverFile)) {
        try {
          existing = JSON.parse(fs.readFileSync(serverFile, 'utf8'));
        } catch {}
      }

      const changed = !existing || hasGeometryChanged(existing, geom);
      if (!changed && existing) {
        // Geometry has not changed; retain existing createdAt and updatedAt without writing a new version
        geom.createdAt = existing.createdAt;
        if (existing.updatedAt) {
          geom.updatedAt = existing.updatedAt;
        }
        unchangedCount++;
        console.log(`⏩ [${cfg.layoutKey}] No geometry changes; retaining existing version (${existing.updatedAt || existing.createdAt}).`);
      } else {
        const now = new Date().toISOString();
        geom.createdAt = existing?.createdAt || now;
        geom.updatedAt = now;

        const jsonStr = JSON.stringify(geom, null, 2);
        fs.writeFileSync(serverFile, jsonStr, 'utf8');
        fs.writeFileSync(publicFile, jsonStr, 'utf8');
        updatedCount++;
        console.log(`💾 [${cfg.layoutKey}] Geometry updated; wrote new version (updatedAt: ${geom.updatedAt}).`);
      }

      const manifestEntry = {
        layoutKey: geom.layoutKey,
        circuitId: geom.circuitId,
        layoutId: geom.layoutId,
        trackVenue: geom.trackVenue,
        trackCourse: geom.trackCourse,
        lengthM: geom.lengthM,
        source: geom.source,
        bounds: geom.bounds,
        pointsCount: geom.centerline.length,
        startFinish: geom.startFinish,
        timingGates: geom.timingGates,
        hasElevation: Boolean(geom.elevationProfile),
        hasPitLane: Boolean(geom.pitLane),
      };

      const existingManifestIdx = indexManifest.findIndex(m => m.layoutKey === geom.layoutKey);
      if (existingManifestIdx >= 0) {
        indexManifest[existingManifestIdx] = manifestEntry;
      } else {
        indexManifest.push(manifestEntry);
      }
    } catch (err: any) {
      console.error(`❌ Failed processing ${cfg.layoutKey}:`, err.message);
    }
  }

  // Save index.json only if changed
  let existingIndexStr = '';
  if (fs.existsSync(serverIndexFile)) {
    try {
      existingIndexStr = fs.readFileSync(serverIndexFile, 'utf8');
    } catch {}
  }
  const newIndexStr = JSON.stringify(indexManifest, null, 2);
  if (existingIndexStr !== newIndexStr) {
    fs.writeFileSync(serverIndexFile, newIndexStr, 'utf8');
    fs.writeFileSync(publicIndexFile, newIndexStr, 'utf8');
    console.log('💾 index.json: Saved updated catalog manifest.');
  } else {
    console.log('⏩ index.json: No changes detected; skipping rewrite.');
  }

  console.log(`\n🎉 Track Boundary Pipeline complete: ${updatedCount} updated, ${unchangedCount} unchanged.`);
  console.log(`Output locations:`);
  console.log(` - Server Data: ${serverDir}`);
  console.log(` - Public Web:  ${publicDir}`);
}

const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('buildAllTrackBoundaries.ts') ||
  process.argv[1].endsWith('buildAllTrackBoundaries.js') ||
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
);

if (isDirectExecution) {
  main().catch(e => {
    console.error('Fatal error running pipeline:', e);
    process.exit(1);
  });
}
