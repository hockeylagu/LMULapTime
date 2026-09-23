import { describe, it, expect } from 'vitest';
import { CIRCUIT_SPECIFICATIONS, getCircuitSpecification, LMU_SCENE_DESC_MAP } from '../../src/utils/circuitSpecs.js';

const resolveKey = (
  venue?: string | null,
  course?: string | null,
  replayName?: string | null,
  explicitKey?: string | null,
  sceneDesc?: string | null,
  trackLengthMeters?: number | null
): string | null => {
  const spec = getCircuitSpecification(venue, course, sceneDesc, replayName, explicitKey, trackLengthMeters);
  return spec.layoutKey !== 'unknown' ? spec.layoutKey : null;
};

describe('CircuitSpecification resolution & LMU ground truth mapping', () => {
  it('maps all official LMU sceneDesc codes deterministically', () => {
    expect(Object.keys(LMU_SCENE_DESC_MAP).length).toBeGreaterThanOrEqual(30);
    // Verify core circuits
    expect(resolveKey(null, null, null, null, 'MONZAWEC')).toBe('monza_gp');
    expect(resolveKey(null, null, null, null, 'MONZAWEC_GRANDE')).toBe('monza_curvagrande');
    expect(resolveKey(null, null, null, null, 'SPAELMS')).toBe('spa_gp');
    expect(resolveKey(null, null, null, null, 'SPAWEC')).toBe('spa_gp');
    expect(resolveKey(null, null, null, null, 'LEMANSWEC')).toBe('sarthe_full');
    expect(resolveKey(null, null, null, null, 'LEMANSWEC_MULSANNE')).toBe('sarthe_mulsanne');
    expect(resolveKey(null, null, null, null, 'COTAWEC')).toBe('cota_gp');
    expect(resolveKey(null, null, null, null, 'COTAWEC_NATIONAL')).toBe('cota_national');
    expect(resolveKey(null, null, null, null, 'BARCELONAELMS')).toBe('barcelona_gp');
    expect(resolveKey(null, null, null, null, 'INTERLAGOSWEC')).toBe('interlagos_gp');
    expect(resolveKey(null, null, null, null, 'SILVERSTONEWEC')).toBe('silverstone_wec');
    expect(resolveKey(null, null, null, null, 'SILVERSTONE_NATIONAL')).toBe('silverstone_national');
    expect(resolveKey(null, null, null, null, 'SILVERSTONE_INTERNATIONAL')).toBe('silverstone_international');
    expect(resolveKey(null, null, null, null, 'BAHRAINWEC')).toBe('bahrain_wec');
    expect(resolveKey(null, null, null, null, 'BAHRAINWEC_OUTER')).toBe('bahrain_outer');
    expect(resolveKey(null, null, null, null, 'BAHRAINWEC_PADDOCK')).toBe('bahrain_paddock');
    expect(resolveKey(null, null, null, null, 'BAHRAINWEC_ENDCE')).toBe('bahrain_endurance');
    expect(resolveKey(null, null, null, null, 'IMOLAELMS')).toBe('imola_gp');
    expect(resolveKey(null, null, null, null, 'DAYTONARC')).toBe('daytona_road_course');
    expect(resolveKey(null, null, null, null, 'FUJIWEC')).toBe('fuji_chicane');
    expect(resolveKey(null, null, null, null, 'FUJIWEC_CL')).toBe('fuji_classic');
    expect(resolveKey(null, null, null, null, 'PORTIMAOELMS')).toBe('portimao_wec');
    expect(resolveKey(null, null, null, null, 'SEBRINGWEC')).toBe('sebring_full');
    expect(resolveKey(null, null, null, null, 'SEBRINGWEC_SCHOOL')).toBe('sebring_school');
    expect(resolveKey(null, null, null, null, 'LAGUNASECA')).toBe('laguna_seca');
    expect(resolveKey(null, null, null, null, 'QATARWEC')).toBe('qatar_gp');
    expect(resolveKey(null, null, null, null, 'QATARWEC_SHORT')).toBe('qatar_short');
    expect(resolveKey(null, null, null, null, 'PAULRICARD1A-V2-SHORT')).toBe('paul_ricard_1a_v2_short');
    expect(resolveKey(null, null, null, null, 'PAULRICARD1A-V2')).toBe('paul_ricard_1a_v2');
    expect(resolveKey(null, null, null, null, 'PAULRICARD1A')).toBe('paul_ricard_1a');
    expect(resolveKey(null, null, null, null, 'PAULRICARD3A')).toBe('paul_ricard_3a');
    expect(resolveKey(null, null, null, null, 'LONGBEACH')).toBe('long_beach');
    expect(resolveKey(null, null, null, null, 'ROADATLANTA')).toBe('road_atlanta');
  });

  it('handles .SCN extension and case-insensitivity on sceneDesc', () => {
    expect(resolveKey(null, null, null, null, 'BAHRAINWEC.SCN')).toBe('bahrain_wec');
    expect(resolveKey(null, null, null, null, 'sebringwec_school.scn')).toBe('sebring_school');
    expect(resolveKey(null, null, null, null, 'LongBeach.SCN')).toBe('long_beach');
  });

  it('disambiguates layouts by track length in meters when sceneDesc is absent', () => {
    // Sebring: Full (~6019m) vs School (~3219m)
    expect(resolveKey('Sebring International Raceway', '', null, null, null, 6019)).toBe('sebring_full');
    expect(resolveKey('Sebring International Raceway', '', null, null, null, 3219)).toBe('sebring_school');

    // Qatar: GP (~5400m) vs Short (~3701m)
    expect(resolveKey('Lusail International Circuit', '', null, null, null, 5400)).toBe('qatar_gp');
    expect(resolveKey('Lusail International Circuit', '', null, null, null, 3701)).toBe('qatar_short');

    // Silverstone: National (~2639m), International (~2979m), GP (~5890m)
    expect(resolveKey('Silverstone Circuit', '', null, null, null, 2639)).toBe('silverstone_national');
    expect(resolveKey('Silverstone Circuit', '', null, null, null, 2979)).toBe('silverstone_international');
    expect(resolveKey('Silverstone Circuit', '', null, null, null, 5890)).toBe('silverstone_wec');

    // Bahrain: Outer (~3543m), Paddock (~3705m), WEC (~5412m), Endurance (~6299m)
    expect(resolveKey('Bahrain International Circuit', '', null, null, null, 3543)).toBe('bahrain_outer');
    expect(resolveKey('Bahrain International Circuit', '', null, null, null, 3705)).toBe('bahrain_paddock');
    expect(resolveKey('Bahrain International Circuit', '', null, null, null, 5412)).toBe('bahrain_wec');
    expect(resolveKey('Bahrain International Circuit', '', null, null, null, 6299)).toBe('bahrain_endurance');

    // COTA: National (~3702m) vs GP (~5513m)
    expect(resolveKey('Circuit of the Americas', '', null, null, null, 3702)).toBe('cota_national');
    expect(resolveKey('Circuit of the Americas', '', null, null, null, 5513)).toBe('cota_gp');

    // Fuji: Classic (~4526m) vs Chicane (~4563m)
    expect(resolveKey('Fuji Speedway', '', null, null, null, 4526)).toBe('fuji_classic');
    expect(resolveKey('Fuji Speedway', '', null, null, null, 4563)).toBe('fuji_chicane');
  });

  it('correctly matches new circuits by name', () => {
    expect(resolveKey('Grand Prix of Long Beach')).toBe('long_beach');
    expect(resolveKey('Michelin Raceway Road Atlanta')).toBe('road_atlanta');
    expect(resolveKey('Road Atlanta')).toBe('road_atlanta');
  });

  it('preserves existing text-based disambiguation', () => {
    expect(resolveKey('Autodromo Nazionale Monza', 'Monza Curva Grande Circuit')).toBe('monza_curvagrande');
    expect(resolveKey('Bahrain International Circuit', 'Bahrain Outer Circuit')).toBe('bahrain_outer');
    expect(resolveKey('Bahrain International Circuit', 'Bahrain Paddock Circuit')).toBe('bahrain_paddock');
    expect(resolveKey('Fuji Speedway', 'Fuji Speedway Classic')).toBe('fuji_classic');
    expect(resolveKey('Sebring International Raceway', 'Sebring School Circuit')).toBe('sebring_school');
    expect(resolveKey('Circuit Paul Ricard', 'Paul Ricard - 1A-V2-Short')).toBe('paul_ricard_1a_v2_short');
    expect(resolveKey('Circuit de la Sarthe', 'Circuit de la Sarthe Mulsanne')).toBe('sarthe_mulsanne');
  });

  it('respects explicitKey and handles nulls gracefully', () => {
    expect(resolveKey('Monza', 'GP', null, 'explicit_test')).toBe('explicit_test');
    expect(resolveKey(null, null, null)).toBeNull();
    expect(resolveKey('', '', '')).toBeNull();
  });
});

