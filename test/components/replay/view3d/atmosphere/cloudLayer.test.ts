import { Color, DataTexture, PerspectiveCamera, RedFormat, RGBAFormat, Scene, ShaderChunk, Vector3, type Mesh, type MeshStandardMaterial, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { cloudSheets, type CloudMoment } from '../../../../../src/components/replay/view3d/atmosphere/clouds.js';
import { createCloudLayer, patchCloudShader } from '../../../../../src/components/replay/view3d/atmosphere/cloudLayer.js';
import { createHaze } from '../../../../../src/components/replay/view3d/atmosphere/haze.js';
import { testClouds } from '../../../../helpers/scenes/sceneryProfiles.js';

const moment = (cells: string): CloudMoment => ({cells, upperDrift: 0, lowerDrift: 0, startUpperDrift: -10, startLowerDrift: -10});
const light = {sunDirection: new Vector3(0.6, 0.8, 0), sunGreen: 10, cloudCover: 0.25};
const haze = () => createHaze({originY: 0, height: {amount: 0.5, rate: 0.01, exponent: 2}, sunDirection: new Vector3(0, 1, 0), sunRadiance: new Color(1, 1, 1), sunward: 0.3})();
const program = () => ({uniforms: {}, vertexShader: '#include <common>\n#include <fog_vertex>', fragmentShader: '#include <common>\n#include <opaque_fragment>\n#include <fog_fragment>'});
const uniformsOf = (mesh: Mesh) => {
  const shader = program();
  (mesh.material as MeshStandardMaterial).onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, null as unknown as WebGLRenderer);
  return shader.uniforms as Record<string, {value: unknown}>;
};

