export interface CircuitSpecification {
  layoutKey: string;
  circuitId: string;
  layoutId: string;
  isDefaultLayout: boolean;
  benchmarkName: string;
  sceneDescs: string[];
  officialName: string;
  layoutName: string;
  country: string;
  countryCode: string;
  flagEmoji: string;
  city: string;
  officialLengthMeters: number;
  officialLengthKm: number;
  officialLengthMiles: number;
  turnCount: number;
  direction: 'Clockwise' | 'Counter-Clockwise';
  elevationChangeMeters?: number;
  nominalWidthM?: number;
  famousCorners: string[];
  boundarySource: 'TUM-survey' | 'Track-Atlas' | 'OpenStreetMap' | 'Hybrid' | 'Telemetry-Corridor';
  boundarySourceDescription: string;
  parsedFrom: string;
  fiaGrade?: string;
  openedYear?: number;
}

export const CIRCUIT_SPECIFICATIONS: Record<string, CircuitSpecification> = {
  monza_gp: {
    layoutKey: 'monza_gp',
    circuitId: 'monza',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Monza',
    sceneDescs: ["monzawec"],
    officialName: 'Autodromo Nazionale Monza',
    layoutName: 'Grand Prix Circuit',
    country: 'Italy',
    countryCode: 'IT',
    flagEmoji: '🇮🇹',
    city: 'Monza, Lombardy',
    officialLengthMeters: 5793,
    officialLengthKm: 5.793,
    officialLengthMiles: 3.600,
    turnCount: 11,
    direction: 'Clockwise',
    elevationChangeMeters: 13,
    famousCorners: ['Variante del Rettifilo (T1-T2)', 'Curva Grande (T3)', 'Variante della Roggia (T4-T5)', 'Curve di Lesmo (T6-T7)', 'Variante Ascari (T8-T10)', 'Curva Parabolica / Alboreto (T11)'],
    boundarySource: 'TUM-survey',
    boundarySourceDescription: 'Centimeter-accurate lidar survey from Technical University of Munich (TUM) Racetrack Database aligned to LMU replay telemetry with 0.04% scale precision.',
    parsedFrom: 'LMU Results XML (TrackVenue="Autodromo Nazionale Monza", TrackCourse="Autodromo Nazionale Monza") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1922,
  },
  monza_curvagrande: {
    layoutKey: 'monza_curvagrande',
    circuitId: 'monza',
    layoutId: 'curvagrande',
    isDefaultLayout: false,
    benchmarkName: 'Monza (curvagrande)',
    sceneDescs: ["monzawec_grande"],
    officialName: 'Autodromo Nazionale Monza',
    layoutName: 'Curva Grande Circuit',
    country: 'Italy',
    countryCode: 'IT',
    flagEmoji: '🇮🇹',
    city: 'Monza, Lombardy',
    officialLengthMeters: 5793,
    officialLengthKm: 5.793,
    officialLengthMiles: 3.600,
    turnCount: 10,
    direction: 'Clockwise',
    elevationChangeMeters: 13,
    famousCorners: ['Direct Straight to Curva Grande (Bypasses Rettifilo)', 'Variante della Roggia', 'Lesmo 1 & 2', 'Variante Ascari', 'Curva Parabolica'],
    boundarySource: 'Hybrid',
    boundarySourceDescription: 'Hybrid boundary synthesis (94.6% anchored to TUM survey + 160m telemetry connector bypassing the Rettifilo chicane).',
    parsedFrom: 'LMU Results XML (TrackVenue="Autodromo Nazionale Monza", TrackCourse="Monza Curva Grande Circuit") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1922,
  },
  spa_gp: {
    layoutKey: 'spa_gp',
    circuitId: 'spa',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Spa',
    sceneDescs: ["spaelms","spawec","spawec_endce"],
    officialName: 'Circuit de Spa-Francorchamps',
    layoutName: 'Grand Prix Circuit',
    country: 'Belgium',
    countryCode: 'BE',
    flagEmoji: '🇧🇪',
    city: 'Stavelot / Francorchamps, Ardennes',
    officialLengthMeters: 7004,
    officialLengthKm: 7.004,
    officialLengthMiles: 4.352,
    turnCount: 20,
    direction: 'Clockwise',
    elevationChangeMeters: 102,
    famousCorners: ['La Source Hairpin (T1)', 'Eau Rouge & Raidillon (T2-T4)', 'Kemmel Straight', 'Les Combes (T5-T7)', 'Bruxelles / Rivage (T8)', 'Pouhon / Double Gauche (T10-T11)', 'Fagnes / Pif-Paf (T12-T13)', 'Blanchimont (T16-T17)', 'Bus Stop Chicane (T18-T19)'],
    boundarySource: 'TUM-survey',
    boundarySourceDescription: 'Centimeter-accurate lidar survey from Technical University of Munich (TUM) Racetrack Database with exact 1:1 metric modeling.',
    parsedFrom: 'LMU Results XML (TrackVenue="Circuit de Spa-Francorchamps", TrackCourse="Circuit de Spa-Francorchamps") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1921,
  },
  sarthe_full: {
    layoutKey: 'sarthe_full',
    circuitId: 'sarthe',
    layoutId: 'full',
    isDefaultLayout: true,
    benchmarkName: 'Circuit de la Sarthe',
    sceneDescs: ["lemanswec"],
    officialName: 'Circuit des 24 Heures du Mans',
    layoutName: 'Full 24 Hours Circuit (Circuit de la Sarthe)',
    country: 'France',
    countryCode: 'FR',
    flagEmoji: '🇫🇷',
    city: 'Le Mans, Sarthe',
    officialLengthMeters: 13626,
    officialLengthKm: 13.626,
    officialLengthMiles: 8.467,
    turnCount: 38,
    direction: 'Clockwise',
    elevationChangeMeters: 38,
    famousCorners: ['Dunlop Chicane & Passerelle (T1-T3)', 'Esses de la Forêt & Tertre Rouge (T4-T6)', 'Ligne Droite des Hunaudières (Mulsanne Straight)', 'Chicanes Forza & Michelin (T7-T12)', 'Mulsanne Corner (T13)', 'Indianapolis (T14-T15)', 'Arnage (T16)', 'Porsche Curves (T17-T23)', 'Maison Blanche & Ford Chicanes (T27-T33)'],
    boundarySource: 'Track-Atlas',
    boundarySourceDescription: 'Curvature-adaptive centerline derived from Track-Atlas GPS survey, resampled at 2.5m step intervals with FIA/ACO 12-15m road width model.',
    parsedFrom: 'LMU Results XML (TrackVenue="Circuit de la Sarthe", TrackCourse="Circuit de la Sarthe") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 2 / ACO Homologated',
    openedYear: 1923,
  },
  sarthe_mulsanne: {
    layoutKey: 'sarthe_mulsanne',
    circuitId: 'sarthe',
    layoutId: 'straight',
    isDefaultLayout: false,
    benchmarkName: 'Circuit de la Sarthe (straight)',
    sceneDescs: ["lemanswec_mulsanne"],
    officialName: 'Circuit des 24 Heures du Mans',
    layoutName: 'Mulsanne Circuit (without chicanes)',
    country: 'France',
    countryCode: 'FR',
    flagEmoji: '🇫🇷',
    city: 'Le Mans, Sarthe',
    officialLengthMeters: 13626,
    officialLengthKm: 13.626,
    officialLengthMiles: 8.467,
    turnCount: 32,
    direction: 'Clockwise',
    elevationChangeMeters: 38,
    famousCorners: ['Dunlop Chicane', 'Tertre Rouge', 'Full 6km Unbroken Mulsanne Straight (330+ km/h)', 'Mulsanne Corner', 'Indianapolis', 'Arnage', 'Porsche Curves'],
    boundarySource: 'Track-Atlas',
    boundarySourceDescription: 'Curvature-adaptive centerline derived from Track-Atlas GPS survey with chicanes bypassed.',
    parsedFrom: 'LMU Results XML & REST API (Scene: LEMANSWEC_MULSANNE)',
    fiaGrade: 'FIA Grade 2 / ACO Homologated',
    openedYear: 1923,
  },
  cota_gp: {
    layoutKey: 'cota_gp',
    circuitId: 'cota',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'COTA',
    sceneDescs: ["cotawec"],
    officialName: 'Circuit of the Americas (COTA)',
    layoutName: 'Grand Prix Circuit',
    country: 'United States',
    countryCode: 'US',
    flagEmoji: '🇺🇸',
    city: 'Austin, Texas',
    officialLengthMeters: 5513,
    officialLengthKm: 5.513,
    officialLengthMiles: 3.426,
    turnCount: 20,
    direction: 'Counter-Clockwise',
    elevationChangeMeters: 30,
    famousCorners: ['133-ft Elevation Uphill Blind Apex (T1)', 'Maggotts/Becketts-style Esses (T2-T6)', 'Blind Sweeper (T10)', 'Hairpin (T11)', 'Multi-apex Carousel (T16-T18)'],
    boundarySource: 'TUM-survey',
    boundarySourceDescription: 'Centimeter-accurate lidar survey from Technical University of Munich (TUM) Racetrack Database aligned to LMU replay telemetry.',
    parsedFrom: 'LMU Results XML (TrackVenue="Circuit of the Americas", TrackCourse="Circuit of the Americas") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 2012,
  },
  cota_national: {
    layoutKey: 'cota_national',
    circuitId: 'cota',
    layoutId: 'national',
    isDefaultLayout: false,
    benchmarkName: 'COTA (national)',
    sceneDescs: ["cotawec_national"],
    officialName: 'Circuit of the Americas (COTA)',
    layoutName: 'National Circuit',
    country: 'United States',
    countryCode: 'US',
    flagEmoji: '🇺🇸',
    city: 'Austin, Texas',
    officialLengthMeters: 3702,
    officialLengthKm: 3.702,
    officialLengthMiles: 2.300,
    turnCount: 17,
    direction: 'Counter-Clockwise',
    elevationChangeMeters: 31,
    famousCorners: ['Turn 1 Uphill Apex', 'Esses Bypass Connector', 'Carousel Section'],
    boundarySource: 'Telemetry-Corridor',
    boundarySourceDescription: 'Native LMU simulation trackmesh and telemetry spline.',
    parsedFrom: 'LMU Results XML & REST API (Scene: COTAWEC_NATIONAL)',
    fiaGrade: 'FIA Grade 1',
    openedYear: 2012,
  },
  barcelona_gp: {
    layoutKey: 'barcelona_gp',
    circuitId: 'barcelona',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Barcelona',
    sceneDescs: ["barcelonaelms"],
    officialName: 'Circuit de Barcelona-Catalunya',
    layoutName: 'Grand Prix Circuit (Modern Layout)',
    country: 'Spain',
    countryCode: 'ES',
    flagEmoji: '🇪🇸',
    city: 'Montmeló, Catalonia',
    officialLengthMeters: 4657,
    officialLengthKm: 4.657,
    officialLengthMiles: 2.894,
    turnCount: 14,
    direction: 'Clockwise',
    elevationChangeMeters: 30,
    famousCorners: ['Elf Chicane (T1-T2)', 'Curva Renault (T3)', 'Repsol (T4)', 'Seat Hairpin (T5)', 'Campsa (T9)', 'La Caixa Hairpin (T10)', 'Fast Sweeping Final Turns (T13-T14)'],
    boundarySource: 'TUM-survey',
    boundarySourceDescription: 'Centimeter-accurate lidar survey from Technical University of Munich (TUM) Racetrack Database with high-speed chicane removal.',
    parsedFrom: 'LMU Results XML (TrackVenue="Circuit de Barcelona", TrackCourse="Circuit de Barcelona") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1991,
  },
  interlagos_gp: {
    layoutKey: 'interlagos_gp',
    circuitId: 'interlagos',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Interlagos',
    sceneDescs: ["interlagoswec"],
    officialName: 'Autódromo José Carlos Pace (Interlagos)',
    layoutName: 'Grand Prix Circuit',
    country: 'Brazil',
    countryCode: 'BR',
    flagEmoji: '🇧🇷',
    city: 'São Paulo',
    officialLengthMeters: 4309,
    officialLengthKm: 4.309,
    officialLengthMiles: 2.677,
    turnCount: 15,
    direction: 'Counter-Clockwise',
    elevationChangeMeters: 44,
    famousCorners: ['Senna ‘S’ (T1-T2)', 'Curva do Sol (T3)', 'Descida do Lago (T4-T5)', 'Ferradura (T6-T7)', 'Laranjinha (T8)', 'Bico de Pato (T10)', 'Mergulho (T11)', 'Junção (T12)', 'Subida dos Boxes (T13-T15)'],
    boundarySource: 'TUM-survey',
    boundarySourceDescription: 'Centimeter-accurate lidar survey from Technical University of Munich (TUM) Racetrack Database aligned to LMU replay telemetry.',
    parsedFrom: 'LMU Results XML (TrackVenue="Autódromo José Carlos Pace", TrackCourse="Autódromo José Carlos Pace") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1940,
  },
  silverstone_wec: {
    layoutKey: 'silverstone_wec',
    circuitId: 'silverstone',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Silverstone (GP)',
    sceneDescs: ["silverstonewec","silverstoneelms"],
    officialName: 'Silverstone Circuit',
    layoutName: 'Grand Prix Circuit - WEC',
    country: 'United Kingdom',
    countryCode: 'GB',
    flagEmoji: '🇬🇧',
    city: 'Northamptonshire / Buckinghamshire',
    officialLengthMeters: 5890,
    officialLengthKm: 5.890,
    officialLengthMiles: 3.660,
    turnCount: 18,
    direction: 'Clockwise',
    elevationChangeMeters: 11,
    famousCorners: ['Abbey (T1)', 'Farm (T2)', 'Village & The Loop (T3-T4)', 'Brooklands (T6)', 'Luffield & Woodcote (T7-T8)', 'Copse (T9)', 'Maggotts, Becketts & Chapel (T10-T14)', 'Hangar Straight', 'Stowe (T15)', 'Vale & Club (T16-T18)'],
    boundarySource: 'TUM-survey',
    boundarySourceDescription: 'Centimeter-accurate lidar survey from Technical University of Munich (TUM) Racetrack Database with high-frequency kerb geometry.',
    parsedFrom: 'LMU Results XML (TrackVenue="Silverstone Circuit", TrackCourse="Silverstone Grand Prix Circuit - WEC") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1948,
  },
  silverstone_national: {
    layoutKey: 'silverstone_national',
    circuitId: 'silverstone',
    layoutId: 'national',
    isDefaultLayout: false,
    benchmarkName: 'Silverstone (National)',
    sceneDescs: ["silverstone_national"],
    officialName: 'Silverstone Circuit',
    layoutName: 'National Circuit',
    country: 'United Kingdom',
    countryCode: 'GB',
    flagEmoji: '🇬🇧',
    city: 'Northamptonshire / Buckinghamshire',
    officialLengthMeters: 2639,
    officialLengthKm: 2.639,
    officialLengthMiles: 1.640,
    turnCount: 6,
    direction: 'Clockwise',
    elevationChangeMeters: 6,
    famousCorners: ['Copse (T1)', 'Maggotts (T2)', 'Wellington Straight Bypass', 'Brooklands', 'Luffield', 'Woodcote'],
    boundarySource: 'Telemetry-Corridor',
    boundarySourceDescription: 'Native LMU simulation trackmesh and telemetry spline.',
    parsedFrom: 'LMU Results XML & REST API (Scene: SILVERSTONE_NATIONAL)',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1948,
  },
  silverstone_international: {
    layoutKey: 'silverstone_international',
    circuitId: 'silverstone',
    layoutId: 'international',
    isDefaultLayout: false,
    benchmarkName: 'Silverstone (International)',
    sceneDescs: ["silverstone_international"],
    officialName: 'Silverstone Circuit',
    layoutName: 'International Circuit',
    country: 'United Kingdom',
    countryCode: 'GB',
    flagEmoji: '🇬🇧',
    city: 'Northamptonshire / Buckinghamshire',
    officialLengthMeters: 2979,
    officialLengthKm: 2.979,
    officialLengthMiles: 1.851,
    turnCount: 10,
    direction: 'Clockwise',
    elevationChangeMeters: 11,
    famousCorners: ['Abbey', 'Farm', 'The Loop', 'Hangar Straight Shortcut', 'Stowe', 'Vale', 'Club'],
    boundarySource: 'Telemetry-Corridor',
    boundarySourceDescription: 'Native LMU simulation trackmesh and telemetry spline.',
    parsedFrom: 'LMU Results XML & REST API (Scene: SILVERSTONE_INTERNATIONAL)',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1948,
  },
  bahrain_wec: {
    layoutKey: 'bahrain_wec',
    circuitId: 'bahrain',
    layoutId: 'wec',
    isDefaultLayout: true,
    benchmarkName: 'Bahrain (wec)',
    sceneDescs: ["bahrainwec"],
    officialName: 'Bahrain International Circuit',
    layoutName: 'Grand Prix Circuit (WEC 8 Hours)',
    country: 'Bahrain',
    countryCode: 'BH',
    flagEmoji: '🇧🇭',
    city: 'Sakhir, Southern Governorate',
    officialLengthMeters: 5412,
    officialLengthKm: 5.412,
    officialLengthMiles: 3.363,
    turnCount: 15,
    direction: 'Clockwise',
    elevationChangeMeters: 17,
    famousCorners: ['Michael Schumacher Turn (T1-T3)', 'Oasis Turn (T4)', 'High-speed Esses (T5-T7)', 'Downhill Off-camber Hairpin (T8-T10)', 'Double Apex (T14-T15)'],
    boundarySource: 'TUM-survey',
    boundarySourceDescription: 'Centimeter-accurate lidar survey from Technical University of Munich (TUM) Racetrack Database aligned to LMU replay telemetry.',
    parsedFrom: 'LMU Results XML (TrackVenue="Bahrain International Circuit", TrackCourse="Bahrain International Circuit") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 2004,
  },
  bahrain_outer: {
    layoutKey: 'bahrain_outer',
    circuitId: 'bahrain',
    layoutId: 'outer',
    isDefaultLayout: false,
    benchmarkName: 'Bahrain (outer)',
    sceneDescs: ["bahrainwec_outer"],
    officialName: 'Bahrain International Circuit',
    layoutName: 'Outer Circuit',
    country: 'Bahrain',
    countryCode: 'BH',
    flagEmoji: '🇧🇭',
    city: 'Sakhir, Southern Governorate',
    officialLengthMeters: 3543,
    officialLengthKm: 3.543,
    officialLengthMiles: 2.201,
    turnCount: 11,
    direction: 'Clockwise',
    elevationChangeMeters: 19,
    famousCorners: ['T1-T3 Complex', 'Outer Link High-speed Sweepers (T4-T8)', 'Double Apex Final Turns (T10-T11)'],
    boundarySource: 'Hybrid',
    boundarySourceDescription: 'Hybrid boundary synthesis (69.7% anchored to Bahrain WEC TUM survey + outer link connector matching official 3,543m FIA homologation length).',
    parsedFrom: 'LMU Results XML (TrackVenue="Bahrain International Circuit", TrackCourse="Bahrain Outer Circuit") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 2004,
  },
  bahrain_paddock: {
    layoutKey: 'bahrain_paddock',
    circuitId: 'bahrain',
    layoutId: 'paddock',
    isDefaultLayout: false,
    benchmarkName: 'Bahrain (paddock)',
    sceneDescs: ["bahrainwec_paddock"],
    officialName: 'Bahrain International Circuit',
    layoutName: 'Paddock Circuit',
    country: 'Bahrain',
    countryCode: 'BH',
    flagEmoji: '🇧🇭',
    city: 'Sakhir, Southern Governorate',
    officialLengthMeters: 3705,
    officialLengthKm: 3.705,
    officialLengthMiles: 2.302,
    turnCount: 10,
    direction: 'Clockwise',
    elevationChangeMeters: 16,
    famousCorners: ['Paddock Straight Bypass', 'Inner Infield Complex', 'Technical Hairpin Sections'],
    boundarySource: 'Hybrid',
    boundarySourceDescription: 'Hybrid boundary synthesis (67.2% anchored to Bahrain WEC TUM survey + inner paddock link connector).',
    parsedFrom: 'LMU Results XML (TrackVenue="Bahrain International Circuit", TrackCourse="Bahrain Paddock Circuit") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 2004,
  },
  bahrain_endurance: {
    layoutKey: 'bahrain_endurance',
    circuitId: 'bahrain',
    layoutId: 'endurance',
    isDefaultLayout: false,
    benchmarkName: 'Bahrain (endurance)',
    sceneDescs: ["bahrainwec_endce"],
    officialName: 'Bahrain International Circuit',
    layoutName: 'Endurance Circuit',
    country: 'Bahrain',
    countryCode: 'BH',
    flagEmoji: '🇧🇭',
    city: 'Sakhir, Southern Governorate',
    officialLengthMeters: 6299,
    officialLengthKm: 6.299,
    officialLengthMiles: 3.914,
    turnCount: 24,
    direction: 'Clockwise',
    elevationChangeMeters: 19,
    famousCorners: ['T1-T3 Complex', 'Extended Infield Loop (T4-T13)', 'High-speed Sweepers', 'Double Apex (T23-T24)'],
    boundarySource: 'Hybrid',
    boundarySourceDescription: 'Native LMU simulation trackmesh and telemetry spline.',
    parsedFrom: 'LMU Results XML & REST API (Scene: BAHRAINWEC_ENDCE)',
    fiaGrade: 'FIA Grade 1',
    openedYear: 2004,
  },
  imola_gp: {
    layoutKey: 'imola_gp',
    circuitId: 'imola',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Imola',
    sceneDescs: ["imolaelms","imolawec"],
    officialName: 'Autodromo Internazionale Enzo e Dino Ferrari',
    layoutName: 'Grand Prix Circuit (Imola)',
    country: 'Italy',
    countryCode: 'IT',
    flagEmoji: '🇮🇹',
    city: 'Imola, Emilia-Romagna',
    officialLengthMeters: 4909,
    officialLengthKm: 4.909,
    officialLengthMiles: 3.050,
    turnCount: 20,
    direction: 'Counter-Clockwise',
    elevationChangeMeters: 34,
    famousCorners: ['Variante Tamburello (T2-T4)', 'Variante Villeneuve (T5-T6)', 'Tosa Hairpin (T7)', 'Piratella (T9)', 'Acque Minerali (T11-T13)', 'Variante Alta (T14-T15)', 'Rivazza 1 & 2 (T17-T18)'],
    boundarySource: 'Track-Atlas',
    boundarySourceDescription: 'Curvature-adaptive centerline derived from Track-Atlas GPS survey, resampled at 2.5m step intervals with FIA homologated 12.5m road width.',
    parsedFrom: 'LMU Results XML (TrackVenue="Autodromo Enzo e Dino Ferrari", TrackCourse="Autodromo Enzo e Dino Ferrari") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1953,
  },
  daytona_road_course: {
    layoutKey: 'daytona_road_course',
    circuitId: 'daytona',
    layoutId: 'road',
    isDefaultLayout: true,
    benchmarkName: 'Daytona',
    sceneDescs: ["daytonarc"],
    officialName: 'Daytona International Speedway',
    layoutName: 'Road Course (with Le Mans Chicane)',
    country: 'United States',
    countryCode: 'US',
    flagEmoji: '🇺🇸',
    city: 'Daytona Beach, Florida',
    officialLengthMeters: 5729,
    officialLengthKm: 5.729,
    officialLengthMiles: 3.560,
    turnCount: 13,
    direction: 'Counter-Clockwise',
    elevationChangeMeters: 4,
    famousCorners: ['Infield Horseshoe (T1)', 'International Horseshoe (T3)', 'Kink (T4)', 'West Hairpin (T5-T6)', '31° High-banked Oval Turns (T7 & T13)', 'Backstretch Le Mans "Bus Stop" Chicane (T8-T11)'],
    boundarySource: 'OpenStreetMap',
    boundarySourceDescription: 'OpenStreetMap high-resolution geometry (OSM Relation 5254136 with Le Mans Chicane) aligned to LMU replay telemetry via Procrustes similarity.',
    parsedFrom: 'LMU Results XML (TrackVenue="Daytona International Speedway", TrackCourse="Daytona International Speedway Road Course") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 2 / IMSA Homologated',
    openedYear: 1959,
  },
  fuji_chicane: {
    layoutKey: 'fuji_chicane',
    circuitId: 'fuji',
    layoutId: 'chicane',
    isDefaultLayout: true,
    benchmarkName: 'Fuji (chicane)',
    sceneDescs: ["fujiwec"],
    officialName: 'Fuji Speedway',
    layoutName: 'Grand Prix Circuit (with Dunlop Chicane)',
    country: 'Japan',
    countryCode: 'JP',
    flagEmoji: '🇯🇵',
    city: 'Oyama, Shizuoka Prefecture',
    officialLengthMeters: 4563,
    officialLengthKm: 4.563,
    officialLengthMiles: 2.835,
    turnCount: 16,
    direction: 'Clockwise',
    elevationChangeMeters: 37,
    famousCorners: ['1.475 km Main Straight', 'T1 Daiichi (First Corner Hairpin)', 'Coca-Cola Corner (T3)', '100R (T4-T5)', 'Hairpin Corner (T6)', 'Dunlop Chicane (T10-T12)', '13th Corner', 'GR Supra / Netz Corner (T15)', 'Panasonic Corner (T16)'],
    boundarySource: 'Track-Atlas',
    boundarySourceDescription: 'Curvature-adaptive centerline derived from Track-Atlas GPS survey with 15m road width and Procrustes alignment to LMU telemetry.',
    parsedFrom: 'LMU Results XML (TrackVenue="Fuji Speedway", TrackCourse="Fuji Speedway") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1965,
  },
  fuji_classic: {
    layoutKey: 'fuji_classic',
    circuitId: 'fuji',
    layoutId: 'classic',
    isDefaultLayout: false,
    benchmarkName: 'Fuji (classic)',
    sceneDescs: ["fujiwec_cl"],
    officialName: 'Fuji Speedway',
    layoutName: 'Classic Circuit (without Dunlop Chicane)',
    country: 'Japan',
    countryCode: 'JP',
    flagEmoji: '🇯🇵',
    city: 'Oyama, Shizuoka Prefecture',
    officialLengthMeters: 4526,
    officialLengthKm: 4.526,
    officialLengthMiles: 2.812,
    turnCount: 14,
    direction: 'Clockwise',
    elevationChangeMeters: 37,
    famousCorners: ['Main Straight', 'First Corner', '100R', 'Hairpin', 'Dunlop Bypass Straight', '13th Corner', 'Netz Corner', 'Panasonic Corner'],
    boundarySource: 'Hybrid',
    boundarySourceDescription: 'Hybrid boundary synthesis (97.7% anchored to Fuji GP Track-Atlas survey + 100m straight bypass removing the Dunlop chicane).',
    parsedFrom: 'LMU Results XML (TrackVenue="Fuji Speedway", TrackCourse="Fuji Speedway Classic") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1965,
  },
  portimao_wec: {
    layoutKey: 'portimao_wec',
    circuitId: 'portimao',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Portimao',
    sceneDescs: ["portimaoelms","portimaowec"],
    officialName: 'Autódromo Internacional do Algarve (Portimão)',
    layoutName: 'Grand Prix Circuit - WEC',
    country: 'Portugal',
    countryCode: 'PT',
    flagEmoji: '🇵🇹',
    city: 'Portimão, Algarve',
    officialLengthMeters: 4653,
    officialLengthKm: 4.653,
    officialLengthMiles: 2.891,
    turnCount: 15,
    direction: 'Clockwise',
    elevationChangeMeters: 28,
    famousCorners: ['Primeira (T1)', 'Lagos (T3)', 'Hairpin (T5)', 'Portimão Blind Crest (T8)', 'Craig Jones (T9)', 'Torre VIP Hairpin (T10-T11)', 'Galp (T14)', 'Curvão Blind Downhill Rollercoaster Drop (T15)'],
    boundarySource: 'OpenStreetMap',
    boundarySourceDescription: 'OpenStreetMap high-resolution geometry (OSM Relation 7509968) resampled at 2.5m intervals and aligned to LMU replay telemetry.',
    parsedFrom: 'LMU Results XML (TrackVenue="Algarve International Circuit", TrackCourse="Algarve International Circuit") & Binary .Vcr Replay Stream',
    nominalWidthM: 14.0,
    fiaGrade: 'FIA Grade 1',
    openedYear: 2008,
  },
  sebring_full: {
    layoutKey: 'sebring_full',
    circuitId: 'sebring',
    layoutId: 'full',
    isDefaultLayout: true,
    benchmarkName: 'Sebring',
    sceneDescs: ["sebringwec"],
    officialName: 'Sebring International Raceway',
    layoutName: 'Full 12-Hour Circuit',
    country: 'United States',
    countryCode: 'US',
    flagEmoji: '🇺🇸',
    city: 'Sebring, Florida',
    officialLengthMeters: 6019,
    officialLengthKm: 6.019,
    officialLengthMiles: 3.740,
    turnCount: 17,
    direction: 'Clockwise',
    elevationChangeMeters: 3,
    famousCorners: ['Rough Concrete Bumps Turn 1 (T1)', 'Apex Hairpin (T3)', 'Hairpin (T7)', 'Fangio Bends (T8)', 'Cunningham (T10)', 'Collier (T11)', 'Tower Turn (T13)', 'Le Mans / Ulmann Straight', 'Sunset Bend Bumpy Concrete Carousel (T17)'],
    boundarySource: 'Track-Atlas',
    boundarySourceDescription: 'Curvature-adaptive centerline derived from Track-Atlas GPS survey with FIA/IMSA 12-14m road width model.',
    parsedFrom: 'LMU Results XML (TrackVenue="Sebring International Raceway", TrackCourse="Sebring International Raceway") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 2 / IMSA Homologated',
    openedYear: 1950,
  },
  sebring_school: {
    layoutKey: 'sebring_school',
    circuitId: 'sebring',
    layoutId: 'school',
    isDefaultLayout: false,
    benchmarkName: 'Sebring (school)',
    sceneDescs: ["sebringwec_school"],
    officialName: 'Sebring International Raceway',
    layoutName: 'School Circuit (Short Layout)',
    country: 'United States',
    countryCode: 'US',
    flagEmoji: '🇺🇸',
    city: 'Sebring, Florida',
    officialLengthMeters: 3219,
    officialLengthKm: 3.219,
    officialLengthMiles: 2.000,
    turnCount: 7,
    direction: 'Clockwise',
    elevationChangeMeters: 2,
    famousCorners: ['Turn 1 Concrete', 'Hairpin Section', 'Runway Paddock Connector', 'Sunset Bend'],
    boundarySource: 'Hybrid',
    boundarySourceDescription: 'Hybrid boundary synthesis (97.1% anchored to Sebring Full Track-Atlas survey + runway paddock shortcut connector).',
    parsedFrom: 'LMU Results XML (TrackVenue="Sebring International Raceway", TrackCourse="Sebring School Circuit") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 2',
    openedYear: 1950,
  },
  laguna_seca: {
    layoutKey: 'laguna_seca',
    circuitId: 'laguna_seca',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Laguna Seca',
    sceneDescs: ["lagunaseca"],
    officialName: 'WeatherTech Raceway Laguna Seca',
    layoutName: 'Grand Prix Circuit',
    country: 'United States',
    countryCode: 'US',
    flagEmoji: '🇺🇸',
    city: 'Monterey County, California',
    officialLengthMeters: 3602,
    officialLengthKm: 3.602,
    officialLengthMiles: 2.238,
    turnCount: 11,
    direction: 'Counter-Clockwise',
    elevationChangeMeters: 55,
    famousCorners: ['Andretti Hairpin (T2)', 'Rahal Straight', 'The Corkscrew 5.5-story Blind Plunge (T8-T8A)', 'Rainey Curve (T9)', 'Final Hairpin (T11)'],
    boundarySource: 'Track-Atlas',
    boundarySourceDescription: 'Curvature-adaptive centerline derived from Track-Atlas GPS survey, resampled at 2.5m step intervals with Procrustes similarity alignment.',
    parsedFrom: 'LMU Results XML (TrackVenue="WeatherTech Raceway Laguna Seca", TrackCourse="WeatherTech Raceway Laguna Seca") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 2 / IMSA Homologated',
    openedYear: 1957,
  },
  qatar_short: {
    layoutKey: 'qatar_short',
    circuitId: 'qatar',
    layoutId: 'short',
    isDefaultLayout: false,
    benchmarkName: 'Qatar (short)',
    sceneDescs: ["qatarwec_short"],
    officialName: 'Lusail International Circuit',
    layoutName: 'Short Circuit',
    country: 'Qatar',
    countryCode: 'QA',
    flagEmoji: '🇶🇦',
    city: 'Lusail, Al Daayen',
    officialLengthMeters: 3701,
    officialLengthKm: 3.701,
    officialLengthMiles: 2.300,
    turnCount: 11,
    direction: 'Clockwise',
    elevationChangeMeters: 4,
    famousCorners: ['Main Straight', 'Turn 1 Hairpin', 'Inner Short Infield Link', 'High-speed Final Complex'],
    boundarySource: 'Telemetry-Corridor',
    boundarySourceDescription: 'Native telemetry limit corridor synthesized directly from multi-car high-frequency LMU binary replay telemetry.',
    parsedFrom: 'LMU Results XML (TrackVenue="Lusail International Circuit", TrackCourse="Lusail Short Circuit") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 2004,
  },
  qatar_gp: {
    layoutKey: 'qatar_gp',
    circuitId: 'qatar',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Qatar',
    sceneDescs: ["qatarwec"],
    officialName: 'Lusail International Circuit',
    layoutName: 'Grand Prix Circuit (Qatar 1812KM)',
    country: 'Qatar',
    countryCode: 'QA',
    flagEmoji: '🇶🇦',
    city: 'Lusail, Al Daayen',
    officialLengthMeters: 5400,
    officialLengthKm: 5.400,
    officialLengthMiles: 3.355,
    turnCount: 16,
    direction: 'Clockwise',
    elevationChangeMeters: 4,
    famousCorners: ['1.068 km Main Straight', 'Turn 1 Hard Braking', 'Triple-Apex High-G Complex (T12-T14)', 'Turn 16 Final Sweeper'],
    boundarySource: 'Telemetry-Corridor',
    boundarySourceDescription: 'Native LMU simulation trackmesh and telemetry spline.',
    parsedFrom: 'LMU Results XML & REST API (Scene: QATARWEC)',
    fiaGrade: 'FIA Grade 1',
    openedYear: 2004,
  },
  paul_ricard_1a_v2_short: {
    layoutKey: 'paul_ricard_1a_v2_short',
    circuitId: 'paul_ricard',
    layoutId: '1a_v2_short',
    isDefaultLayout: false,
    benchmarkName: 'Paul Ricard (1A v2 short)',
    sceneDescs: ["paulricard1a-v2-short"],
    officialName: 'Circuit Paul Ricard',
    layoutName: '1A-V2 Short Circuit',
    country: 'France',
    countryCode: 'FR',
    flagEmoji: '🇫🇷',
    city: 'Le Castellet, Var',
    officialLengthMeters: 5227,
    officialLengthKm: 5.227,
    officialLengthMiles: 3.248,
    turnCount: 14,
    direction: 'Clockwise',
    elevationChangeMeters: 30,
    famousCorners: ['S de la Verrerie (T1-T2)', 'Sainte-Baume (T3-T5)', 'Ligne Droite du Mistral with Chicane (T6-T9)', 'Courbe de Signes 290+ km/h Flat-out Sweeper (T10)', 'Double Droite du Beausset (T11-T12)', 'Bendor (T13)', 'Pont (T14)'],
    boundarySource: 'OpenStreetMap',
    boundarySourceDescription: 'OpenStreetMap high-resolution geometry (OSM Relation 17590236) resampled at 2.5m intervals and aligned to LMU replay telemetry.',
    parsedFrom: 'LMU Results XML (TrackVenue="Paul Ricard Circuit", TrackCourse="Paul Ricard - 1A-V2-Short") & Binary .Vcr Replay Stream',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1970,
  },
  paul_ricard_1a_v2: {
    layoutKey: 'paul_ricard_1a_v2',
    circuitId: 'paul_ricard',
    layoutId: '1a_v2',
    isDefaultLayout: true,
    benchmarkName: 'Paul Ricard (1A v2)',
    sceneDescs: ["paulricard1a-v2","paulricardelms"],
    officialName: 'Circuit Paul Ricard',
    layoutName: '1A-V2 Circuit (with Mistral Chicane)',
    country: 'France',
    countryCode: 'FR',
    flagEmoji: '🇫🇷',
    city: 'Le Castellet, Var',
    officialLengthMeters: 5842,
    officialLengthKm: 5.842,
    officialLengthMiles: 3.630,
    turnCount: 15,
    direction: 'Clockwise',
    elevationChangeMeters: 30,
    famousCorners: ['S de la Verrerie', 'Chicane Nord', 'Courbe de Signes', 'Le Beausset'],
    boundarySource: 'OpenStreetMap',
    boundarySourceDescription: 'OpenStreetMap high-resolution geometry and LMU replay telemetry.',
    parsedFrom: 'LMU Results XML & REST API (Scene: PAULRICARD1A-V2)',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1970,
  },
  paul_ricard_1a: {
    layoutKey: 'paul_ricard_1a',
    circuitId: 'paul_ricard',
    layoutId: '1a',
    isDefaultLayout: false,
    benchmarkName: 'Paul Ricard (1A)',
    sceneDescs: ["paulricard1a"],
    officialName: 'Circuit Paul Ricard',
    layoutName: '1A Circuit (without Mistral Chicane)',
    country: 'France',
    countryCode: 'FR',
    flagEmoji: '🇫🇷',
    city: 'Le Castellet, Var',
    officialLengthMeters: 5752,
    officialLengthKm: 5.752,
    officialLengthMiles: 3.574,
    turnCount: 13,
    direction: 'Clockwise',
    elevationChangeMeters: 30,
    famousCorners: ['S de la Verrerie', 'Mistral 1.8km Full Straight (330+ km/h)', 'Courbe de Signes Flat-out', 'Le Beausset'],
    boundarySource: 'OpenStreetMap',
    boundarySourceDescription: 'OpenStreetMap geometry aligned to LMU replay telemetry.',
    parsedFrom: 'LMU Results XML & REST API (Scene: PAULRICARD1A)',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1970,
  },
  paul_ricard_3a: {
    layoutKey: 'paul_ricard_3a',
    circuitId: 'paul_ricard',
    layoutId: '3a',
    isDefaultLayout: false,
    benchmarkName: 'Paul Ricard (3A)',
    sceneDescs: ["paulricard3a"],
    officialName: 'Circuit Paul Ricard',
    layoutName: '3A Short Circuit',
    country: 'France',
    countryCode: 'FR',
    flagEmoji: '🇫🇷',
    city: 'Le Castellet, Var',
    officialLengthMeters: 3793,
    officialLengthKm: 3.793,
    officialLengthMiles: 2.357,
    turnCount: 13,
    direction: 'Clockwise',
    elevationChangeMeters: 20,
    famousCorners: ['Short Infield Chicane', 'North Loop', 'Le Beausset'],
    boundarySource: 'OpenStreetMap',
    boundarySourceDescription: 'OpenStreetMap geometry aligned to LMU replay telemetry.',
    parsedFrom: 'LMU Results XML & REST API (Scene: PAULRICARD3A)',
    fiaGrade: 'FIA Grade 1',
    openedYear: 1970,
  },
  long_beach: {
    layoutKey: 'long_beach',
    circuitId: 'long_beach',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Long Beach',
    sceneDescs: ["longbeach"],
    officialName: 'Grand Prix of Long Beach',
    layoutName: 'Street Circuit',
    country: 'United States',
    countryCode: 'US',
    flagEmoji: '🇺🇸',
    city: 'Long Beach, California',
    officialLengthMeters: 3167,
    officialLengthKm: 3.167,
    officialLengthMiles: 1.968,
    turnCount: 11,
    direction: 'Clockwise',
    elevationChangeMeters: 3,
    famousCorners: ['Shoreline Drive Straight', 'Turn 1 Left Sweeper', 'Fountain Section (T2-T3)', 'Pine Avenue (T6)', 'Seaside Way', 'Turn 11 Tight Hairpin'],
    boundarySource: 'Telemetry-Corridor',
    boundarySourceDescription: 'Native LMU simulation trackmesh and telemetry spline.',
    parsedFrom: 'LMU Results XML & REST API (Scene: LONGBEACH)',
    fiaGrade: 'FIA Grade 2 / IMSA Homologated',
    openedYear: 1975,
  },
  road_atlanta: {
    layoutKey: 'road_atlanta',
    circuitId: 'road_atlanta',
    layoutId: 'gp',
    isDefaultLayout: true,
    benchmarkName: 'Road Atlanta',
    sceneDescs: ["roadatlanta"],
    officialName: 'Michelin Raceway Road Atlanta',
    layoutName: 'Grand Prix Circuit',
    country: 'United States',
    countryCode: 'US',
    flagEmoji: '🇺🇸',
    city: 'Braselton, Georgia',
    officialLengthMeters: 4088,
    officialLengthKm: 4.088,
    officialLengthMiles: 2.540,
    turnCount: 12,
    direction: 'Clockwise',
    elevationChangeMeters: 38,
    famousCorners: ['Turn 1 Uphill Blind Crest', 'The Esses (T2-T4)', 'Turn 5 Uphill Left', 'Turn 7 Leading to Long Backstraight', 'Turn 10A-10B Downhill Chicane', 'Turn 12 Under the Bridge Blind Plunge'],
    boundarySource: 'Telemetry-Corridor',
    boundarySourceDescription: 'Native LMU simulation trackmesh and telemetry spline.',
    parsedFrom: 'LMU Results XML & REST API (Scene: ROADATLANTA)',
    fiaGrade: 'FIA Grade 2 / IMSA Homologated',
    openedYear: 1970,
  },
};

