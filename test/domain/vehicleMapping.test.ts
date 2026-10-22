import { describe, it, expect } from 'vitest';
import {
  resolveVehicle,
  resolveRosterVehicles,
  resolveDriverCarClass,
  areComparableCarClasses,
  resolveCarManufacturer,
  normalizeCarClass,
  matchesSessionCarClass,
  VEHICLE_CLASS_OPTIONS,
} from '../../shared/domain/vehicleMapping.js';

describe('vehicleMapping utility', () => {
  describe('resolveVehicle', () => {
    it('resolves vehicle files of every season and folder to one public model and class', () => {
      expect(resolveVehicle('21_26_AFCO31910023')).toEqual({ model: 'Ferrari 296 LMGT3', carClass: 'GT3' });
      expect(resolveVehicle(String.raw`C:\LMU\Installed\Vehicles\BMW_M4_LMGT3_2023\1.23\32_26_WRT_65186446.VEH`))
        .toEqual({ model: 'BMW M4 LMGT3', carClass: 'GT3' });
      expect(resolveVehicle('32_26_wrt_83524148.veh')).toEqual({ model: 'BMW M4 LMGT3', carClass: 'GT3' });
      expect(resolveVehicle('397_25_AMG')).toEqual({ model: 'Mercedes-AMG LMGT3', carClass: 'GT3' });
      expect(resolveVehicle('992S_PC')).toEqual({ model: 'Porsche 992S Pace Car', carClass: 'Safety Car' });
    });

    it('resolves entry names, where team tokens name cars of several classes', () => {
      expect(resolveVehicle('Vista AF Corse 2026 #21:LM')).toEqual({ model: 'Ferrari 296 LMGT3', carClass: 'GT3' });
      expect(resolveVehicle('Team WRT 2026 #32:LM')).toEqual({ model: 'BMW M4 LMGT3', carClass: 'GT3' });
      expect(resolveVehicle('BMW M Team WRT 2024 #15:LM')).toEqual({ model: 'BMW M Hybrid V8', carClass: 'Hyper' });
    });

    it('resolves car names and public names, merging the 2026 updates into one car', () => {
      expect(resolveVehicle('Ferrari_296_LMGT3')).toEqual({ model: 'Ferrari 296 LMGT3', carClass: 'GT3' });
      expect(resolveVehicle('Ferrari 296 LMGT3 Evo')).toEqual({ model: 'Ferrari 296 LMGT3', carClass: 'GT3' });
      expect(resolveVehicle('Toyota TR010')).toEqual({ model: 'Toyota GR010', carClass: 'Hyper' });
      expect(resolveVehicle('McLaren 720S LMGT3 Evo')).toEqual({ model: 'McLaren 720S LMGT3 Evo', carClass: 'GT3' });
    });

    it('gives a name two classes share without a class, and nothing for unknown names', () => {
      expect(resolveVehicle('Oreca 07')).toEqual({ model: 'Oreca 07', carClass: null });
      expect(resolveVehicle('CustomMod_Vehicle_X')).toBeNull();
      expect(resolveVehicle('')).toBeNull();
      expect(resolveVehicle(undefined)).toBeNull();
    });
  });

  describe('resolveRosterVehicles', () => {
    it('takes the car from the results log, else from the vehicle file', () => {
      const roster = { drivers: [{ name: 'Logged Driver', vehicleId: 'TEST_UNKNOWN' }, { name: 'Other Driver', vehicleId: '21_26_AFCO31910023' }] };
      resolveRosterVehicles(roster, [{ name: 'Logged Driver', carType: 'Test Model', carClass: 'GTE' }]);
      expect(roster.drivers).toEqual([
        expect.objectContaining({ carType: 'Test Model', carClass: 'GTE' }),
        expect.objectContaining({ carType: 'Ferrari 296 LMGT3', carClass: 'GT3' }),
      ]);
    });
  });

  describe('comparison car class', () => {
    it('resolves a driver class from the entry, else from its vehicle', () => {
      expect(resolveDriverCarClass({ carClass: 'Hyper', vehicleId: '92_25_MANT9651C55B' })).toBe('Hyper');
      expect(resolveDriverCarClass({ vehicleId: '777_DSTATI5BFA7EF3', carType: 'Aston Martin Vantage AMR' })).toBe('GTE');
      expect(resolveDriverCarClass({ vehicleId: 'CUSTOM_LIVERY', carType: 'Lamborghini Huracan LMGT3 Evo2' })).toBe('GT3');
      expect(resolveDriverCarClass(null)).toBe('');
    });

    it('only allows comparing laps within one canonical class', () => {
      expect(areComparableCarClasses('Hyper', 'Hyper')).toBe(true);
      expect(areComparableCarClasses('GT3', 'GT3')).toBe(true);
      expect(areComparableCarClasses('GTE', 'LMGT3')).toBe(false);
      expect(areComparableCarClasses('LMGT3', 'GTE')).toBe(false);
      expect(areComparableCarClasses('LMH', 'LMGT3')).toBe(false);
      expect(areComparableCarClasses('LMP2', 'LMP2elms')).toBe(false);
      expect(areComparableCarClasses('LMP3', 'LMP2')).toBe(false);
      expect(areComparableCarClasses('Hyper', 'LMH')).toBe(false);
      expect(areComparableCarClasses('GT3', 'LMGT3')).toBe(false);
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

  describe('normalizeCarClass and class matching', () => {
    it('normalizes legacy and alias car class strings to canonical enum', () => {
      expect(normalizeCarClass('Hypercar')).toBe('Hyper');
      expect(normalizeCarClass('LMH')).toBe('Hyper');
      expect(normalizeCarClass('LMDh')).toBe('Hyper');
      expect(normalizeCarClass('LMGT3')).toBe('GT3');
      expect(normalizeCarClass('GT3')).toBe('GT3');
      expect(normalizeCarClass('LMGT3')).toBe('GT3');
      expect(normalizeCarClass('GT3_ELMS')).toBe('GT3');
      expect(normalizeCarClass('LMP2wec')).toBe('LMP2');
      expect(normalizeCarClass('LMP2')).toBe('LMP2');
      expect(normalizeCarClass('LMP2elms')).toBe('LMP2_ELMS');
      expect(normalizeCarClass('LMP2_ELMS')).toBe('LMP2_ELMS');
      expect(normalizeCarClass('LMP3')).toBe('LMP3');
      expect(normalizeCarClass('GTE')).toBe('GTE');
      expect(normalizeCarClass('UnknownClass')).toBe('UnknownClass');
      expect(normalizeCarClass('')).toBe('');
      expect(normalizeCarClass(null)).toBe('');
      expect(normalizeCarClass('Ferrari 499P')).toBe('Ferrari 499P');
    });

    it('matches session car classes via matchesSessionCarClass', () => {
      expect(matchesSessionCarClass({}, 'All')).toBe(true);
      expect(matchesSessionCarClass({}, '')).toBe(true);
      expect(matchesSessionCarClass({ playerDriver: { carClass: 'GT3', carType: 'Ferrari 296' } }, 'GT3')).toBe(true);
      expect(matchesSessionCarClass({ playerDriver: { carClass: 'Hyper', carType: 'Ferrari 499P' } }, 'Hyper')).toBe(true);
      expect(matchesSessionCarClass({ playerDriver: { carClass: 'Hyper', carType: 'Ferrari 499P' } }, 'LMGT3')).toBe(false);
      expect(matchesSessionCarClass({ playerDriver: { carClass: 'Hyper', carType: '499P' } }, 'GT3')).toBe(false);
      expect(matchesSessionCarClass({ drivers: [{ carClass: 'Hyper' }] }, 'Hyper')).toBe(true);
      expect(matchesSessionCarClass({
        playerDriver: null,
        drivers: [
          { carClass: 'GT3', carType: 'Aston Martin Vantage' },
          { carClass: 'Hyper', carType: 'Porsche 963' },
        ],
      }, 'GT3')).toBe(true);
      expect(matchesSessionCarClass({
        playerDriver: { carClass: 'LMP2', carType: 'Oreca 07' },
        drivers: [{ carClass: 'LMP2', carType: 'Oreca 07' }],
      }, 'LMGT3')).toBe(false);
    });

    it('exposes canonical VEHICLE_CLASS_OPTIONS with All sentinel', () => {
      expect(VEHICLE_CLASS_OPTIONS.map(o => o.id)).toEqual([
        'All', 'Hyper', 'GT3', 'LMP2', 'LMP2_ELMS', 'LMP3', 'GTE',
      ]);
    });
  });
});
