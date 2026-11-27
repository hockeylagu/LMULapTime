import { expect, it } from 'vitest';
import { ambientLookupPart } from '../../../../../src/components/replay/view3d/shaders/ambientLookup.js';
import { composeShader } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';

it("reads the environment's light along the normal with its world height halved, in place of the template's lookup", () => {
  const own = composeShader(litTemplate, []).fragmentShader, halved = composeShader(litTemplate, [ambientLookupPart]).fragmentShader;
  expect(own).toContain('iblIrradiance += getIBLIrradiance( geometryNormal );');
  expect(halved).not.toContain('iblIrradiance += getIBLIrradiance( geometryNormal );');
  expect(halved).toContain('getIBLIrradiance( transformDirection( inverseTransformDirection( geometryNormal, viewMatrix ) * vec3( 1.0, 0.5, 1.0 ), viewMatrix ) )');
  expect(ambientLookupPart.uniforms).toBeUndefined();
});
