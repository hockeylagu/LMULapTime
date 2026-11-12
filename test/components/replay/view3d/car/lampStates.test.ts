import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, RepeatWrapping, Texture } from 'three';
import type { CarLamp, CarMaterialRecipe } from '../../../../../shared/types/scenes/car.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { createLampMaterial, lampFrame, lampGlow, lampTexturePaths, surfaceLamp } from '../../../../../src/components/replay/view3d/car/carLamps.js';
import { createLampStates, lampStateFrame, lampStateFrames, pitFlashLit, rainLampsFlash, switches, flashes } from '../../../../../src/components/replay/view3d/car/lampStates.js';

const EMISSION = {scale: 1, vertexColour: false, viewBoost: null, ambientScaled: false, vertexAlpha: false};
const lamp = (states: CarLamp['states'], frames: Array<string | null> = ['off', 'on', 'brake']): CarLamp => ({
  role: 'brake', nodes: ['lamp'], material: 'BLGLO', frames, animation: {method: 'random', rate: null, sequence: null},
  emission: EMISSION,
  blend: 'alpha', states, defaultLit: false, hiddenInOwnCockpit: true,
});

it('shows the brake frame while braking, the on frame with headlights, else off, falling back past null states', () => {
  const brake = {off: 0, on: 1, brake: 2}, headlight = {off: 0, on: 1, brake: null}, unproven = {off: 0, on: null, brake: null};
  expect(lampStateFrame(brake, false, false)).toBe(0);
  expect(lampStateFrame(brake, true, false)).toBe(1);
  expect(lampStateFrame(brake, true, true)).toBe(2);
  expect(lampStateFrame(headlight, true, true)).toBe(1);
  expect(lampStateFrame(unproven, true, true)).toBe(0);
  expect(lampStateFrames({off: 0, on: 1, brake: 1})).toEqual([0, 1]);
});

it('loads each state frame that has a texture', () => {
  expect(lampTexturePaths(lamp({off: 0, on: 1, brake: 2}), false, EMISSION)).toEqual(['off', 'on', 'brake']);
  expect(lampTexturePaths(lamp({off: 0, on: 1, brake: null}, ['off', null]), false, EMISSION)).toEqual(['off']);
});

it('switches a car lamp with the lap headlights and brake, hiding a frame without a texture', () => {
  const maps = new Map([[0, new Texture()], [2, new Texture()]]);
  const states = {off: 0, on: 1, brake: 2};
  const material = createLampMaterial(lamp(states, ['off', null, 'brake']), EMISSION, maps.get(0)!, {flashes: false, rain: false, states, maps});
  expect(maps.get(2)!.wrapT).toBe(RepeatWrapping);
  const car = new Group(); car.add(new Mesh(new BoxGeometry(), material));
  const points = [{brake: 0.4}, {headlights: true, brake: 0}, {}] as ReplayTrajectoryPoint[];
  const lights = createLampStates(car, points)!;
  const at = (index: number) => lights.update({index, fraction: 0} as Parameters<typeof lights.update>[0]);
  at(0); expect(material.uniforms.map.value).toBe(maps.get(2)); expect(material.visible).toBe(true);
  at(1); expect(material.visible).toBe(false); // Its headlights-on frame has no texture.
  at(2); expect(material.uniforms.map.value).toBe(maps.get(0)); expect(material.visible).toBe(true);
  const released = [...maps.values()].map(map => vi.spyOn(map, 'dispose'));
  material.dispose();
  for (const dispose of released) expect(dispose).toHaveBeenCalledOnce();
});

it('leaves a car whose lamps cannot switch alone', () => {
  const states = {off: 0, on: null, brake: null}, maps = new Map([[0, new Texture()]]);
  const car = new Group(); car.add(new Mesh(new BoxGeometry(), createLampMaterial(lamp(states), EMISSION, maps.get(0)!, {flashes: false, rain: false, states, maps})));
  expect(createLampStates(car, [])).toBeNull();
});

it('switches headlight, brake, pit and rain lamps from their dark frame, and does not draw a lit-shader lamp', () => {
  const rain = {...lamp({off: 0, on: 1, brake: null}), role: 'rain' as const};
  expect(switches(lamp({off: 0, on: 1, brake: 2}), false)).toBe(true);
  expect(switches(rain, false)).toBe(true);
  expect(switches({...rain, states: {off: 0, on: null, brake: null}}, false)).toBe(false);
  expect(lampTexturePaths(rain, false, EMISSION)).toEqual(['off', 'on']);
  expect(lampFrame({...rain, states: {off: null, on: 0, brake: null}}, false, EMISSION)).toBe('off'); // No dark frame: drawn from its lit one.
  expect(lampFrame({...lamp({off: 0, on: 1, brake: 2}), emission: null}, false, null)).toBeNull();
  // An always-lit pit light is drawn from its lit frame.
  expect(lampFrame({...lamp({off: null, on: 0, brake: null}, ['lit']), role: 'pit'}, false, EMISSION)).toBe('lit');
});