/**
 * Derived lookup table mapping all known LMU internal sceneDesc codes (in lowercase)
 * directly to repository layoutKeys without duplicate maintenance.
 */
export const LMU_SCENE_DESC_MAP: Record<string, string> = Object.fromEntries(
  Object.values(CIRCUIT_SPECIFICATIONS).flatMap(spec =>
    spec.sceneDescs.map(desc => [desc.toLowerCase(), spec.layoutKey])
  )
);

function createUnknownCircuitSpec(venueOrKey?: string | null, course?: string | null): CircuitSpecification {
  const cleanName = venueOrKey || 'Circuit';
  const cleanKey = (venueOrKey || 'unknown').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return {
    layoutKey: cleanKey === 'unknown' ? 'unknown' : cleanKey,
    circuitId: (venueOrKey || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown',
    layoutId: (course || 'default').toLowerCase().replace(/[^a-z0-9]/g, '') || 'default',
    isDefaultLayout: false,
    benchmarkName: venueOrKey ? venueOrKey.trim() : 'Unknown Track',
    sceneDescs: [],
    officialName: cleanName,
    layoutName: course || cleanName,
    country: 'International',
    countryCode: 'UN',
    flagEmoji: '🏁',
    city: 'Circuit Venue',
    officialLengthMeters: 0,
    officialLengthKm: 0,
    officialLengthMiles: 0,
    turnCount: 0,
    direction: 'Clockwise',
    famousCorners: [],
    boundarySource: 'Telemetry-Corridor',
    boundarySourceDescription: 'Telemetry corridor calibrated from LMU simulation files.',
    parsedFrom: 'LMU Results XML & Binary .Vcr Replays',
  };
}

/**
 * Canonical track resolution engine and circuit specification provider.
 * Single source of truth evaluating explicit key, sceneDesc, replayName, benchmarkName,
 * trackLengthMeters, and canonical layout tokens without guesswork.
 */
export function getCircuitSpecification(
  venueOrKey?: string | null,
  course?: string | null,
  sceneDesc?: string | null,
  replayName?: string | null,
  explicitKey?: string | null,
  trackLengthMeters?: number | null
): CircuitSpecification {
  // 1. Explicit key
  if (explicitKey) {
    if (CIRCUIT_SPECIFICATIONS[explicitKey]) {
      return CIRCUIT_SPECIFICATIONS[explicitKey];
    }
    return { ...createUnknownCircuitSpec(venueOrKey, course), layoutKey: explicitKey };
  }

  // 2. Direct lookup by layoutKey
  if (venueOrKey && CIRCUIT_SPECIFICATIONS[venueOrKey]) {
    return CIRCUIT_SPECIFICATIONS[venueOrKey];
  }

  // 3. Direct match by LMU engine sceneDesc (highest priority ground truth)
  if (sceneDesc) {
    const cleanScene = sceneDesc.toLowerCase().replace(/\.scn$/i, '').trim();
    const mappedKey = LMU_SCENE_DESC_MAP[cleanScene];
    if (mappedKey && CIRCUIT_SPECIFICATIONS[mappedKey]) {
      return CIRCUIT_SPECIFICATIONS[mappedKey];
    }
  }

  // 4. Direct match by replay filename if it matches a sceneDesc or layoutKey
  if (replayName) {
    const cleanReplay = replayName.toLowerCase().replace(/\.vcr$/i, '').trim();
    if (CIRCUIT_SPECIFICATIONS[cleanReplay]) {
      return CIRCUIT_SPECIFICATIONS[cleanReplay];
    }
    const mappedKey = LMU_SCENE_DESC_MAP[cleanReplay];
    if (mappedKey && CIRCUIT_SPECIFICATIONS[mappedKey]) {
      return CIRCUIT_SPECIFICATIONS[mappedKey];
    }
  }

  const combined = `${venueOrKey || ''} ${course || ''} ${replayName || ''}`.toLowerCase().trim();
  if (!combined) {
    return createUnknownCircuitSpec(venueOrKey, course);
  }

  // 5. Length-based disambiguation when track length is known
  if (trackLengthMeters && trackLengthMeters > 0) {
    if (combined.includes('sebring')) {
      return trackLengthMeters < 4500 ? CIRCUIT_SPECIFICATIONS.sebring_school : CIRCUIT_SPECIFICATIONS.sebring_full;
    }
    if (combined.includes('lusail') || combined.includes('qatar') || combined.includes('losail')) {
      return trackLengthMeters < 4500 ? CIRCUIT_SPECIFICATIONS.qatar_short : CIRCUIT_SPECIFICATIONS.qatar_gp;
    }
    if (combined.includes('silverstone')) {
      if (trackLengthMeters < 2800) return CIRCUIT_SPECIFICATIONS.silverstone_national;
      if (trackLengthMeters < 4000) return CIRCUIT_SPECIFICATIONS.silverstone_international;
      return CIRCUIT_SPECIFICATIONS.silverstone_wec;
    }
    if (combined.includes('bahrain') || combined.includes('sakhir')) {
      if (trackLengthMeters > 5900) return CIRCUIT_SPECIFICATIONS.bahrain_endurance;
      if (trackLengthMeters < 3650) return CIRCUIT_SPECIFICATIONS.bahrain_outer;
      if (trackLengthMeters < 4500) return CIRCUIT_SPECIFICATIONS.bahrain_paddock;
      return CIRCUIT_SPECIFICATIONS.bahrain_wec;
    }
    if (combined.includes('cota') || combined.includes('americas') || combined.includes('austin')) {
      return trackLengthMeters < 4500 ? CIRCUIT_SPECIFICATIONS.cota_national : CIRCUIT_SPECIFICATIONS.cota_gp;
    }
    if (combined.includes('fuji')) {
      return trackLengthMeters < 4545 ? CIRCUIT_SPECIFICATIONS.fuji_classic : CIRCUIT_SPECIFICATIONS.fuji_chicane;
    }
  }

  // 6. Explicit layout variant keywords first to prevent false matching to base layout
  // Sebring
  if (combined.includes('sebring')) {
    if (/\b(school|club)\b/.test(combined)) return CIRCUIT_SPECIFICATIONS.sebring_school;
    return CIRCUIT_SPECIFICATIONS.sebring_full;
  }

  // Sarthe / Le Mans
  if (combined.includes('sarthe') || combined.includes('le mans') || combined.includes('lemans') || combined.includes('24 heures')) {
    if (/\b(straight|chicaneless|sans\s*chicanes?|mulsanne)\b/.test(combined)) return CIRCUIT_SPECIFICATIONS.sarthe_mulsanne;
    return CIRCUIT_SPECIFICATIONS.sarthe_full;
  }

  // Monza
  if (combined.includes('monza')) {
    if (/\b(curva\s*grande|curvagrande|junior)\b/.test(combined)) return CIRCUIT_SPECIFICATIONS.monza_curvagrande;
    return CIRCUIT_SPECIFICATIONS.monza_gp;
  }

  // Bahrain
  if (combined.includes('bahrain') || combined.includes('sakhir')) {
    if (combined.includes('endurance')) return CIRCUIT_SPECIFICATIONS.bahrain_endurance;
    if (combined.includes('outer')) return CIRCUIT_SPECIFICATIONS.bahrain_outer;
    if (combined.includes('paddock') || combined.includes('oasis')) return CIRCUIT_SPECIFICATIONS.bahrain_paddock;
    return CIRCUIT_SPECIFICATIONS.bahrain_wec;
  }

  // COTA
  if (combined.includes('cota') || combined.includes('americas') || combined.includes('austin')) {
    if (/\b(national|short)\b/.test(combined)) return CIRCUIT_SPECIFICATIONS.cota_national;
    return CIRCUIT_SPECIFICATIONS.cota_gp;
  }

  // Fuji
  if (combined.includes('fuji')) {
    if (/\b(classic|old)\b/.test(combined)) return CIRCUIT_SPECIFICATIONS.fuji_classic;
    return CIRCUIT_SPECIFICATIONS.fuji_chicane;
  }

  // Lusail / Qatar
  if (combined.includes('lusail') || combined.includes('qatar') || combined.includes('losail')) {
    if (/\b(short|club|national)\b/.test(combined)) return CIRCUIT_SPECIFICATIONS.qatar_short;
    return CIRCUIT_SPECIFICATIONS.qatar_gp;
  }

  // Silverstone
  if (combined.includes('silverstone')) {
    if (/\b(national)\b/.test(combined) && !combined.includes('international')) return CIRCUIT_SPECIFICATIONS.silverstone_national;
    if (combined.includes('international')) return CIRCUIT_SPECIFICATIONS.silverstone_international;
    return CIRCUIT_SPECIFICATIONS.silverstone_wec;
  }

  // Paul Ricard
  if (combined.includes('paul ricard') || combined.includes('ricard')) {
    if (/\b(short|1a-v2-short|1a\s*v2\s*short|v2\s*short)\b/.test(combined)) return CIRCUIT_SPECIFICATIONS.paul_ricard_1a_v2_short;
    if (/\b3a\b/.test(combined)) return CIRCUIT_SPECIFICATIONS.paul_ricard_3a;
    if (/\b1a\b/.test(combined) && !combined.includes('v2')) return CIRCUIT_SPECIFICATIONS.paul_ricard_1a;
    return CIRCUIT_SPECIFICATIONS.paul_ricard_1a_v2;
  }

  // Base Single-Layout Circuits
  if (combined.includes('spa') || combined.includes('francorchamps')) return CIRCUIT_SPECIFICATIONS.spa_gp;
  if (combined.includes('barcelona') || combined.includes('catalunya')) return CIRCUIT_SPECIFICATIONS.barcelona_gp;
  if (combined.includes('interlagos') || combined.includes('pace') || combined.includes('sao paulo')) return CIRCUIT_SPECIFICATIONS.interlagos_gp;
  if (combined.includes('imola') || combined.includes('enzo e dino') || combined.includes('ferrari')) return CIRCUIT_SPECIFICATIONS.imola_gp;
  if (combined.includes('daytona')) return CIRCUIT_SPECIFICATIONS.daytona_road_course;
  if (combined.includes('portimao') || combined.includes('portimão') || combined.includes('algarve')) return CIRCUIT_SPECIFICATIONS.portimao_wec;
  if (combined.includes('laguna') || combined.includes('seca')) return CIRCUIT_SPECIFICATIONS.laguna_seca;
  if (combined.includes('long beach') || combined.includes('longbeach')) return CIRCUIT_SPECIFICATIONS.long_beach;
  if (combined.includes('road atlanta') || combined.includes('roadatlanta') || combined.includes('michelin raceway')) return CIRCUIT_SPECIFICATIONS.road_atlanta;

  return createUnknownCircuitSpec(venueOrKey, course);
}
