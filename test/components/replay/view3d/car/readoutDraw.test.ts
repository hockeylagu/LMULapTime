import { describe, expect, it } from 'vitest';
import type { CarReadout, CarReadoutElement } from '../../../../../shared/types/scenes/car.js';
import { readoutInput, readoutQuad, readoutQuads, readoutValue, rpmInput } from '../../../../../src/components/replay/view3d/car/readoutDraw.js';

const element = (extra: Partial<CarReadoutElement> = {}): CarReadoutElement => ({
  name: 'RPMBar', texture: null, scale: [0.5, 0.1], offset: [0.1, 0.8], uvMin: [0, 0.9], uvMax: [1, 1],
  alphaColor: [255, 0, 255, 0], offAlphaColor: [0, 0, 0, 0], altAlphaColor: null, orientation: 0, elements: 10, renderOrder: 0,
  maxValue: null, threshold: null, altValue: null, altUvOffset: null, defaultValue: 0, ...extra,
});
const readout = (elements: CarReadoutElement[]): CarReadout => ({material: 'SCREEN', rpm: {min: 5000, max: 9000, altMin: 7000, altMax: -1}, revLimitRpm: 8000, elements});

describe('readout draw rules (decoded from the game)', () => {
  it('tops the rpm range at the display maximum only when it is within the rev limit', () => {
    expect(rpmInput(7000, 6000, 7500, 8000)).toBeCloseTo(2 / 3);
    // F296 GT3 EVO: display max 9000 above the 8000 rev limit, so the bar fills to the limit; -1 is the limit too.
    expect(rpmInput(7000, 5000, 9000, 8000)).toBeCloseTo(2 / 3);
    expect(rpmInput(7000, 5000, -1, 8000)).toBeCloseTo(2 / 3);
    expect(rpmInput(4000, 5000, -1, 8000)).toBe(0);
    expect(rpmInput(9000, 5000, -1, 8000)).toBe(1);
  });

  it('fills left to right with rounded cells and takes the alternate colour and offset below altValue', () => {
    const bar = element({altValue: 0.5, altAlphaColor: [255, 255, 0, 0], altUvOffset: [0, -0.1]});
    expect(readoutQuad(bar, 0.84)).toMatchObject({x0: 0.1, x1: 0.1 + 0.5 * 0.8, u1: 0.8, v0: 0.9, argb: [255, 0, 255, 0]});
    const low = readoutQuad(bar, 0.26);
    expect(low.x1).toBeCloseTo(0.1 + 0.5 * 0.3);
    expect(low.argb).toEqual([255, 255, 0, 0]);
    expect(low.v0).toBeCloseTo(0.8);
    expect(readoutQuad(bar, -1)).toMatchObject({x1: 0.6, u1: 1, argb: [0, 0, 0, 0]});
  });

  it('fills bottom up, picks one cell, and keeps the whole quad for the other orientations', () => {
    const fill = readoutQuad(element({orientation: 1}), 0.5);
    [fill.y0, fill.y1, fill.v0, fill.v1].forEach((value, i) => expect(value).toBeCloseTo([0.85, 0.9, 0.95, 1][i]));
    const cell = readoutQuad(element({orientation: 2, elements: 4, uvMin: [0, 0], uvMax: [1, 1]}), 0.5);
    expect([cell.u0, cell.u1, cell.x1]).toEqual([0.5, 0.75, 0.6]);
    expect(readoutQuad(element({orientation: 5, alphaColor: null}), 1)).toMatchObject({x1: 0.6, u1: 1, argb: [255, 255, 255, 255]});
  });

  it('switches icons on above (3..5) or below (6..8) their threshold and flashes 4/7 at 5 Hz, 5/8 at 1 Hz', () => {
    expect(readoutValue(element({orientation: 3}), 1, null, 0)).toBe(1);
    expect(readoutValue(element({orientation: 3}), 0, null, 0)).toBe(-1);
    expect(readoutValue(element({orientation: 6, threshold: 0.5}), 0.2, null, 0)).toBe(1);
    expect(readoutValue(element({orientation: 5}), 1, null, 0.2)).toBe(-1);
    expect(readoutValue(element({orientation: 5}), 1, null, 0.7)).toBe(1);
    expect(readoutValue(element({orientation: 4}), 1, null, 0.05)).toBe(-1);
    expect(readoutValue(element({orientation: 4}), 1, null, 0.15)).toBe(1);
    expect(readoutValue(element({maxValue: 1000}), 500, null, 0)).toBe(0.5);
  });

  it('draws only the elements the replay has an input for', () => {
    const row = readout([element(), element({name: 'TCLeftBar'}), element({name: 'ABSLeftBar'}), element({name: 'PitLimiterIcon', orientation: 3}),
      element({name: 'BrakeTempRLIcon', orientation: 2, maxValue: 1000}), element({name: 'VirtualEnergyBar'})]);
    const point = {x: 0, y: 0, z: 0, engineRpm: 7000, pitLimiter: true, tcActive: false, brakeTemps: [100, 200, 300, 400] as [number, number, number, number], virtualEnergy: 40};
    const quads = readoutQuads(row, point, 0);
    expect(quads.map(quad => quad !== null)).toEqual([true, false, false, true, true, true]);
    expect(readoutInput(row.elements[4], row, point)).toEqual({x: 300, flashHz: null});
    expect(readoutInput(row.elements[5], row, point)).toEqual({x: 0.4, flashHz: null});
    expect(readoutInput(row.elements[1], row, {...point, tcActive: true})).toEqual({x: 1, flashHz: 10});
    expect(readoutInput(row.elements[2], row, {...point, absActive: true})).toEqual({x: 1, flashHz: null});
    expect(readoutInput(element({name: 'ABSLockedLeftIcon', orientation: 3}), row, {...point, absActive: true})).toBeNull();
    expect(readoutQuads(row, {x: 0, y: 0, z: 0}, 0)[0]).toBeNull();
  });
});