describe('cloud layer', () => {
  it('draws one mesh per sheet, far to near, behind everything and blended over the sky', () => {
    const clouds = testClouds(), sheets = cloudSheets(clouds, moment('0fff0'), 0), layer = createCloudLayer(clouds, sheets, light);
    const meshes = layer.group.children as Mesh[];
    expect(meshes).toHaveLength(2);
    // The upper sheet (4000 m) is the farther one: it is drawn first.
    expect(meshes[0].geometry.getAttribute('position').getY(0)).toBeCloseTo(4000, 6); expect(meshes[1].geometry.getAttribute('position').getY(0)).toBeCloseTo(2000, 6);
    expect(meshes[0].renderOrder).toBeLessThan(meshes[1].renderOrder); expect(meshes[1].renderOrder).toBeLessThan(0);
    const material = meshes[0].material as MeshStandardMaterial;
    expect(material.transparent).toBe(true); expect(material.depthWrite).toBe(false); expect(meshes[0].frustumCulled).toBe(false);
    // Both sheets have the same cloud material: one material, one set of textures.
    expect(meshes[1].material).toBe(material);
    layer.dispose();
  });

  it('lays a sheet out in scene axes around the eye, keeping its frame in the field\'s own axes', () => {
    const clouds = testClouds(), [sheet] = cloudSheets(clouds, moment('0ffff'), 0), layer = createCloudLayer(clouds, [sheet], light);
    const {geometry} = layer.group.children[0] as Mesh, position = geometry.getAttribute('position');
    for (let v = 0; v < 4; v++) expect([position.getX(v), position.getY(v), position.getZ(v)]).toEqual([sheet.vertices[v * 3], sheet.vertices[v * 3 + 1], -sheet.vertices[v * 3 + 2]].map(Math.fround));
    expect(Array.from(geometry.getAttribute('cloudTangent').array.subarray(0, 3))).toEqual(Array.from(sheet.frame.subarray(0, 3)));
    expect(Array.from(geometry.getAttribute('cloudBinormal').array.subarray(0, 3))).toEqual(Array.from(sheet.frame.subarray(3, 6)));
    expect(Array.from(geometry.getAttribute('cloudNormal').array.subarray(0, 3))).toEqual(Array.from(sheet.frame.subarray(6, 9)));
    expect([...geometry.getAttribute('cloudFade').array]).toEqual([1, 1, 1, 1]);
    expect(geometry.getIndex()?.count).toBe(6);
  });

  it('follows the rendering camera', () => {
    const clouds = testClouds(), layer = createCloudLayer(clouds, cloudSheets(clouds, moment('0fff0'), 0), light), [first, second] = layer.group.children as Mesh[];
    const camera = new PerspectiveCamera();
    camera.position.set(120, 30, -45); camera.updateMatrixWorld();
    first.onBeforeRender(null as unknown as WebGLRenderer, new Scene(), camera, first.geometry, first.material as MeshStandardMaterial, null as never);
    expect(layer.group.position.toArray()).toEqual([120, 30, -45]);
    expect(new Vector3().setFromMatrixPosition(second.matrixWorld).toArray()).toEqual([120, 30, -45]);
  });

  it('lights a material by the package: the sun weighted for the cover, toward the sun in the field\'s axes', () => {
    const clouds = testClouds(), layer = createCloudLayer(clouds, cloudSheets(clouds, moment('0ffff'), 0), light), uniforms = uniformsOf(layer.group.children[0] as Mesh);
    // Sun weight: clear 2 to overcast 1 at cover 0.25, times the sun's green 10, over pi.
    expect(uniforms.cloudSunLight.value).toBeCloseTo(1.75 * 10 / Math.PI, 12);
    expect((uniforms.cloudSunDirection.value as Vector3).toArray()).toEqual([0.6, 0.8, -0]);
    expect((uniforms.cloudAlpha.value as Vector3).toArray()).toEqual([2, 4, 1]);
    expect((uniforms.cloudOpacity.value as Vector3).toArray()).toEqual([1, 1, 0]);
    expect((uniforms.cloudAlbedoMin.value as Vector3).toArray()).toEqual([0.8, 0.85, 0.9]);
    expect(uniforms.cloudBacklight.value).toEqual([4, 2048, 2, 8]); expect(uniforms.cloudBase.value).toBe(0.1);
    // The alpha map is the opacity map; the density, side and end maps are the light maps, three channels padded to four.
    const alpha = uniforms.cloudAlphaMap.value as DataTexture, density = uniforms.cloudDensityMap.value as DataTexture, side = uniforms.cloudSideMap.value as DataTexture;
    expect([alpha.format, alpha.image.width, alpha.mipmaps?.length]).toEqual([RedFormat, 2, 2]);
    expect([density.format, density.image.width]).toEqual([RedFormat, 1]);
    expect(side.format).toBe(RGBAFormat); expect([...(side.image.data as Uint8Array)]).toEqual([255, 128, 64, 255]);
    expect([...((uniforms.cloudEndMap.value as DataTexture).image.data as Uint8Array)]).toEqual([32, 128, 255, 255]);
  });

  it('patches the program: the cloud\'s colour and alpha, drawn at the far limit, under half the haze distance', () => {
    haze();
    const shader = program();
    patchCloudShader(shader);
    expect(shader.vertexShader).toContain('gl_Position.z = gl_Position.w;');
    expect(shader.vertexShader).toContain('vCloudRay = vec3( position.x, position.y, - position.z );');
    expect(shader.fragmentShader.indexOf('outgoingLight = (')).toBeLessThan(shader.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(shader.fragmentShader).toContain('exp( - 0.5 * fogDensity * vFogDepth )');
    expect(shader.fragmentShader).not.toContain('#include <fog_fragment>');
  });

  it('refuses a haze it does not know', () => {
    const fog = ShaderChunk.fog_fragment;
    try {
      ShaderChunk.fog_fragment = 'gl_FragColor.rgb = fogColor;';
      expect(() => { patchCloudShader(program()); }).toThrow(/haze changed/);
    } finally { ShaderChunk.fog_fragment = fog; }
  });
});
