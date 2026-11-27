import { DataTexture, MeshBasicMaterial, ShaderMaterial, UniformsGroup, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { composedGhost, composedMaterial, composedParts, composedTemplate, composedTextures, composeShader, SLOTS, type ShaderPart, type ShaderTemplate } from '../../../../../src/components/replay/view3d/shaders/composer.js';

/** A template that places every slot in order, each on its own line. */
const template: ShaderTemplate = {
  name: 'test',
  vertex: slot => `V\n${slot('vertexPars')}\n${slot('vertexView')}\n${slot('vertexOutputs')}`,
  fragment: slot => `F\n${slot('fragmentPars')}\n${slot('fragmentColour')}\n${slot('fragmentOutput')}`,
  uniforms: material => ({opacity: {get value() { return material.opacity; }}}),
};
const shared = {value: new Vector3()};
const part = (name: string, slots: ShaderPart['slots'], rest: Partial<ShaderPart> = {}): ShaderPart => ({name, slots, ...rest});

it('orders slot code by the fixed slot order, then by each part\'s declared position, whatever order the parts come in', () => {
  const late = part('late', {fragmentColour: {at: 20, glsl: 'late();'}, vertexPars: {at: 0, glsl: 'late pars'}});
  const early = part('early', {fragmentColour: {at: 10, glsl: 'early();'}, fragmentOutput: {at: 0, glsl: 'out();'}});
  const {fragmentShader, vertexShader} = composeShader(template, [late, early]);
  expect(fragmentShader.indexOf('early();')).toBeLessThan(fragmentShader.indexOf('late();'));
  expect(fragmentShader.indexOf('late();')).toBeLessThan(fragmentShader.indexOf('out();'));
  expect(vertexShader).toContain('late pars');
  expect(composeShader(template, [early, late])).toEqual(composeShader(template, [late, early]));
  expect(SLOTS.map(slot => slot.name)).toEqual(['vertexPars', 'vertexNormal', 'vertexPosition', 'vertexProjected', 'vertexView', 'vertexOutputs',
    'fragmentPars', 'fragmentAlbedo', 'fragmentColour', 'fragmentNormal', 'fragmentEmission', 'fragmentMaterial', 'fragmentSunLight', 'fragmentSunDirect',
    'fragmentIrradiance', 'fragmentRadiance', 'fragmentReflection', 'fragmentIndirectSpecular', 'fragmentOcclusion', 'fragmentLight', 'fragmentOutput']);
});

it('refuses two parts in an exclusive slot, two parts at one position, a missing needed part and a part given twice', () => {
  const pull = part('pull', {vertexView: {at: 0, glsl: 'a'}}), push = part('push', {vertexView: {at: 1, glsl: 'b'}});
  expect(() => composeShader(template, [pull, push])).toThrow('Slot vertexView is exclusive: pull and push both fill it');
  const a = part('a', {fragmentColour: {at: 5, glsl: 'a'}}), b = part('b', {fragmentColour: {at: 5, glsl: 'b'}});
  expect(() => composeShader(template, [a, b])).toThrow('share position 5 in fragmentColour');
  expect(() => composeShader(template, [part('c', {}, {needs: [a]})])).toThrow('Shader part c needs a');
  expect(() => composeShader(template, [a, a])).toThrow('given twice');
});

it('refuses a part in a slot the template lacks, and a template that places its slots out of order', () => {
  const vertexOnly: ShaderTemplate = {...template, fragment: () => 'F'};
  expect(() => composeShader(vertexOnly, [part('p', {fragmentColour: {at: 0, glsl: 'x'}})])).toThrow('has no slot fragmentColour for p');
  const swapped: ShaderTemplate = {...template, vertex: slot => `${slot('vertexOutputs')}${slot('vertexPars')}`};
  expect(() => composeShader(swapped, [])).toThrow('places its slots out of order');
});

it('keys the program on the description: the same description the same key, another shape another key, a value never', () => {
  const tinted = (value: number) => part('tint', {fragmentColour: {at: 0, glsl: 'diffuseColor *= tint;'}}, {uniforms: () => ({tint: {value}})});
  const key = (parts: ShaderPart[], defines = {}) => composeShader(template, parts, defines).key;
  expect(key([tinted(1)])).toBe(key([tinted(2)]));
  expect(composedMaterial(template, [tinted(1)]).customProgramCacheKey()).toBe(composedMaterial(template, [tinted(3)]).customProgramCacheKey());
  expect(key([tinted(1)])).not.toBe(key([part('tint', {fragmentColour: {at: 1, glsl: 'diffuseColor *= tint;'}})]));
  expect(key([tinted(1)])).not.toBe(key([part('tint', {fragmentOutput: {at: 0, glsl: 'diffuseColor *= tint;'}})]));
  expect(key([tinted(1)])).not.toBe(key([tinted(1)], {SOME_FLAG: 1}));
  expect(key([tinted(1)])).toMatch(/^lmu-composed-test-/);
});

it('builds a ShaderMaterial with the template\'s and parts\' uniforms and blocks, their parts and their own textures, without three\'s fog', () => {
  const texture = new DataTexture(), next = new DataTexture();
  const own = {value: texture};
  const mapped = part('mapped', {fragmentPars: {at: 0, glsl: 'uniform sampler2D map;'}}, {uniforms: () => ({map: own, scene: shared}), ownTextures: ['map']});
  const plain = part('plain', {});
  const material = composedMaterial(template, [mapped, plain], {transparent: true, depthWrite: false});
  expect(material).toBeInstanceOf(ShaderMaterial);
  expect([material.transparent, material.depthWrite, material.fog, material.lights, material.glslVersion]).toEqual([true, false, false, false, null]);
  expect(material.uniformsGroups).toEqual([]);
  expect(material.uniforms.map).toBe(own); expect(material.uniforms.scene).toBe(shared);
  material.opacity = 0.5; expect(material.uniforms.opacity.value).toBe(0.5);
  expect(composedParts(material)).toEqual([mapped, plain]);
  expect(composedTextures(material)).toEqual([texture]);
  own.value = next; // A swap reaches the warm-up through the uniform.
  expect(composedTextures(material)).toEqual([next]);
  const group = new UniformsGroup(), blocked = composedMaterial({...template, uniformsGroups: [group]}, [mapped]);
  expect(blocked.uniformsGroups).toEqual([group]); expect(blocked.uniformsGroups[0]).toBe(group);
  expect(composedTextures(new MeshBasicMaterial())).toBeNull(); expect(composedParts(new MeshBasicMaterial())).toBeNull();
});

it('refuses a uniform declared twice with different objects, and an own texture the part does not hold', () => {
  const a = part('a', {}, {uniforms: () => ({value: {value: 1}})}), b = part('b', {}, {uniforms: () => ({value: {value: 2}})});
  expect(() => composedMaterial(template, [a, b])).toThrow('Uniform value of b is declared twice');
  const both = part('both', {}, {uniforms: () => ({scene: shared})}), again = part('again', {}, {uniforms: () => ({scene: shared})});
  expect(composedMaterial(template, [both, again]).uniforms.scene).toBe(shared);
  expect(() => composedMaterial(template, [part('p', {}, {ownTextures: ['map']})])).toThrow('has no uniform map');
});

it("draws an exclusive slot's own template code until a part fills it, and refuses own code in a shared slot", () => {
  const owning: ShaderTemplate = {...template, fragment: slot => `F\n${slot('fragmentPars')}\n${slot('fragmentIrradiance', 'OWN;')}`};
  expect(composeShader(owning, []).fragmentShader).toContain('OWN;');
  const filled = composeShader(owning, [part('lookup', {fragmentIrradiance: {at: 0, glsl: 'PART;'}})]).fragmentShader;
  expect(filled).toContain('PART;'); expect(filled).not.toContain('OWN;');
  const shared: ShaderTemplate = {...template, fragment: slot => slot('fragmentColour', 'OWN;')};
  expect(() => composeShader(shared, [])).toThrow('gives code of its own to slot fragmentColour, which is not exclusive');
});

it("carries the template's defines into every program and its key, and refuses a family define the template sets", () => {
  const defined: ShaderTemplate = {...template, defines: {TEMPLATE_FLAG: '1.0'}};
  const {description, key} = composeShader(defined, [], {FAMILY_FLAG: 1});
  expect(description).toContain('["TEMPLATE_FLAG","1.0"]'); expect(description).toContain('["FAMILY_FLAG",1]');
  expect(key).not.toBe(composeShader(template, [], {FAMILY_FLAG: 1}).key);
  expect(composedMaterial(defined, [], {}, {FAMILY_FLAG: 1}).defines).toEqual({TEMPLATE_FLAG: '1.0', FAMILY_FLAG: 1});
  expect(() => composeShader(defined, [], {TEMPLATE_FLAG: 2})).toThrow("Define TEMPLATE_FLAG is the test template's own");
});

it("names a composed material's template, and puts it in ghost mode by the values its parts give a ghost, the others kept", () => {
  const rough = part('rough', {}, {uniforms: () => ({roughness: {value: 0.2}, tint: {value: 3}}), ghost: {roughness: 0.7}});
  const material = composedMaterial(template, [rough, part('plain', {}, {uniforms: () => ({level: {value: 4}})})]);
  expect(composedTemplate(material)).toBe(template); expect(composedTemplate(new MeshBasicMaterial())).toBeNull();
  composedGhost(material);
  expect([material.uniforms.roughness.value, material.uniforms.tint.value, material.uniforms.level.value]).toEqual([0.7, 3, 4]);
  // Ghost values are not the program's shape.
  expect(material.customProgramCacheKey()).toBe(composedMaterial(template, [part('rough', {}, {uniforms: () => ({roughness: {value: 0}, tint: {value: 0}})}), part('plain', {}, {uniforms: () => ({level: {value: 0}})})]).customProgramCacheKey());
  expect(() => composedGhost(composedMaterial(template, [part('lost', {}, {ghost: {missing: 1}})]))).toThrow('has no uniform missing for its ghost');
  expect(() => composedGhost(new MeshBasicMaterial())).toThrow('is not composed');
});