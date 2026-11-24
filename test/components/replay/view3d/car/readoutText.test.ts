import { describe, expect, it } from 'vitest';
import type { CarReadout, CarReadoutFont, CarReadoutText } from '../../../../../shared/types/scenes/car.js';
import { lapTimeText, readoutGlyphQuads, readoutText, readoutTextQuads } from '../../../../../src/components/replay/view3d/car/readoutText.js';

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
    expect(readoutText(field({name: 'CurrentLap'}), {x: 0, y: 0, z: 0}, 1050, {})).toBeNull();
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
