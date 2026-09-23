export interface Point2D {
  x: number;
  y: number;
}

export interface NativeTrackPoint {
  type: number;
  x: number;
  y: number;
  z: number;
}

export interface PitLaneData {
  centerline: Array<[number, number]>;
  elevation?: number[];
}

export interface PitStallData {
  id: number;
  center: [number, number];
  widthM: number;
  angleDeg?: number;
}

export interface GridSlotData {
  slot: number;
  center: [number, number];
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
  corridorMarginM?: number;
  sectionWidths?: TrackSectionWidth[];
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
