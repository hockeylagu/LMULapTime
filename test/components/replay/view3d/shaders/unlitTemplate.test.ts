import { ShaderMaterial } from 'three';
import { expect, it } from 'vitest';
import { composeShader } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { unlitTemplate } from '../../../../../src/components/replay/view3d/shaders/unlitTemplate.js';

const includes = (source: string) => [...source.matchAll(/#include <(\w+)>/g)].map(match => match[1]);

it("uses three's chunks unchanged only for the project path, vertex colour and the output write", () => {
  const {vertexShader, fragmentShader} = composeShader(unlitTemplate, []);
  expect(includes(vertexShader)).toEqual(['common', 'batching_pars_vertex', 'color_pars_vertex', 'color_vertex', 'batching_vertex', 'begin_vertex', 'project_vertex']);
  expect(includes(fragmentShader)).toEqual(['common', 'color_pars_fragment', 'color_fragment', 'opaque_fragment', 'tonemapping_fragment', 'colorspace_fragment']);
});

it("draws as three's white basic material: white times the vertex colour at the material's opacity, parts on the colour before the write", () => {
  const {fragmentShader} = composeShader(unlitTemplate, [{name: 'tint', slots: {fragmentColour: {at: 0, glsl: 'TINT;'}, fragmentOutput: {at: 0, glsl: 'AFTER;'}}}]);
  expect(fragmentShader).toContain('vec4 diffuseColor = vec4( vec3( 1.0 ), opacity );');
  const at = (text: string) => fragmentShader.indexOf(text);
  expect(at('#include <color_fragment>')).toBeLessThan(at('TINT;'));
  expect(at('TINT;')).toBeLessThan(at('vec3 outgoingLight = diffuseColor.rgb;'));
  expect(at('#include <colorspace_fragment>')).toBeLessThan(at('AFTER;'));
  const material = new ShaderMaterial({opacity: 0.3});
  expect(unlitTemplate.uniforms(material).opacity.value).toBe(0.3);
});
