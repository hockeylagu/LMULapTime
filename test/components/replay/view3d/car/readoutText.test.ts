import { describe, expect, it } from 'vitest';
import type { CarReadout, CarReadoutFont, CarReadoutText } from '../../../../../shared/types/scenes/car.js';
import { lapTimeText, readoutGlyphQuads, readoutText, readoutTextQuads } from '../../../../../src/components/replay/view3d/car/readoutText.js';
import { referenceLapNumber, setReadoutLapExtras } from '../../../../../src/components/replay/view3d/car/readoutLapExtras.js';

const field = (extra: Partial<CarReadoutText> = {}): CarReadoutText => ({
  name: 'Speed', font: 0, scale: [1, 1], offset: [0.5, 0.25], alignW: 0, alignH: 0, alphaColor: null, units: 1, defaultValue: '', ...extra,
});
// A 16-column sheet of 64 px cells from character 32: '0' is glyph 16 (column 0, row 1), '1' glyph 17.
const font: CarReadoutFont = {texture: 'textures/f.ktx2.zst', size: [1024, 960], cell: [64, 64], columns: 16,
  advances: Array.from({length: 240}, (_, i) => i === 16 || i === 17 ? 26 : 8)};

describe('readout text (decoded from the game)', () => {
  it('formats the replay values the game shows', () => {
    const point = {x: 0, y: 0, z: 0, gear: 0, speedKmh: 203.6, engineRpm: 7123.4, brakeTemps: [400.4, 401, 402, 403] as [number, number, number, number], virtualEnergy: 8.26};
    expect(readoutText(field({name: 'Gears'}), point, 0, {})).toBe('N');
    expect(readoutText(field({name: 'Gears'}), {...point, gear: -1}, 0, {})).toBe('R');
    expect(readoutText(field({name: 'Gears'}), {...point, gear: 4}, 0, {})).toBe('4');
    expect(readoutText(field(), point, 0, {})).toBe('204');
    expect(readoutText(field({units: 2}), point, 0, {})).toBe('127');
    expect(readoutText(field({name: 'RPM'}), point, 0, {})).toBe('7123');
    expect(readoutText(field({name: 'BTempLF'}), point, 0, {})).toBe('400');
    expect(readoutText(field({name: 'BTempRR', units: 2}), point, 0, {})).toBe('757');
    expect(readoutText(field({name: 'VirtualEnergyLevelDigit'}), point, 0, {})).toBe('8.3');
    expect(readoutText(field({name: 'VirtualEnergyLevelDigit'}), {...point, virtualEnergy: 54.6}, 0, {})).toBe('55');
    const player = {...point, tcMap: 6, absMap: 9, engineMixture: 1, brakeBiasRear: 0.49000000953674316, oilTemp: 78.59, waterTemp: 81.5};
    expect(readoutText(field({name: 'TCMap'}), player, 0, {})).toBe('6');
    expect(readoutText(field({name: 'ABSMap'}), player, 0, {})).toBe('9');
    expect(readoutText(field({name: 'EngineMixture'}), player, 0, {})).toBe('1');
    expect(readoutText(field({name: 'BrakeBias'}), player, 0, {})).toBe('51');
    expect(readoutText(field({name: 'BrakeBiasExact'}), player, 0, {})).toBe('51.00');
    expect(readoutText(field({name: 'OilTempDigit'}), player, 0, {})).toBe('79');
    expect(readoutText(field({name: 'WaterTempDigit'}), player, 0, {})).toBe('82');
    // No replay value: not drawn.
    expect(readoutText(field({name: 'TTempLF'}), point, 0, {})).toBeNull();
    expect(readoutText(field({name: 'TCMap'}), point, 0, {})).toBeNull();
  });

  it('shows lap times from the session timing, the finished lap for 10 s after the line', () => {
    const laps = [{lapNumber: 1, lapTimeSec: 95.5, s1Sec: 0, s2Sec: 0, s3Sec: 0}, {lapNumber: 2, lapTimeSec: 93.25, s1Sec: 0, s2Sec: 0, s3Sec: 0},
      {lapNumber: 3, lapTimeSec: 90, s1Sec: 0, s2Sec: 0, s3Sec: 0}];
    const lap = {currentLap: 3, lapStartTimeSec: 1000, timeReference: 'session' as const, laps};
    // A fused lap runs on the lap clock.
    expect(readoutText(field({name: 'CurrentLap'}), {x: 0, y: 0, z: 0}, 12.5, {currentLap: 3, timeReference: 'lap', laps})).toBe('0:12.500');
    const at = (name: CarReadoutText['name'], timeSec: number) => readoutText(field({name}), {x: 0, y: 0, z: 0}, timeSec, lap);
    expect(lapTimeText(93.25)).toBe('1:33.250');
    expect(at('CurrentLap', 1004)).toBe('1:33.250');
    expect(at('CurrentLap', 1012.3456)).toBe('0:12.346');
    expect(at('CurrentLap', 999)).toBe('1:32.250');
    expect(at('LastLap', 1050)).toBe('1:33.250');
    expect(at('BestLap', 1050)).toBe('1:33.250');
    expect(at('LapsCompleted', 1050)).toBe('2');
    expect(readoutText(field({name: 'BestLap'}), {x: 0, y: 0, z: 0}, 1050, {...lap, currentLap: 1})).toBe('-:--.---');
    // An invalid lap (a partial lap a session reset ends) is never the best, though it shows as the last lap.
    const reset = {...lap, laps: [laps[0], {...laps[1], lapTimeSec: 23.85, isValid: false}, laps[2]]};
    expect(readoutText(field({name: 'BestLap'}), {x: 0, y: 0, z: 0}, 1050, reset)).toBe('1:35.500');
    expect(readoutText(field({name: 'LastLap'}), {x: 0, y: 0, z: 0}, 1050, reset)).toBe('0:23.850');
    expect(referenceLapNumber(reset)).toBe(1);
    expect(referenceLapNumber({...reset, laps: [{...laps[0], isValid: false}, reset.laps[1]]})).toBeNull();
    expect(readoutText(field({name: 'CurrentLap'}), {x: 0, y: 0, z: 0}, 1050, {})).toBeNull();
  });

  it('shows sector times: the finished lap for 10 s after the line, then this lap finished or running', () => {
    const laps = [{lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 31, s3Sec: 29}, {lapNumber: 2, lapTimeSec: 88, s1Sec: 29.5, s2Sec: 30, s3Sec: 28.5}];
    const lap = {currentLap: 2, lapStartTimeSec: 100, timeReference: 'session' as const, laps};
    const at = (name: CarReadoutText['name'], timeSec: number) => readoutText(field({name}), {x: 0, y: 0, z: 0}, timeSec, lap);
    expect(at('LapTimeSector1', 105)).toBe('0:30.000');
    expect(at('LapTimeSector3', 105)).toBe('0:29.000');
    expect(at('LapTimeSector1', 120)).toBe('0:20.000');
    expect(at('LapTimeSector2', 120)).toBe('-:--.---');
    expect(at('LapTimeSector1', 140)).toBe('0:29.500');
    expect(at('LapTimeSector2', 140)).toBe('0:10.500');
    expect(at('LapTimeSector3', 180)).toBe('0:20.500');
  });

  it('shows the delta, predicted lap and last-lap use once the extras are registered', () => {
    const laps = [{lapNumber: 1, lapTimeSec: 90, s1Sec: 0, s2Sec: 0, s3Sec: 0}];
    const points = [{x: 0, y: 0, z: 0, fuel: 50, virtualEnergy: 80}, {x: 0, y: 0, z: 0, fuel: 48.7, virtualEnergy: 76.5}];
    const lap = {currentLap: 2, lapStartTimeSec: 0, timeReference: 'session' as const, laps, points};
    const at = (name: CarReadoutText['name'], index: number) => readoutText(field({name}), points[index], 0, lap, index);
    expect(at('DeltaPositive', 1)).toBeNull();
    expect(at('LapTimePredicted', 1)).toBeNull();
    setReadoutLapExtras(lap, {referenceLapSec: 90, delta: [0, -0.4567], previousFuelUsed: 2.5, previousEnergyUsed: 4.25});
    expect(at('DeltaNegative', 1)).toBe('-0.457');
    expect(at('DeltaPositive', 1)).toBe('');
    expect(at('DeltaNeutral', 1)).toBe('');
    expect(at('DeltaPositive', 0)).toBe('+0.000');
    expect(at('LapTimePredicted', 1)).toBe('1:29.543');
    expect(at('FuelUsedThisLap', 1)).toBe('1.30');
    expect(at('FuelLastLap', 1)).toBe('2.50');
    expect(at('VirtualEnergyUsedThisLap', 1)).toBe('3.50');
    expect(at('VirtualEnergyLastLap', 1)).toBe('4.25');
    expect(readoutText(field({name: 'DeltaPositive'}), points[1], 0, lap, 1)).toBe('');
    const first = {currentLap: 1, lapStartTimeSec: 0, laps: []};
    setReadoutLapExtras(first, {referenceLapSec: null, delta: null, previousFuelUsed: null, previousEnergyUsed: null});
    expect(readoutText(field({name: 'DeltaNeutral'}), {x: 0, y: 0, z: 0}, 0, first, 0)).toBe(' -.---');
    expect(readoutText(field({name: 'LapTimePredicted'}), {x: 0, y: 0, z: 0}, 0, first, 0)).toBe('-:--.---');
    expect(readoutText(field({name: 'FuelLastLap'}), {x: 0, y: 0, z: 0}, 0, first, 0)).toBeNull();
  });

  it('shows the place, the laps in the stint and the battery level', () => {
    const laps = [1, 2, 3, 4, 5].map(lapNumber => ({lapNumber, lapTimeSec: 90, s1Sec: 0, s2Sec: 0, s3Sec: 0, isPitStop: lapNumber === 3}));
    const lap = {currentLap: 6, lapStartTimeSec: 500, timeReference: 'session' as const, laps, driverSlot: 7,
      standingsHistory: [{timeSec: 0, order: [3, 7, 1]}, {timeSec: 520, order: [7, 3, 1]}]};
    expect(readoutText(field({name: 'Place'}), {x: 0, y: 0, z: 0}, 510, lap)).toBe(' 2/3');
    expect(readoutText(field({name: 'Place'}), {x: 0, y: 0, z: 0}, 530, lap)).toBe(' 1/3');
    expect(readoutText(field({name: 'Place'}), {x: 0, y: 0, z: 0}, 30, {...lap, timeReference: 'lap'})).toBe(' 1/3');
    expect(readoutText(field({name: 'LapsInStint'}), {x: 0, y: 0, z: 0}, 510, lap)).toBe('2');
    expect(readoutText(field({name: 'LapsInStint'}), {x: 0, y: 0, z: 0}, 510, {...lap, laps: laps.map(row => ({...row, isPitStop: false}))})).toBe('5');
    expect(readoutText(field({name: 'BatteryLevelDigit'}), {x: 0, y: 0, z: 0, soc: 63.4}, 0, lap)).toBe('63');
    expect(readoutText(field({name: 'BatteryLevelDigit'}), {x: 0, y: 0, z: 0, soc: 7.26}, 0, lap)).toBe('7.3');
    expect(readoutText(field({name: 'Laps'}), {x: 0, y: 0, z: 0}, 510, lap)).toBeNull();
  });

  it('lays glyphs out on whole pixels from the anchor, aligned by advance width and cell height - 2', () => {
    const [first, second] = readoutGlyphQuads(field({alignW: 1, alignH: 1, scale: [2, 2]}), font, [1024, 1024], '01');
    // Anchor (512, 256); width 52, height 62: x = 512 - 26 = 486, y = 256 - 31 = 225; the quad at (x + 0.5) x 2.
    expect(first.x0 * 1024).toBeCloseTo(973);
    expect(first.y0 * 1024).toBeCloseTo(451);
    expect((first.x1 - first.x0) * 1024).toBeCloseTo(128);
    expect(second.x0 * 1024).toBeCloseTo((486 + 26 + 0.5) * 2);
    // Glyph 16 sits at column 0, row 1: texels 1..64 across, 65..128 down.
    expect([first.u0 * 1024, first.u1 * 1024, first.v0 * 960, first.v1 * 960]).toEqual([1, 64, 65, 128]);
    expect(first.argb).toEqual([255, 255, 255, 255]);
    expect(readoutGlyphQuads(field({alignW: 2}), font, [1024, 1024], '0\u0001')).toHaveLength(1);
  });

  it('draws no text without a canvas size', () => {
    const readout: CarReadout = {material: 'SCREEN', rpm: {min: 0, max: -1, altMin: -1, altMax: -1}, revLimitRpm: 8000, canvasSize: null, elements: [],
      texts: [field({name: 'RPM'})], fonts: [font]};
    expect(readoutTextQuads(readout, {x: 0, y: 0, z: 0, engineRpm: 5000}, 0, {})).toEqual([[]]);
    expect(readoutTextQuads({...readout, canvasSize: [1024, 1024]}, {x: 0, y: 0, z: 0, engineRpm: 5000}, 0, {})[0]).toHaveLength(4);
  });
});
