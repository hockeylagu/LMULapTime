import { describe, it, expect } from 'vitest';
import { VEHICLE_FILE_GROUPS } from '../../shared/domain/vehicleCatalog.js';
import {
  mapVehicleIdToClass,
  mapVehicleIdToModel,
  normalizeLmuCarClass,
  normalizeLmuCarType,
  resolveRosterVehicles,
} from '../../shared/domain/vehicleMapping.js';

describe('vehicle catalog', () => {
  it('lists each vehicle file once, upper-case and without its .VEH extension', () => {
    const ids = VEHICLE_FILE_GROUPS.flatMap(group => group.vehicleIds);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toBe(id.toUpperCase().replace(/\.VEH$/, ''));
  });

  it('resolves the LMP3 entries of the 2025 ELMS season (Monza, 2026-09-18 race)', () => {
    // DKR Engineering #4 is a Ginetta; the team's #3 is an ELMS Oreca.
    expect(mapVehicleIdToModel('4_25_DKR_E8E7FBE8C')).toBe('Ginetta G61-LT-P325 Evo');
    expect(mapVehicleIdToClass('4_25_DKR_E8E7FBE8C')).toBe('LMP3');
    expect(mapVehicleIdToModel('12_25_WTM_7FC250D8')).toBe('Duqueine D09 P3');
    expect(mapVehicleIdToModel('46_25_ADES51981969')).toBe('ADESS AD25 LMP3');
    expect(mapVehicleIdToModel('11_25_EURO50DECB8E')).toBe('Ligier JS P325');
    for (const id of ['12_25_WTM_7FC250D8', '46_25_ADES51981969', '11_25_EURO50DECB8E', '397_25_G61LTP3EVO']) {
      expect(mapVehicleIdToClass(id)).toBe('LMP3');
    }
  });

  it('keeps the ELMS and WEC Orecas apart, whatever the team token suggests', () => {
    expect(mapVehicleIdToModel('3_25_DKR_EA051AD3A')).toBe('Oreca 07 LMP2');
    expect(mapVehicleIdToClass('3_25_DKR_EA051AD3A')).toBe('LMP2elms');
    expect(mapVehicleIdToClass('33_24_DKR_87D62685')).toBe('LMP2');
    expect(mapVehicleIdToClass('9_25_IRONL51471837')).toBe('LMP2');
    expect(mapVehicleIdToClass('9_25_IRONL246BF580')).toBe('LMP2elms');
    expect(mapVehicleIdToModel('77_25_PROTA67EED77')).toBe('Oreca 07 LMP2');
    expect(mapVehicleIdToModel('83_25_AFCODD58D0A5')).toBe('Oreca 07 LMP2');
  });

  it('resolves team tokens shared across classes to the right car', () => {
    expect(mapVehicleIdToModel('15_26_WRT_34121376')).toBe('BMW M Hybrid V8');
    expect(mapVehicleIdToClass('15_26_WRT_34121376')).toBe('LMH');
    expect(mapVehicleIdToModel('83_26_AFCO76679772')).toBe('Ferrari 499P');
    expect(mapVehicleIdToModel('57_25_KESS76A94C8D')).toBe('Ferrari 296 GT3');
    expect(mapVehicleIdToModel('85_25_IRON71169233')).toBe('Porsche 911 GT3 R');
  });

  it('matches vehicle files regardless of case or a .VEH extension', () => {
    expect(mapVehicleIdToClass('4_25_dkr_e8e7fbe8c.VEH')).toBe('LMP3');
  });

  it('falls back to token rules for vehicle files not in the catalog', () => {
    expect(mapVehicleIdToModel('46_27_ADES00000000')).toBe('ADESS AD25 LMP3');
    expect(mapVehicleIdToClass('46_27_ADES00000000')).toBe('LMP3');
    expect(mapVehicleIdToModel('4_27_DKR_00000000')).toBe('4_27_DKR_00000000');
    expect(mapVehicleIdToClass('4_27_DKR_00000000')).toBe('');
  });

  it('normalizes results-log car types and classes to the app names', () => {
    expect(normalizeLmuCarType('Oreca 07')).toBe('Oreca 07 LMP2');
    expect(normalizeLmuCarType('Ginetta G61-LT-P325 Evo')).toBe('Ginetta G61-LT-P325 Evo');
    expect(normalizeLmuCarClass('LMP2_ELMS')).toBe('LMP2elms');
    expect(normalizeLmuCarClass('Hyper')).toBe('LMH');
    expect(normalizeLmuCarClass('LMP3')).toBe('LMP3');
  });
});

describe('resolveRosterVehicles', () => {
  it('corrects a roster stored with the old mapping and follows the player', () => {
    const metadata = {
      carModel: 'Oreca 07 LMP2',
      carClass: 'LMP2',
      drivers: [
        { name: 'Gerard versetapeine', vehicleId: '4_25_DKR_E8E7FBE8C', carModel: 'Oreca 07 LMP2', carClass: 'LMP2', isPlayer: true },
        { name: 'Jules Wadoux', vehicleId: '12_25_WTM_7FC250D8', carModel: '12_25_WTM_7FC250D8' },
        { name: 'No Vehicle', carModel: 'Kept', carClass: 'Kept' },
      ],
    };
    resolveRosterVehicles(metadata);
    expect(metadata.drivers.map(driver => [driver.carModel, driver.carClass])).toEqual([
      ['Ginetta G61-LT-P325 Evo', 'LMP3'],
      ['Duqueine D09 P3', 'LMP3'],
      ['Kept', 'Kept'],
    ]);
    expect(metadata.carModel).toBe('Ginetta G61-LT-P325 Evo');
    expect(metadata.carClass).toBe('LMP3');
  });

  it('prefers the linked results log over the vehicle id, matching drivers by name', () => {
    const metadata = {
      drivers: [
        { name: 'Antonio Landolfi#1996', vehicleId: 'UNKNOWN_MOD_1', isPlayer: true },
        { name: 'Someone Else', vehicleId: '4_25_DKR_E8E7FBE8C' },
      ],
    };
    resolveRosterVehicles(metadata, [
      { name: 'antonio landolfi#1996', carType: 'Oreca 07', carClass: 'LMP2_ELMS' },
      { name: 'Someone Else', carType: 'Unknown Car', carClass: 'General' },
    ]);
    expect(metadata.drivers[0]).toMatchObject({ carModel: 'Oreca 07 LMP2', carClass: 'LMP2elms' });
    expect(metadata.drivers[1]).toMatchObject({ carModel: 'Ginetta G61-LT-P325 Evo', carClass: 'LMP3' });
  });
});