describe('CIRCUIT_SPECIFICATIONS integrity', () => {
  it('contains valid ground truth specs for all defined circuits', () => {
    const keys = Object.keys(CIRCUIT_SPECIFICATIONS);
    expect(keys.length).toBeGreaterThanOrEqual(30);

    for (const key of keys) {
      const spec = CIRCUIT_SPECIFICATIONS[key];
      expect(spec.layoutKey).toBe(key);
      expect(spec.circuitId).toBeTruthy();
      expect(spec.layoutId).toBeTruthy();
      expect(typeof spec.isDefaultLayout).toBe('boolean');
      expect(spec.benchmarkName).toBeTruthy();
      expect(Array.isArray(spec.sceneDescs)).toBe(true);
      expect(spec.officialLengthMeters).toBeGreaterThan(2000);
      expect(spec.officialLengthKm).toBeGreaterThan(2.0);
      expect(spec.turnCount).toBeGreaterThan(5);
      expect(spec.elevationChangeMeters).toBeDefined();
      expect(spec.elevationChangeMeters).toBeGreaterThanOrEqual(1);
      expect(spec.countryCode).toHaveLength(2);
      expect(spec.flagEmoji).toBeTruthy();
    }
  });

  it('getCircuitSpecification returns expected ground truth values', () => {
    const monza = getCircuitSpecification('Autodromo Nazionale Monza');
    expect(monza.layoutKey).toBe('monza_gp');
    expect(monza.benchmarkName).toBe('Monza');
    expect(monza.circuitId).toBe('monza');
    expect(monza.isDefaultLayout).toBe(true);
    expect(monza.officialLengthMeters).toBe(5793);
    expect(monza.turnCount).toBe(11);
    expect(monza.elevationChangeMeters).toBe(13);

    const spa = getCircuitSpecification('Circuit de Spa-Francorchamps');
    expect(spa.layoutKey).toBe('spa_gp');
    expect(spa.benchmarkName).toBe('Spa');
    expect(spa.circuitId).toBe('spa');
    expect(spa.isDefaultLayout).toBe(true);
    expect(spa.officialLengthMeters).toBe(7004);
    expect(spa.turnCount).toBe(20);
    expect(spa.elevationChangeMeters).toBe(102);

    const longBeach = getCircuitSpecification('Grand Prix of Long Beach');
    expect(longBeach.layoutKey).toBe('long_beach');
    expect(longBeach.benchmarkName).toBe('Long Beach');
    expect(longBeach.officialLengthMeters).toBe(3167);
    expect(longBeach.turnCount).toBe(11);

    const roadAtlanta = getCircuitSpecification('Road Atlanta');
    expect(roadAtlanta.layoutKey).toBe('road_atlanta');
    expect(roadAtlanta.benchmarkName).toBe('Road Atlanta');
    expect(roadAtlanta.officialLengthMeters).toBe(4088);
    expect(roadAtlanta.turnCount).toBe(12);
  });

  describe('benchmarkName resolution across all layout variants', () => {
    const getBenchmark = (v: string, c: string = '') => getCircuitSpecification(v, c).benchmarkName;

    it('resolves Silverstone layout variants (GP vs International vs National)', () => {
      expect(getBenchmark('Silverstone', 'GP')).toBe('Silverstone (GP)');
      expect(getBenchmark('Silverstone', 'Grand Prix')).toBe('Silverstone (GP)');
      expect(getBenchmark('Silverstone', 'International')).toBe('Silverstone (International)');
      expect(getBenchmark('Silverstone', 'National')).toBe('Silverstone (National)');
      expect(getBenchmark('Silverstone Circuit', '')).toBe('Silverstone (GP)');
    });

    it('resolves Le Mans / Sarthe layout variants (Full 24h vs Straight / Chicaneless)', () => {
      expect(getBenchmark('Circuit de la Sarthe', '')).toBe('Circuit de la Sarthe');
      expect(getBenchmark('Circuit 24 Heures du Mans', '24 Heures')).toBe('Circuit de la Sarthe');
      expect(getBenchmark('Circuit 24 Heures du Mans', 'Straight')).toBe('Circuit de la Sarthe (straight)');
      expect(getBenchmark('Le Mans', 'Chicaneless')).toBe('Circuit de la Sarthe (straight)');
    });

    it('resolves Bahrain layout variants (WEC vs Outer vs Endurance vs Paddock)', () => {
      expect(getBenchmark('Bahrain International Circuit', 'Grand Prix')).toBe('Bahrain (wec)');
      expect(getBenchmark('Bahrain', 'WEC')).toBe('Bahrain (wec)');
      expect(getBenchmark('Bahrain', 'Outer')).toBe('Bahrain (outer)');
      expect(getBenchmark('Bahrain', 'Endurance')).toBe('Bahrain (endurance)');
      expect(getBenchmark('Bahrain', 'Paddock')).toBe('Bahrain (paddock)');
      expect(getBenchmark('Bahrain', '')).toBe('Bahrain (wec)');
    });

    it('resolves Paul Ricard layout variants (1A v2 vs 1A vs 3A vs Short)', () => {
      expect(getBenchmark('Circuit Paul Ricard', '1A v2 Short')).toBe('Paul Ricard (1A v2 short)');
      expect(getBenchmark('Paul Ricard', '1A v2')).toBe('Paul Ricard (1A v2)');
      expect(getBenchmark('Paul Ricard', '1A')).toBe('Paul Ricard (1A)');
      expect(getBenchmark('Paul Ricard', '3A')).toBe('Paul Ricard (3A)');
      expect(getBenchmark('Paul Ricard', '')).toBe('Paul Ricard (1A v2)');
    });

    it('resolves Monza layout variants (GP vs Curva Grande)', () => {
      expect(getBenchmark('Autodromo Nazionale Monza', '')).toBe('Monza');
      expect(getBenchmark('Monza', 'Grand Prix')).toBe('Monza');
      expect(getBenchmark('Monza', 'Curva Grande')).toBe('Monza (curvagrande)');
    });

    it('resolves COTA, Fuji, Qatar, and Sebring layout variants', () => {
      expect(getBenchmark('Circuit of the Americas', 'GP')).toBe('COTA');
      expect(getBenchmark('Circuit of the Americas', 'National')).toBe('COTA (national)');
      expect(getBenchmark('COTA', '')).toBe('COTA');

      expect(getBenchmark('Fuji Speedway', 'Grand Prix')).toBe('Fuji (chicane)');
      expect(getBenchmark('Fuji Speedway', 'Classic')).toBe('Fuji (classic)');
      expect(getBenchmark('Fuji', '')).toBe('Fuji (chicane)');

      expect(getBenchmark('Losail Qatar', 'Grand Prix')).toBe('Qatar');
      expect(getBenchmark('Lusail', 'Short')).toBe('Qatar (short)');
      expect(getBenchmark('Qatar', '')).toBe('Qatar');

      expect(getBenchmark('Sebring International Raceway', '12h')).toBe('Sebring');
      expect(getBenchmark('Sebring', 'School')).toBe('Sebring (school)');
      expect(getBenchmark('Sebring', '')).toBe('Sebring');
    });

    it('resolves Barcelona, Daytona, Imola, Interlagos, Laguna Seca, Portimao, Long Beach, Road Atlanta', () => {
      expect(getBenchmark('Circuit de Barcelona-Catalunya', 'GP')).toBe('Barcelona');
      expect(getBenchmark('Daytona International Speedway', 'Road Course')).toBe('Daytona');
      expect(getBenchmark('Autodromo Enzo e Dino Ferrari', 'GP')).toBe('Imola');
      expect(getBenchmark('Autodromo Jose Carlos Pace', 'GP')).toBe('Interlagos');
      expect(getBenchmark('WeatherTech Raceway Laguna Seca', '')).toBe('Laguna Seca');
      expect(getBenchmark('Autodromo Internacional do Algarve', 'GP')).toBe('Portimao');
      expect(getBenchmark('Grand Prix of Long Beach')).toBe('Long Beach');
      expect(getBenchmark('Michelin Raceway Road Atlanta')).toBe('Road Atlanta');
    });

    it('falls back gracefully if no specific mapping matches', () => {
      expect(getBenchmark('Custom Track', 'Layout A')).toBe('Custom Track');
      expect(getBenchmark('Unknown Venue', '')).toBe('Unknown Venue');
    });
  });
});
