import { describe, it, expect } from 'vitest';
import {
  mapVehicleIdToModel,
  mapVehicleIdToClass,
  resolveDriverCarClass,
  areComparableCarClasses,
  resolveCarManufacturer,
} from '../../shared/domain/vehicleMapping.js';

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
      expect(mapVehicleIdToModel('TEST_AMG_GT3')).toBe('Mercedes-AMG GT3');
      expect(mapVehicleIdToModel('60_24_IRONDCDFC07B')).toBe('Lamborghini Huracan GT3 Evo2');
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
      expect(mapVehicleIdToModel('TEST_ORECA_LMP2')).toBe('Oreca 07 LMP2');

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
      expect(mapVehicleIdToClass('TEST_AMG_GT3', 'Mercedes-AMG GT3')).toBe('LMGT3');
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
      expect(mapVehicleIdToClass('TEST_ORECA_LMP2', 'Oreca 07 LMP2')).toBe('LMP2');
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

  describe('comparison car class', () => {
    it('resolves a driver class from the entry, else from its vehicle', () => {
      expect(resolveDriverCarClass({ carClass: 'Hyper', vehicleId: '92_25_MANT9651C55B' })).toBe('Hyper');
      expect(resolveDriverCarClass({ vehicleId: '777_DSTATI5BFA7EF3', carModel: 'Aston Martin Vantage AMR' })).toBe('GTE');
      expect(resolveDriverCarClass({ vehicleId: 'CUSTOM_LIVERY', carModel: 'Lamborghini Huracan GT3 Evo2' })).toBe('LMGT3');
      expect(resolveDriverCarClass(null)).toBe('');
    });

    it('only allows comparing laps within one class, matching class aliases', () => {
      expect(areComparableCarClasses('Hyper', 'LMH')).toBe(true);
      expect(areComparableCarClasses('GT3', 'LMGT3')).toBe(true);
      expect(areComparableCarClasses('GTE', 'LMGT3')).toBe(false);
      expect(areComparableCarClasses('LMGT3', 'GTE')).toBe(false);
      expect(areComparableCarClasses('LMH', 'LMGT3')).toBe(false);
      expect(areComparableCarClasses('LMP2', 'LMP2elms')).toBe(false);
      expect(areComparableCarClasses('LMP3', 'LMP2')).toBe(false);
    });

    it('does not block a comparison when a class is unknown', () => {
      expect(areComparableCarClasses('', 'LMGT3')).toBe(true);
      expect(areComparableCarClasses('LMGT3', undefined)).toBe(true);
    });
  });

  describe('resolveCarManufacturer', () => {
    it('resolves manufacturer from model names', () => {
      expect(resolveCarManufacturer('Ferrari 296 GT3')).toBe('Ferrari');
      expect(resolveCarManufacturer('Ferrari 499P')).toBe('Ferrari');
      expect(resolveCarManufacturer('Porsche 911 GT3 R')).toBe('Porsche');
      expect(resolveCarManufacturer('Porsche 963')).toBe('Porsche');
      expect(resolveCarManufacturer('BMW M4 GT3')).toBe('BMW');
      expect(resolveCarManufacturer('BMW M Hybrid V8')).toBe('BMW');
      expect(resolveCarManufacturer('Cadillac V-Series.R')).toBe('Cadillac');
      expect(resolveCarManufacturer('Aston Martin Vantage GT3')).toBe('Aston Martin');
      expect(resolveCarManufacturer('Aston Martin Valkyrie LMH')).toBe('Aston Martin');
      expect(resolveCarManufacturer('Corvette Z06 GT3.R')).toBe('Corvette');
      expect(resolveCarManufacturer('Ford Mustang GT3')).toBe('Ford');
      expect(resolveCarManufacturer('Lamborghini Huracan GT3 Evo2')).toBe('Lamborghini');
      expect(resolveCarManufacturer('Lamborghini SC63')).toBe('Lamborghini');
      expect(resolveCarManufacturer('Lexus RC F GT3')).toBe('Lexus');
      expect(resolveCarManufacturer('McLaren 720S GT3 Evo')).toBe('McLaren');
      expect(resolveCarManufacturer('Mercedes-AMG GT3')).toBe('Mercedes-AMG');
      expect(resolveCarManufacturer('Peugeot 9X8')).toBe('Peugeot');
      expect(resolveCarManufacturer('Toyota GR010 Hybrid')).toBe('Toyota');
      expect(resolveCarManufacturer('Alpine A424')).toBe('Alpine');
      expect(resolveCarManufacturer('Isotta Fraschini Tipo 6')).toBe('Isotta Fraschini');
      expect(resolveCarManufacturer('Genesis GMR001 Hypercar')).toBe('Genesis');
      expect(resolveCarManufacturer('Oreca 07 LMP2')).toBe('Oreca');
      expect(resolveCarManufacturer('Ligier JS P325')).toBe('Ligier');
      expect(resolveCarManufacturer('Duqueine D09 P3')).toBe('Duqueine');
      expect(resolveCarManufacturer('Ginetta G61-LT-P325 Evo')).toBe('Ginetta');
      expect(resolveCarManufacturer('ADESS AD25 LMP3')).toBe('ADESS');
    });

    it('resolves manufacturer from shorthand or game raw carType strings', () => {
      expect(resolveCarManufacturer('296')).toBe('Ferrari');
      expect(resolveCarManufacturer('Mustang')).toBe('Ford');
      expect(resolveCarManufacturer('Valkyrie')).toBe('Aston Martin');
      expect(resolveCarManufacturer('9X8')).toBe('Peugeot');
      expect(resolveCarManufacturer('TR010')).toBe('Toyota');
      expect(resolveCarManufacturer('Vanwall Vandervell')).toBe('Vanwall');
      expect(resolveCarManufacturer('Glickenhaus 007')).toBe('Glickenhaus');
    });

    it.each([
      // results-log <CarType> names
      ['Aston Martin Vantage AMR LMGT3', 'Aston Martin'], ['BMW M4 LMGT3', 'BMW'],
      ['Chevrolet Corvette Z06 LMGT3.R', 'Corvette'], ['Ferrari 296 LMGT3', 'Ferrari'],
      ['Ferrari 296 LMGT3 Evo', 'Ferrari'], ['Ford Mustang LMGT3', 'Ford'], ['Genesis GMR001', 'Genesis'],
      ['Genesis GMR-001', 'Genesis'], ['Lamborghini Huracan LMGT3 Evo2', 'Lamborghini'], ['Lexus RCF LMGT3', 'Lexus'],
      ['McLaren 720S LMGT3 Evo', 'McLaren'], ['Mercedes-AMG LMGT3', 'Mercedes-AMG'], ['Oreca 07', 'Oreca'],
      ['Peugeot 9x8', 'Peugeot'], ['Porsche 911 GT3 R LMGT3', 'Porsche'], ['Toyota TR010', 'Toyota'],
      // app model names
      ['Aston Martin Vantage AMR', 'Aston Martin'], ['Porsche 911 RSR-19', 'Porsche'], ['Ferrari 488 GTE EVO', 'Ferrari'],
      ['Cadillac V-Series.R', 'Cadillac'], ['Porsche 992 (Safety Car)', 'Porsche'], ['Ginetta G61-LT-P325 Evo', 'Ginetta'],
      ['Isotta Fraschini Tipo 6', 'Isotta Fraschini'], ['Alpine A424', 'Alpine'],
      // vehicle-id style tokens
      ['WRT_M4', 'BMW'], ['911_RSR', 'Porsche'], ['Duqueine_D08', 'Duqueine'], ['Ligier_JSP325', 'Ligier'],
      ['ligier js p325', 'Ligier'], ['Lamborghini Huracán', 'Lamborghini'], ['rc-f gt3', 'Lexus'], ['SCG 007', 'Glickenhaus'],
    ])('resolves %s to %s', (name, brand) => {
      expect(resolveCarManufacturer(name)).toBe(brand);
    });

    it.each([
      'Team 1963 Racing', 'Car 9630', 'Gamma Racing', 'Cm4x', 'M44 Motorsport', 'Pc8 Team', 'Racing JSPlus',
      'Tr0100', 'D080', 'Team a4245', 'Z061', 'Numbers 2960',
    ])('does not match a brand inside %s', (name) => {
      expect(resolveCarManufacturer(name)).toBe('');
    });

    it('prefers a brand name over a model token of another brand', () => {
      expect(resolveCarManufacturer('Ferrari 911 tribute')).toBe('Ferrari');
      expect(resolveCarManufacturer('Porsche 296')).toBe('Porsche');
    });

    it('returns empty string for null, undefined, or unknown names', () => {
      expect(resolveCarManufacturer(null)).toBe('');
      expect(resolveCarManufacturer(undefined)).toBe('');
      expect(resolveCarManufacturer('')).toBe('');
      expect(resolveCarManufacturer('Unknown_Fictional_Car')).toBe('');
    });
  });
});
