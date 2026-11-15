import { DataTexture, RedFormat, RGBAFormat, Vector3, type Mesh, type MeshStandardMaterial, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { cloudSheets, type CloudMoment } from '../../../../../src/components/replay/view3d/atmosphere/clouds.js';
import { createCloudLayer } from '../../../../../src/components/replay/view3d/atmosphere/cloudLayer.js';
import { isHazed } from '../../../../../src/components/replay/view3d/atmosphere/haze.js';
import { testClouds } from '../../../../helpers/scenes/sceneryProfiles.js';

const moment = (cells: string): CloudMoment => ({cells, upperDrift: 0, lowerDrift: 0, startUpperDrift: -10, startLowerDrift: -10});
const light = {sunDirection: new Vector3(0.6, 0.8, 0), sunGreen: 10, cloudCover: 0.25}, AT_ORIGIN = new Vector3();
const program = () => ({
  uniforms: {}, vertexShader: '#include <common>\n#include <fog_pars_vertex>\n#include <fog_vertex>',
  fragmentShader: '#include <common>\n#include <fog_pars_fragment>\n#include <opaque_fragment>\n#include <fog_fragment>',
});
const uniformsOf = (mesh: Mesh) => {
  const shader = program();
  (mesh.material as MeshStandardMaterial).onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, null as unknown as WebGLRenderer);
  return shader.uniforms as Record<string, {value: unknown}>;
};

describe('cloud layer', () => {
  it('draws one mesh per sheet, far to near from the camera, behind everything and blended over the sky', () => {
    const clouds = testClouds(), sheets = cloudSheets(clouds, moment('0fff0'), 0), layer = createCloudLayer(clouds, sheets, light, AT_ORIGIN);
    const meshes = layer.group.children as Mesh[];
    expect(meshes).toHaveLength(2);
    // The lower sheet (2000 m, over (-500, -500)) and the upper one (4000 m, over (500, 500)): from the origin the upper is the
    // farther one and is drawn first; from high over the upper one, the lower one is.
    expect(meshes.map(mesh => Math.round(mesh.position.y))).toEqual([2000, 4000]);
    expect(meshes[1].renderOrder).toBeLessThan(meshes[0].renderOrder); expect(meshes[0].renderOrder).toBeLessThan(0);
    layer.order(new Vector3(500, 3900, -500));
    expect(meshes[0].renderOrder).toBeLessThan(meshes[1].renderOrder); expect(meshes[1].renderOrder).toBeLessThan(0);
    const material = meshes[0].material as MeshStandardMaterial;
    expect(material.transparent).toBe(true); expect(material.depthWrite).toBe(false); expect(material.forceSinglePass).toBe(true); expect(meshes[0].frustumCulled).toBe(false);
    // Both sheets have the same cloud material: one material, one set of textures.
    expect(meshes[1].material).toBe(material);
    layer.dispose();
  });

  it('lays a sheet out in scene axes, fixed at the field\'s origin, keeping its frame in the field\'s own axes', () => {
    const clouds = testClouds(), [sheet] = cloudSheets(clouds, moment('0ffff'), 0), layer = createCloudLayer(clouds, [sheet], light, new Vector3(-100, 0, 300));
    const mesh = layer.group.children[0] as Mesh, {geometry} = mesh, position = geometry.getAttribute('position');
    // The sheet's centre (-500, 2000, -500) in scene axes, from the field's origin; its vertices around it.
    expect(new Vector3().setFromMatrixPosition(mesh.matrixWorld).toArray().map(v => +v.toFixed(6))).toEqual([-600, 2000, 800]);
    const [cx, cy, cz] = sheet.centre;
    for (let v = 0; v < 4; v++) expect([position.getX(v), position.getY(v), position.getZ(v)]).toEqual([sheet.vertices[v * 3] - cx, sheet.vertices[v * 3 + 1] - cy, cz - sheet.vertices[v * 3 + 2]].map(Math.fround));
    expect(Array.from(geometry.getAttribute('cloudTangent').array.subarray(0, 3))).toEqual(Array.from(sheet.frame.subarray(0, 3)));
    expect(Array.from(geometry.getAttribute('cloudBinormal').array.subarray(0, 3))).toEqual(Array.from(sheet.frame.subarray(3, 6)));
    expect(Array.from(geometry.getAttribute('cloudNormal').array.subarray(0, 3))).toEqual(Array.from(sheet.frame.subarray(6, 9)));
    expect([...geometry.getAttribute('cloudFade').array]).toEqual([1, 1, 1, 1]);
    expect(geometry.getIndex()?.count).toBe(6);
  });

  it('stays where it is: nothing in it moves with the camera', () => {
    const clouds = testClouds(), layer = createCloudLayer(clouds, cloudSheets(clouds, moment('0fff0'), 0), light, AT_ORIGIN);
    layer.group.traverse(object => { expect(object.matrixAutoUpdate).toBe(false); });
    expect(layer.group.position.toArray()).toEqual([0, 0, 0]);
  });

  it('lights a material by the package: the sun weighted for the cover, toward the sun in the field\'s axes', () => {
    const clouds = testClouds(), layer = createCloudLayer(clouds, cloudSheets(clouds, moment('0ffff'), 0), light, AT_ORIGIN), uniforms = uniformsOf(layer.group.children[0] as Mesh);
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
    const shader = program(), clouds = testClouds(), layer = createCloudLayer(clouds, cloudSheets(clouds, moment('0fff0'), 0), light, AT_ORIGIN);
    const material = (layer.group.children[0] as Mesh).material as MeshStandardMaterial;
    material.onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, null as unknown as WebGLRenderer);
    layer.dispose();
    expect(isHazed(material)).toBe(true);
    expect(shader.vertexShader).toContain('gl_Position.z = gl_Position.w;');
    expect(shader.vertexShader).toContain('( modelMatrix * vec4( transformed, 1.0 ) ).xyz - cameraPosition;');
    expect(shader.fragmentShader.indexOf('outgoingLight = (')).toBeLessThan(shader.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(shader.fragmentShader).toContain('exp( - 0.5 * fogDensity * vFogDepth )');
    expect(shader.fragmentShader).not.toContain('#include <fog_fragment>');
  });
});
