import { expect, it } from 'vitest';
import { BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { createNightSwitch, DAY_STATE, drawnIn, sceneVisibility } from '../../../../../src/components/replay/view3d/night/nightSwitch.js';

const part = (lmuVisibility?: string) => Object.assign(new Mesh(new BufferGeometry(), new MeshBasicMaterial()), {userData: lmuVisibility ? {lmuVisibility} : {}});

it('reads a node’s switched state on the mesh or its group, and ignores any other value', () => {
  const card = part(), group = new Group();
  group.userData.lmuVisibility = 'lightsOn'; group.add(card);
  expect([sceneVisibility(part('night')), sceneVisibility(card), sceneVisibility(part('dusk')), sceneVisibility(part())]).toEqual(['night', 'lightsOn', undefined, undefined]);
});

it('draws the day state by day, the night state at night and the glow card while the track lights are on', () => {
  const states = [DAY_STATE, {night: true, lightsOn: false}, {night: true, lightsOn: true}];
  expect((['day', 'night', 'lightsOn'] as const).map(visibility => states.map(state => drawnIn(visibility, state)))).toEqual([
    [true, false, false], [false, true, true], [false, false, true],
  ]);
});

it("switches a chunk's day and night parts and its glow card, and leaves every other part drawn", () => {
  const root = new Group(), [day, night, card, plain] = [part('day'), part('night'), part('lightsOn'), part()];
  root.add(day, night, card, plain);
  const nightSwitch = createNightSwitch();
  nightSwitch.add(root);
  const shown = () => [day, night, card, plain].map(mesh => mesh.visible);
  expect(shown()).toEqual([true, false, false, true]);
  nightSwitch.set({night: true, lightsOn: true});
  expect(shown()).toEqual([false, true, true, true]);
  // A chunk that arrives at night joins in the night state.
  const later = part('night'), next = new Group().add(later);
  nightSwitch.add(next);
  expect(later.visible).toBe(true);
  nightSwitch.set({night: true, lightsOn: false});
  expect(shown()).toEqual([false, true, false, true]);
});
