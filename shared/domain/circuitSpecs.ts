export {
  type CircuitSpecification,
  CIRCUIT_SPECIFICATIONS,
  LMU_SCENE_DESC_MAP,
} from './circuitDefinitions.js';
import {
  CircuitSpecification,
  CIRCUIT_SPECIFICATIONS,
  LMU_SCENE_DESC_MAP,
} from './circuitDefinitions.js';


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
  const hasDaytonaVenueOrCourse = `${venueOrKey || ''} ${course || ''}`.toLowerCase().includes('daytona');
  if (!hasDaytonaVenueOrCourse && (combined.includes('sarthe') || combined.includes('le mans') || combined.includes('lemans') || combined.includes('24 heures'))) {
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