it('flashes the rain lamps of a body without a pit lamp, from their lit frame when they have no dark one', () => {
  const rain = {...lamp({off: null, on: 0, brake: null}, ['lit']), role: 'rain' as const}, pit = {...rain, role: 'pit' as const};
  expect([rainLampsFlash([rain]), rainLampsFlash([rain, pit])]).toEqual([true, false]);
  expect([switches(rain, true), lampFrame(rain, true, EMISSION), lampTexturePaths(rain, true, EMISSION)]).toEqual([true, 'lit', ['lit']]);
  // A body with a pit lamp still lights its rain lamp with the rain light, but does not flash it.
  expect([switches(rain, false), flashes(rain, false), flashes(rain, true)]).toEqual([true, false, true]);
});

it('lights a rain lamp with the rain light, and a flashing one with the pit limiter first', () => {
  const states = {off: null, on: 0, brake: null}, maps = new Map([[0, new Texture()]]);
  const rainLamp = {...lamp(states, ['lit']), role: 'rain' as const};
  const steady = createLampMaterial(rainLamp, EMISSION, maps.get(0)!, {flashes: false, rain: true, states, maps});
  const flashing = createLampMaterial(rainLamp, EMISSION, new Texture(), {flashes: true, rain: true, states, maps: new Map([[0, new Texture()]])});
  const car = new Group(); car.add(new Mesh(new BoxGeometry(), steady), new Mesh(new BoxGeometry(), flashing));
  const points = [{timeSec: 0, rainLight: true}, {timeSec: 1}, {timeSec: 2.15, rainLight: true, pitLimiter: true}] as ReplayTrajectoryPoint[];
  const lights = createLampStates(car, points)!;
  const at = (index: number) => lights.update({index, fraction: 0} as Parameters<typeof lights.update>[0]);
  at(0); expect([steady.visible, flashing.visible]).toEqual([true, true]);
  at(1); expect([steady.visible, flashing.visible]).toEqual([false, false]);
  at(2); expect([steady.visible, flashing.visible]).toEqual([true, false]); // 2.15 s: the flash's dark half wins over the rain light.
});

it('flashes a pit lamp at 4 Hz while the pit limiter is on, hidden in the dark half when it has no dark frame', () => {
  expect([0, 0.1, 0.13, 0.25].map(t => pitFlashLit(true, t))).toEqual([true, true, false, true]);
  expect(pitFlashLit(false, 0)).toBe(false);
  const states = {off: null, on: 0, brake: null}, maps = new Map([[0, new Texture()]]);
  const material = createLampMaterial({...lamp(states, ['lit']), role: 'pit'}, EMISSION, maps.get(0)!, {flashes: true, rain: false, states, maps});
  const car = new Group(); car.add(new Mesh(new BoxGeometry(), material));
  const points = [{timeSec: 10, pitLimiter: true, headlights: true, brake: 1}, {timeSec: 10.2, pitLimiter: true}, {timeSec: 11}] as ReplayTrajectoryPoint[];
  const lights = createLampStates(car, points)!;
  const at = (index: number, fraction = 0) => lights.update({index, fraction} as Parameters<typeof lights.update>[0]);
  at(0); expect(material.visible).toBe(true); // Lit half, whatever the headlights and brake.
  at(0, 0.75); expect(material.visible).toBe(false); // 10.15 s: dark half.
  at(2); expect(material.visible).toBe(false); // Limiter off.
});

it('draws a lamp without a lamp emission only when its material is a display, glowing by its day intensity and vertex colour', () => {
  const lit = {...lamp({off: 0, on: 1, brake: null}), emission: null};
  const display = (parameters: Record<string, unknown>) => [{name: 'BLGLO', surface: {kind: 'display', parameters}}] as unknown as CarMaterialRecipe[];
  expect(lampGlow(lit, display({EmissiveDayIntensity: 10000, EmissiveNightIntensity: 6000}))).toEqual({displayIntensity: 10000});
  expect(lampGlow(lit, [{name: 'BLGLO', surface: {kind: 'standard', parameters: {}}}] as unknown as CarMaterialRecipe[])).toBeNull();
  expect(lampGlow(lamp({off: 0, on: 1, brake: null}), [])).toBe(EMISSION);
  expect(() => lampGlow(lit, display({}))).toThrow('no day intensity');
  const material = createLampMaterial(lit, {displayIntensity: 10000}, new Texture());
  expect(material.vertexShader).toContain('_lmu_colour');
  expect(material.fragmentShader).toContain('tex.rgb * vColour.rgb * scale');
});

it('draws a lamp without a lamp emission as its own surface when its standard material glows always', () => {
  const lit = {...lamp({off: 0, on: null, brake: null}), emission: null};
  const recipe = (kind: string, emissive?: string) => [{name: 'BLGLO', surface: {kind, flags: {emissive}, parameters: {}}}] as unknown as CarMaterialRecipe[];
  expect(surfaceLamp(lit, recipe('standard', 'always'))).toBe(true);
  expect(surfaceLamp(lit, recipe('standard', 'night'))).toBe(false);
  expect(surfaceLamp(lit, recipe('display'))).toBe(false);
  expect(surfaceLamp(lamp({off: 0, on: null, brake: null}), recipe('standard', 'always'))).toBe(false); // A lamp emission draws as a lamp.
  expect(lampGlow(lit, recipe('standard', 'always'))).toBeNull();
});
