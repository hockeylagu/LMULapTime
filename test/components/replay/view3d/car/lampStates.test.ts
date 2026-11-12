import { expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, RepeatWrapping, Texture } from 'three';
import type { CarLamp } from '../../../../../shared/types/scenes/car.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { createLampMaterial, lampFrame, lampTexturePaths } from '../../../../../src/components/replay/view3d/car/carLamps.js';
import { createLampStates, lampStateFrame, lampStateFrames, pitFlashLit, rainLampsFlash, switches, flashes } from '../../../../../src/components/replay/view3d/car/lampStates.js';

const lamp = (states: CarLamp['states'], frames: Array<string | null> = ['off', 'on', 'brake']): CarLamp => ({
  role: 'brake', nodes: ['lamp'], material: 'BLGLO', frames, animation: {method: 'random', rate: null, sequence: null},
  emission: {scale: 1, vertexColour: false, viewBoost: null, ambientScaled: false, vertexAlpha: false},
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
  expect(lampTexturePaths(lamp({off: 0, on: 1, brake: 2}), false)).toEqual(['off', 'on', 'brake']);
  expect(lampTexturePaths(lamp({off: 0, on: 1, brake: null}, ['off', null]), false)).toEqual(['off']);
});

it('switches a car lamp with the lap headlights and brake, hiding a frame without a texture', () => {
  const maps = new Map([[0, new Texture()], [2, new Texture()]]);
  const states = {off: 0, on: 1, brake: 2};
  const material = createLampMaterial(lamp(states, ['off', null, 'brake']), maps.get(0)!, {flashes: false, rain: false, states, maps});
  expect(maps.get(2)!.wrapT).toBe(RepeatWrapping);
  const car = new Group(); car.add(new Mesh(new BoxGeometry(), material));
  const points = [{brake: 0.4}, {headlights: true, brake: 0}, {}] as ReplayTrajectoryPoint[];
  const lights = createLampStates(car, points)!;
  const at = (index: number) => lights.update({index, fraction: 0} as Parameters<typeof lights.update>[0]);
  at(0); expect(material.uniforms.map.value).toBe(maps.get(2)); expect(material.visible).toBe(true);
  at(1); expect(material.visible).toBe(false); // Its headlights-on frame has no texture.
  at(2); expect(material.uniforms.map.value).toBe(maps.get(0)); expect(material.visible).toBe(true);
});

it('leaves a car whose lamps cannot switch alone', () => {
  const states = {off: 0, on: null, brake: null}, maps = new Map([[0, new Texture()]]);
  const car = new Group(); car.add(new Mesh(new BoxGeometry(), createLampMaterial(lamp(states), maps.get(0)!, {flashes: false, rain: false, states, maps})));
  expect(createLampStates(car, [])).toBeNull();
});

it('switches headlight, brake, pit and rain lamps from their dark frame, and does not draw a lit-shader lamp', () => {
  const rain = {...lamp({off: 0, on: 1, brake: null}), role: 'rain' as const};
  expect(switches(lamp({off: 0, on: 1, brake: 2}), false)).toBe(true);
  expect(switches(rain, false)).toBe(true);
  expect(switches({...rain, states: {off: 0, on: null, brake: null}}, false)).toBe(false);
  expect(lampTexturePaths(rain, false)).toEqual(['off', 'on']);
  expect(lampFrame({...rain, states: {off: null, on: 0, brake: null}}, false)).toBe('off'); // No dark frame: drawn from its lit one.
  expect(lampFrame({...lamp({off: 0, on: 1, brake: 2}), emission: null}, false)).toBeNull();
  // An always-lit pit light is drawn from its lit frame.
  expect(lampFrame({...lamp({off: null, on: 0, brake: null}, ['lit']), role: 'pit'}, false)).toBe('lit');
});

it('flashes the rain lamps of a body without a pit lamp, from their lit frame when they have no dark one', () => {
  const rain = {...lamp({off: null, on: 0, brake: null}, ['lit']), role: 'rain' as const}, pit = {...rain, role: 'pit' as const};
  expect([rainLampsFlash([rain]), rainLampsFlash([rain, pit])]).toEqual([true, false]);
  expect([switches(rain, true), lampFrame(rain, true), lampTexturePaths(rain, true)]).toEqual([true, 'lit', ['lit']]);
  // A body with a pit lamp still lights its rain lamp with the rain light, but does not flash it.
  expect([switches(rain, false), flashes(rain, false), flashes(rain, true)]).toEqual([true, false, true]);
});

it('lights a rain lamp with the rain light, and a flashing one with the pit limiter first', () => {
  const states = {off: null, on: 0, brake: null}, maps = new Map([[0, new Texture()]]);
  const rainLamp = {...lamp(states, ['lit']), role: 'rain' as const};
  const steady = createLampMaterial(rainLamp, maps.get(0)!, {flashes: false, rain: true, states, maps});
  const flashing = createLampMaterial(rainLamp, new Texture(), {flashes: true, rain: true, states, maps: new Map([[0, new Texture()]])});
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
  const material = createLampMaterial({...lamp(states, ['lit']), role: 'pit'}, maps.get(0)!, {flashes: true, rain: false, states, maps});
  const car = new Group(); car.add(new Mesh(new BoxGeometry(), material));
  const points = [{timeSec: 10, pitLimiter: true, headlights: true, brake: 1}, {timeSec: 10.2, pitLimiter: true}, {timeSec: 11}] as ReplayTrajectoryPoint[];
  const lights = createLampStates(car, points)!;
  const at = (index: number, fraction = 0) => lights.update({index, fraction} as Parameters<typeof lights.update>[0]);
  at(0); expect(material.visible).toBe(true); // Lit half, whatever the headlights and brake.
  at(0, 0.75); expect(material.visible).toBe(false); // 10.15 s: dark half.
  at(2); expect(material.visible).toBe(false); // Limiter off.
});
