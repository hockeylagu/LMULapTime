import { describe, expect, it } from 'vitest';
import {
  parseEstimate, parseForecast, parseGarageData, parsePitMenu, parsePitStopTimes, parseStandings,
  parseSchedule, parseTireManagement, parseVehicleCondition,
} from '../../../server/live/lmuPitRest.js';

/** Shapes as LMU build 14200 answered them (2026-10-16), trimmed to the fields read. */
const menuLine = (name: string, currentSetting: number, texts: string[]) => ({ name, currentSetting, default: 0, settings: texts.map(text => ({ text })) });

describe('LMU pit REST parsers', () => {
  it("reads the player's standings row: VE, fuel, pit state and pending penalties", () => {
    expect(parseStandings([
      { player: false, veFraction: 0.9, pitState: 'NONE', penalties: 0 },
      { player: true, veFraction: 0.3759, fuelFraction: 0.2784, pitState: 'REQUEST', penalties: 2 },
    ])).toEqual({ type: 'standings', veFraction: 0.3759, fuelFraction: 0.2784, pitState: 'request', penalties: 2 });
    expect(parseStandings([{ player: false }])).toBeNull();
    expect(parseStandings({})).toBeNull();
  });

  it('reads the stop estimate and the random delays of the pit rules', () => {
    expect(parseEstimate({ brakeDucts: 0, brakes: 0, damage: 129.9, driverSwap: 0, fuel: 5.17, penalties: 0, tires: 4.5, total: 139.6, ve: 5.04 }))
      .toEqual({ type: 'estimate', total: 139.6, damage: 129.9, penalties: 0, fuel: 5.17, ve: 5.04, tires: 4.5 });
    expect(parseEstimate({ damage: 1 })).toBeNull();
    expect(parsePitStopTimes({ pitStopTimes: { times: { FixRandomDelay: 5, FuelRandomDelay: 2, RandomTireDelay: 1, virtualEnergyRandomDelay: 0 } } }))
      .toEqual({ type: 'pitStopTimes', fixRandom: 5, fuelRandom: 2, tireRandom: 1, veRandom: 0 });
  });

  it('reads the MFD: the VE line (target after the stop), tyres and repair, each at its current setting', () => {
    expect(parsePitMenu([
      menuLine('DAMAGE:', 2, ['Do Not Repair', 'Repair Body', 'Repair All']),
      menuLine('VIRTUAL ENERGY:', 2, ['0% 0 laps', '1% 0 laps', '50% 20 laps']),
      menuLine('FUEL RATIO:', 0, ['0.86']),
      menuLine('TIRES:', 1, ['No Change', 'New Medium ', 'New Wet ']),
    ])).toEqual({ resourceValue: 50, resourceText: '50% 20 laps', tyres: 'New Medium', repair: 'Repair All', fuelRatio: 0.86, fuelRatioOptions: [0.86] });
    expect(parsePitMenu([menuLine('FUEL:', 0, ['45.0L'])])).toMatchObject({ resourceValue: 45, tyres: null, repair: null });
    expect(parsePitMenu([])).toBeNull();
  });

  it('reads the vehicle condition per corner and the tyre management estimates', () => {
    expect(parseVehicleCondition({ brakeCondition: [1, 1, 1, 1], fuel: 32.2, fuelCapacity: 117, suspensionDamage: [0, 0.72, 0, 0], tireCondition: [0.98, 0, 0.99, 0.98], vehicleDamage: 1.378 }))
      .toEqual({ body: 1.378, suspension: [0, 0.72, 0, 0], tires: [0.98, 0, 0.99, 0.98] });
    expect(parseVehicleCondition({ vehicleDamage: 0 })).toBeNull();
    expect(parseTireManagement({
      expectedUsage: { fuelConsumption: 2.128, fuelFractionPerLap: 0.018, virtualEnergyConsumption: 17096636, virtualEnergyFractionPerLap: 0.02533 },
      tireInventory: { maxAvailableTires: 56, newTires: 52 },
    })).toEqual({ type: 'tireManagement', vePerLap: 2.533, fuelPerLap: 2.128, newSets: 13, selected: null });
    expect(parseTireManagement({ expectedUsage: {}, tireInventory: { maxAvailableTires: 10, newTires: 7 } })?.newSets).toBe(1);
  });

  it('reads the selected set as used when any wheel was driven, with the most worn tread and the compound name', () => {
    const wheel = (isUsed: boolean, wearValue: number) => ({ compoundIndex: 0, index: isUsed ? 0 : 1, isUsed, type: isUsed ? 2 : 0, wearValue });
    const body = (selectedTires: unknown[]) => ({
      expectedUsage: { virtualEnergyFractionPerLap: 0.025 },
      optimalCompoundConditions: { compounds: [{ type: 'Medium', optimalTemperature: 92 }, { type: 'Wet', optimalTemperature: 50 }] },
      tireInvGarageOptions: { newTiresRemaining: 55, selectedTires },
    });
    expect(parseTireManagement(body([wheel(true, 98), wheel(true, 99), wheel(true, 99), wheel(true, 99)]))?.selected)
      .toEqual({ compound: 'Medium', used: true, wear: 0.98 });
    expect(parseTireManagement(body(Array.from({ length: 4 }, () => wheel(false, 100))))?.selected)
      .toEqual({ compound: 'Medium', used: false, wear: 1 });
    expect(parseTireManagement(body([]))?.selected).toBeNull();
  });

  it('reads the start amounts set in the garage: VE in percent, fuel only when given in litres', () => {
    expect(parseGarageData({
      VM_VIRTUAL_ENERGY: { available: true, stringValue: '50% (20.1 laps)', value: 50 },
      VM_FUEL_LEVEL: { available: true, stringValue: '0.86', value: 85 },
    })).toEqual({ type: 'garage', veStart: 50, fuelStart: null, fuelRatio: 0.86 });
    expect(parseGarageData({ VM_VIRTUAL_ENERGY: { available: false, stringValue: '' }, VM_FUEL_LEVEL: { stringValue: '60.0L (21.3 laps)' } }))
      .toEqual({ type: 'garage', veStart: null, fuelStart: 60 });
  });

  it('reads the rain chance of each forecast node by session, in session order', () => {
    const node = (chance: number) => ({ WNV_RAIN_CHANCE: { currentValue: chance, stringValue: `${chance}%` }, WNV_SKY: { currentValue: 0 } });
    expect(parseForecast({
      PRACTICE: { FINISH: node(0), NODE_25: node(100), NODE_50: node(0), NODE_75: node(0), START: node(0) },
      RACE: { START: node(20) },
    })).toEqual({
      type: 'forecast',
      sessions: {
        PRACTICE: [
          { fraction: 0, rainChance: 0 }, { fraction: 0.25, rainChance: 100 }, { fraction: 0.5, rainChance: 0 },
          { fraction: 0.75, rainChance: 0 }, { fraction: 1, rainChance: 0 },
        ],
        RACE: [{ fraction: 0, rainChance: 20 }],
      },
    });
    expect(parseForecast({})).toBeNull();
  });

  it('reads the race length from the event schedule, unknown without a single race', () => {
    // As read in every garage of a weekend, 2026-10-17.
    const session = (name: string, lengthTime: number) => ({ airTemp: 28, lengthTime, name, rainChance: 0 });
    const weekend = [session('PRACTICE', 5), session('QUALIFYING', 10)];
    expect(parseSchedule({ scheduledSessions: [...weekend, session('RACE', 5)] })).toEqual({ type: 'schedule', raceMinutes: 5 });
    expect(parseSchedule({ scheduledSessions: weekend })).toEqual({ type: 'schedule', raceMinutes: null });
    expect(parseSchedule({ scheduledSessions: [session('RACE 1', 20), session('RACE 2', 30)] })).toEqual({ type: 'schedule', raceMinutes: null });
    expect(parseSchedule({})).toBeNull();
  });
});
