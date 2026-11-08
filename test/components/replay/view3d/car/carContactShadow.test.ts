import { expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { createContactShadow } from '../../../../../src/components/replay/view3d/car/carContactShadow.js';

it('lays a soft footprint shadow on the car contact plane, darkest under the body and clear at its spread', () => {
  const model = new Group(); model.position.set(5, 1, 5);
  const body = new Mesh(new BoxGeometry(2, 1, 4.6)); body.position.y = 0.5; model.add(body);
  const shadow = createContactShadow(model);
  expect(shadow.position.y).toBeCloseTo(0.02); expect(shadow.position.x).toBeCloseTo(0); // Model-local, on the lowest point.
  expect(shadow.geometry.parameters.width).toBeCloseTo(3); expect(shadow.geometry.parameters.height).toBeCloseTo(5.6);
  const map = shadow.material.alphaMap!, {data, width, height} = map.image as {data: Uint8Array; width: number; height: number};
  const at = (column: number, row: number) => data[(row * width + column) * 4];
  expect(at(width >> 1, height >> 1)).toBe(Math.round(255 * 0.6));
  expect(at(0, 0)).toBe(0);
  expect(shadow.castShadow).toBe(false); expect(shadow.material).toBeInstanceOf(MeshBasicMaterial);
});
