import { describe, expect, it } from 'vitest';
import { captureRestEvidence } from '../../../../server/live/capture/evidence.js';

describe('captureRestEvidence', () => {
  it('keeps all nine finite service estimate values without filling or clamping', () => {
    const estimates = { fuel: 2, ve: 1, tires: 3, damage: 4, brakes: 5, brakeDucts: 6, driverSwap: 7, penalties: 8, total: 36 };
    expect(captureRestEvidence('/rest/strategy/pitstop-estimate', { ...estimates, unrelated: 99 }))
      .toEqual({ kind: 'pit-estimate', data: estimates });
    expect(captureRestEvidence('/rest/strategy/pitstop-estimate', { fuel: Number.NaN })).toBeNull();
  });

  it('preserves body damage above one and only the requested suspension fields', () => {
    expect(captureRestEvidence('/rest/garage/getVehicleCondition', {
      vehicleDamage: 1.378, suspensionDamage: [0, 0.72, 0, 0], tireCondition: [0.9, 0.8, 0.7, 0.6],
      brakeCondition: [1, 1, 1, 1], fuel: 32,
    })).toEqual({ kind: 'condition', data: { vehicleDamage: 1.378, suspensionDamage: [0, 0.72, 0, 0] } });
    expect(captureRestEvidence('/rest/garage/getVehicleCondition', { suspensionDamage: [0, 1] })).toBeNull();
  });

  it('keeps selected pit menu text and only the fuel-ratio option labels', () => {
    expect(captureRestEvidence('/rest/garage/PitMenu/receivePitMenu', [
      { name: 'DAMAGE:', currentSetting: 2, default: 0, 'PMC Value': 2, settings: [{ text: 'Do Not Repair' }, { text: 'Repair Body' }, { text: 'Repair All' }] },
      { name: 'FUEL RATIO:', currentSetting: 1, settings: [{ text: '0.85' }, { text: '0.86' }], default: 0 },
      { name: 'FUEL:', currentSetting: 0, settings: [{ text: '50L' }, { text: '60L' }] },
    ])).toEqual({
      kind: 'pit-menu', data: [
        { name: 'DAMAGE:', currentSetting: 2, selectedText: 'Repair All' },
        { name: 'FUEL RATIO:', currentSetting: 1, selectedText: '0.86', options: ['0.85', '0.86'] },
        { name: 'FUEL:', currentSetting: 0, selectedText: '50L' },
      ],
    });
    expect(captureRestEvidence('/rest/garage/PitMenu/receivePitMenu', [{ name: 'DAMAGE:', currentSetting: 0, settings: [] }]))
      .toEqual({ kind: 'pit-menu', data: [{ name: 'DAMAGE:', currentSetting: 0 }] });
  });

  it('keeps only the two garage resource selections', () => {
    expect(captureRestEvidence('/rest/garage/getPlayerGarageData', {
      VM_VIRTUAL_ENERGY: { available: true, stringValue: '50% (20 laps)', value: 50, minValue: 0, maxValue: 100 },
      VM_FUEL_LEVEL: { available: true, stringValue: '0.86', value: 85, lastSavedStringValue: '0.85' },
      VM_BRAKE_BALANCE: { available: true, stringValue: '52:48', value: 10 },
    })).toEqual({ kind: 'garage', data: {
      VM_VIRTUAL_ENERGY: { available: true, stringValue: '50% (20 laps)', value: 50 },
      VM_FUEL_LEVEL: { available: true, stringValue: '0.86', value: 85 },
    } });
  });

  it('keeps selected tyre-management estimates, inventory and per-wheel selection fields', () => {
    expect(captureRestEvidence('/rest/garage/UIScreen/TireManagement', {
      expectedUsage: {
        fuelConsumption: 2.12, fuelFractionPerLap: 0.018, virtualEnergyConsumption: 17_000_000,
        virtualEnergyFractionPerLap: 0.025, compoundsWearPerLap: [{ type: 'Medium', wearPerLap: 0.1, extra: true }], other: 50,
      },
      optimalCompoundConditions: { compounds: [{ type: 'Medium', optimalTemperature: 92, extra: 1 }] },
      tireInventory: { maxAvailableTires: 56, newTires: 52, bestConditionsUsed: [[100, 99, 98, 97]], extra: true },
      tireInvGarageOptions: { selectedTires: [{ compoundIndex: 0, index: 1, type: 2, isUsed: false, wearValue: 100, extra: 1 }] },
      currentWeather: { raining: 1 }, pitMenu: [{ verbose: true }],
    })).toEqual({ kind: 'tyre-management', data: {
      expectedUsage: {
        fuelConsumption: 2.12, fuelFractionPerLap: 0.018, virtualEnergyConsumption: 17_000_000,
        virtualEnergyFractionPerLap: 0.025, compoundsWearPerLap: [{ type: 'Medium', wearPerLap: 0.1 }],
      },
      optimalCompoundConditions: { compounds: [{ type: 'Medium', optimalTemperature: 92 }] },
      tireInventory: { maxAvailableTires: 56, newTires: 52, bestConditionsUsed: [[100, 99, 98, 97]] },
      tireInvGarageOptions: { selectedTires: [{ compoundIndex: 0, index: 1, type: 2, wearValue: 100, isUsed: false }] },
    } });
  });

  it('keeps service rule values and capacity fields from RepairAndRefuel', () => {
    expect(captureRestEvidence('/rest/garage/UIScreen/RepairAndRefuel', {
      pitStopTimes: { times: { FuelFillRate: 3.4, FuelTimeConcurrent: 1, SimultaneousStopGo: false, invalid: 'unknown' }, other: true },
      fuelInfo: { maxFuel: 117, maxVirtualEnergy: 675_000_000, maxBattery: 0, currentFuel: 32, currentVirtualEnergy: 1 },
      pitMenu: [{ verbose: true }],
    })).toEqual({ kind: 'service-rules', data: {
      pitStopTimes: { times: { FuelFillRate: 3.4, FuelTimeConcurrent: 1, SimultaneousStopGo: false } },
      fuelInfo: { maxFuel: 117, maxVirtualEnergy: 675_000_000, maxBattery: 0 },
    } });
  });

  it('selects only known weather nodes and fields while preserving values and display strings', () => {
    const node = { WNV_RAIN_CHANCE: { currentValue: 20, stringValue: '20%' }, WNV_SKY: { currentValue: 1, stringValue: 'Light Clouds' },
      WNV_WINDDIRECTION: { currentValue: 7, stringValue: 'North West' }, WNV_OTHER: { currentValue: 123 } };
    expect(captureRestEvidence('/rest/sessions/weather', {
      RACE: { START: node, NODE_50: { WNV_TEMPERATURE: { currentValue: 22, stringValue: '22 °' } }, MID: node },
      unrelated: 'large payload',
    })).toEqual({ kind: 'forecast', data: {
      RACE: {
        START: {
          WNV_RAIN_CHANCE: { currentValue: 20, stringValue: '20%' },
          WNV_SKY: { currentValue: 1, stringValue: 'Light Clouds' },
          WNV_WINDDIRECTION: { currentValue: 7, stringValue: 'North West' },
        },
        NODE_50: { WNV_TEMPERATURE: { currentValue: 22, stringValue: '22 °' } },
      },
    } });
  });

  it('keeps only scheduled session name and length configuration', () => {
    expect(captureRestEvidence('/rest/sessions/GetSessionsInfoForEvent', {
      eventName: 'Weekend', scheduledSessions: [
        { name: 'PRACTICE', lengthTime: 120, rainChance: 0.4 }, { name: 'RACE', lengthTime: 30, airTemp: 28 },
      ],
    })).toEqual({ kind: 'schedule', data: { scheduledSessions: [
      { name: 'PRACTICE', lengthTime: 120 }, { name: 'RACE', lengthTime: 30 },
    ] } });
  });

  it('returns null for unknown paths, unsupported responses and empty known shapes', () => {
    expect(captureRestEvidence('/rest/unknown', {})).toBeNull();
    expect(captureRestEvidence('/rest/sessions/weather', { PRACTICE: { NOW: { WNV_RAIN_CHANCE: { currentValue: 0 } } } })).toBeNull();
    expect(captureRestEvidence('/rest/garage/UIScreen/RepairAndRefuel', { pitStopTimes: { times: {} } })).toBeNull();
  });
});
