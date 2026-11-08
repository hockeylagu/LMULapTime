import { expect, it } from 'vitest';
import { Texture } from 'three';
import { createCarMaterial } from '../../../../../src/components/replay/view3d/car/carMaterials.js';
import type { CarAppearance, CarMaterialRecipe } from '../../../../../shared/types/scenes/car.js';

const appearance = { alias: 'a', albedo: 'paint', optionNodes: [] } as unknown as CarAppearance;
const recipe = (scale?: [number, number]): CarMaterialRecipe => ({
  id: 'm', name: 'GRID', paint: false,
  surface: { version: 4, kind: 'standard', finish: { roughness: 0.5, metalness: 0 }, maps: { albedo: { texture: 'a', uv: 'uv0', scale: scale as [number, number] } } },
});
const build = (scale?: [number, number]) => createCarMaterial(recipe(scale), appearance, () => new Texture()).map!;

it('tiles the albedo map by its descriptor scale', () => {
  const map = build([14, 6]);
  expect(map.repeat.toArray()).toEqual([14, 6]);
});

it('keeps an unscaled, zero or missing scale at one repeat', () => {
  expect(build([1, 1]).repeat.toArray()).toEqual([1, 1]);
  expect(build([0, 0]).repeat.toArray()).toEqual([1, 1]);
  expect(build().repeat.toArray()).toEqual([1, 1]);
});

it('does not change the shared source texture', () => {
  const source = new Texture();
  createCarMaterial(recipe([50, 50]), appearance, () => source);
  expect(source.repeat.toArray()).toEqual([1, 1]);
});
