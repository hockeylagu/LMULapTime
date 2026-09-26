import { describe, it, expect } from 'vitest';
import {
  mapVehicleIdToModel,
  mapVehicleIdToClass,
} from '../../src/utils/vehicleMapping.js';

describe('vehicleMapping utility', () => {
  describe('mapVehicleIdToModel', () => {
    it('correctly maps known vehicle skin tokens to friendly model names', () => {
      // LMGT3
      expect(mapVehicleIdToModel('21_26_AFCO95641716')).toBe('Ferrari 296 GT3');
      expect(mapVehicleIdToModel('32_26_WRT_83524148')).toBe('BMW M4 GT3');
      expect(mapVehicleIdToModel('397_25_MUSTANG')).toBe('Ford Mustang GT3');
      expect(mapVehicleIdToModel('23_26_THOR59931582')).toBe('Aston Martin Vantage GT3');
      expect(mapVehicleIdToModel('91_26_MANT18218509')).toBe('Porsche 911 GT3 R');
      expect(mapVehicleIdToModel('58_26_GARA17941687')).toBe('McLaren 720S GT3 Evo');
      expect(mapVehicleIdToModel('8_26_GCHAL79481284')).toBe('McLaren 720S GT3 Evo');
      expect(mapVehicleIdToModel('61_26_IRON57024276')).toBe('Lamborghini Huracan GT3 Evo2');
      expect(mapVehicleIdToModel('78_25_AKKOF71490E4')).toBe('Lexus RC F GT3');
      expect(mapVehicleIdToModel('CORVETTE_Z06')).toBe('Corvette Z06 GT3.R');
      expect(mapVehicleIdToModel('AMG_GT3')).toBe('Mercedes-AMG GT3');

      // LMH / Hypercar
      expect(mapVehicleIdToModel('50_26_499P_123456')).toBe('Ferrari 499P');
      expect(mapVehicleIdToModel('963')).toBe('Porsche 963');
      expect(mapVehicleIdToModel('101_26_WTR51729170')).toBe('Cadillac V-Series.R');
      expect(mapVehicleIdToModel('93_26_PEUG27100541')).toBe('Peugeot 9X8');
      expect(mapVehicleIdToModel('GR010')).toBe('Toyota GR010 Hybrid');
      expect(mapVehicleIdToModel('007_26_THO73564855')).toBe('Aston Martin Valkyrie LMH');
      expect(mapVehicleIdToModel('BMW_HY')).toBe('BMW M Hybrid V8');
      expect(mapVehicleIdToModel('A424')).toBe('Alpine A424');
      expect(mapVehicleIdToModel('SC63')).toBe('Lamborghini SC63');
      expect(mapVehicleIdToModel('ISOTTA')).toBe('Isotta Fraschini Tipo 6');
      expect(mapVehicleIdToModel('GENESIS')).toBe('Genesis GMR001 Hypercar');

      // LMP2
      expect(mapVehicleIdToModel('10_VECTOR_C18BEE4')).toBe('Oreca 07 LMP2');
      expect(mapVehicleIdToModel('4_25_DKR_E8E7FBE8C')).toBe('Oreca 07 LMP2');

      // GTE
      expect(mapVehicleIdToModel('777_DSTATI5BFA7EF3')).toBe('Aston Martin Vantage AMR');
      expect(mapVehicleIdToModel('RSR_2019')).toBe('Porsche 911 RSR-19');
      expect(mapVehicleIdToModel('KESSEL_488')).toBe('Ferrari 488 GTE EVO');

      // LMP3
      expect(mapVehicleIdToModel('G61')).toBe('Ginetta G61-LT-P325 Evo');
      expect(mapVehicleIdToModel('D09')).toBe('Duqueine D09 P3');
      expect(mapVehicleIdToModel('LIGIER_JSP')).toBe('Ligier JS P325');
      expect(mapVehicleIdToModel('ADESS_AD25')).toBe('ADESS AD25 LMP3');

      // Safety Car
      expect(mapVehicleIdToModel('992S_PC')).toBe('Porsche 992 (Safety Car)');
    });

    it('falls back gracefully on unknown vehicle strings', () => {
      expect(mapVehicleIdToModel('')).toBe('Unknown Vehicle');
      expect(mapVehicleIdToModel(undefined)).toBe('Unknown Vehicle');
      expect(mapVehicleIdToModel('CustomMod_Vehicle_X')).toBe('CustomMod_Vehicle_X');
    });
  });

  describe('mapVehicleIdToClass', () => {
    it('correctly classifies LMGT3 vehicles', () => {
      expect(mapVehicleIdToClass('21_26_AFCO95641716', 'Ferrari 296 GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('32_26_WRT_83524148', 'BMW M4 GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('397_25_MUSTANG', 'Ford Mustang GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('8_26_GCHAL79481284', 'McLaren 720S GT3 Evo')).toBe('LMGT3');
      expect(mapVehicleIdToClass('91_26_MANT18218509', 'Porsche 911 GT3 R')).toBe('LMGT3');
      expect(mapVehicleIdToClass('78_25_AKKOF71490E4', 'Lexus RC F GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('61_26_IRON57024276', 'Lamborghini Huracan GT3 Evo2')).toBe('LMGT3');
    });

    it('correctly classifies Hypercar / LMH vehicles', () => {
      expect(mapVehicleIdToClass('50_26_499P_123456', 'Ferrari 499P')).toBe('LMH');
      expect(mapVehicleIdToClass('963', 'Porsche 963')).toBe('LMH');
      expect(mapVehicleIdToClass('101_26_WTR51729170', 'Cadillac V-Series.R')).toBe('LMH');
      expect(mapVehicleIdToClass('93_26_PEUG27100541', 'Peugeot 9X8')).toBe('LMH');
      expect(mapVehicleIdToClass('GR010', 'Toyota GR010 Hybrid')).toBe('LMH');
      expect(mapVehicleIdToClass('007_26_THO73564855', 'Aston Martin Valkyrie LMH')).toBe('LMH');
      expect(mapVehicleIdToClass('BMW_HY', 'BMW M Hybrid V8')).toBe('LMH');
      expect(mapVehicleIdToClass('A424', 'Alpine A424')).toBe('LMH');
      expect(mapVehicleIdToClass('GENESIS', 'Genesis GMR001 Hypercar')).toBe('LMH');
    });

    it('correctly classifies LMP2, GTE, and LMP3 vehicles', () => {
      expect(mapVehicleIdToClass('10_VECTOR_C18BEE4', 'Oreca 07 LMP2')).toBe('LMP2');
      expect(mapVehicleIdToClass('4_25_DKR_E8E7FBE8C', 'Oreca 07 LMP2')).toBe('LMP2');
      expect(mapVehicleIdToClass('LMP2_ELMS', 'Oreca 07 LMP2 ELMS')).toBe('LMP2elms');
      expect(mapVehicleIdToClass('777_DSTATI5BFA7EF3', 'Aston Martin Vantage AMR')).toBe('GTE');
      expect(mapVehicleIdToClass('488', 'Ferrari 488 GTE EVO')).toBe('GTE');
      expect(mapVehicleIdToClass('G61', 'Ginetta G61-LT-P325 Evo')).toBe('LMP3');
      expect(mapVehicleIdToClass('D09', 'Duqueine D09 P3')).toBe('LMP3');
    });

    it('correctly classifies vehicles using vehicleId alone when carModel is missing', () => {
      expect(mapVehicleIdToClass('23_26_THOR59931582')).toBe('LMGT3');
      expect(mapVehicleIdToClass('50_26_499P_123456')).toBe('LMH');
      expect(mapVehicleIdToClass('10_VECTOR_C18BEE4')).toBe('LMP2');
      expect(mapVehicleIdToClass('777_DSTATI5BFA7EF3')).toBe('GTE');
      expect(mapVehicleIdToClass('G61')).toBe('LMP3');
    });

    it('correctly classifies safety cars and returns empty string for unknown classes', () => {
      expect(mapVehicleIdToClass('992S_PC', 'Porsche 992 (Safety Car)')).toBe('Safety Car');
      expect(mapVehicleIdToClass('Custom_Kart_99', 'Kart')).toBe('');
    });
  });
});
