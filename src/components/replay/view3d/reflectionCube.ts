import { BufferGeometry, DataTexture, Float32BufferAttribute, FloatType, GLSL3, LinearFilter, LinearMipmapLinearFilter, Mesh, NearestFilter, OrthographicCamera, RawShaderMaterial, RGBAFormat, Scene, WebGLCubeRenderTarget, type Texture, type WebGLRenderer } from 'three';
import type { SceneryConvolutionKernel } from '../../../../shared/types/scenes/scenery.js';

/**
 * A reflection cube as the package's shading reads it (the pipeline's docs/SCENE_PACKAGE.md "Shading"): the sharp cube, and the
 * convolved cube built from it, one package kernel per mip from mip 0. Mip i of the convolved cube is the equal-weight mean of the
 * sharp cube read at the kernel's source LOD along each of its sample directions, turned from the kernel's frame into the frame
 * (t, d, t × d) of the texel's direction d, with t = normalize((0, 1, 0) × d).
 */
export interface ReflectionCubes {
  /** The sharp cube (the source, with its mips). */
  sharp: Texture;
  /** The convolved cube: `levels` mips, mip i made by kernel i. */
  convolved: Texture;
  /** The render target that holds the convolved cube. */
  target: WebGLCubeRenderTarget;
  levels: number;
  dispose(): void;
  /** The convolution pass, kept so a later capture into these cubes links no program and uploads no kernel. */
  pass: ConvolutionPass;
}

/** The full-screen pass that convolves one cube: its material, quad and one sample texture per kernel. */
interface ConvolutionPass { material: RawShaderMaterial; scene: Scene; camera: OrthographicCamera; samples: DataTexture[]; dispose(): void }

/** A kernel's sample directions as a float texture, one texel per sample (xyz). */
function sampleTexture(kernel: SceneryConvolutionKernel): DataTexture {
  const data = new Float32Array(kernel.samples.length * 4);
  kernel.samples.forEach(([x, y, z], i) => data.set([x, y, z, 0], i * 4));
  const texture = new DataTexture(data, kernel.samples.length, 1, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter; texture.needsUpdate = true;
  return texture;
}

const VERTEX = `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAGMENT = `
precision highp float;
uniform samplerCube source; uniform highp sampler2D samples;
uniform int face, count; uniform float size, sourceLod;
out vec4 colour;
// The GL cube face direction of a texel at s, t in [0, 1] (row 0 at t = 0).
vec3 faceDirection(int f, float s, float t) {
  float u = 2.0 * s - 1.0, v = 2.0 * t - 1.0;
  if (f == 0) return vec3(1.0, -v, -u);
  if (f == 1) return vec3(-1.0, -v, u);
  if (f == 2) return vec3(u, 1.0, v);
  if (f == 3) return vec3(u, -1.0, -v);
  if (f == 4) return vec3(u, -v, 1.0);
  return vec3(-u, -v, -1.0);
}
void main() {
  vec3 d = normalize(faceDirection(face, gl_FragCoord.x / size, gl_FragCoord.y / size));
  vec3 t = cross(vec3(0.0, 1.0, 0.0), d);
  t = dot(t, t) > 1e-12 ? normalize(t) : vec3(1.0, 0.0, 0.0);
  vec3 b = cross(t, d), sum = vec3(0.0);
  for (int i = 0; i < count; i++) {
    vec3 k = texelFetch(samples, ivec2(i, 0), 0).xyz;
    sum += textureLod(source, k.x * t + k.y * d + k.z * b, sourceLod).rgb;
  }
  colour = vec4(sum / float(count), 1.0);
}`;

function convolutionPass(kernels: readonly SceneryConvolutionKernel[]): ConvolutionPass {
  const material = new RawShaderMaterial({
    glslVersion: GLSL3, vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false,
    uniforms: {source: {value: null}, samples: {value: null}, face: {value: 0}, count: {value: 0}, size: {value: 0}, sourceLod: {value: 0}},
  });
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const scene = new Scene(), camera = new OrthographicCamera(), quad = new Mesh(geometry, material), samples = kernels.map(sampleTexture);
  quad.frustumCulled = false; scene.add(quad);
  return {material, scene, camera, samples, dispose: () => { material.dispose(); geometry.dispose(); for (const texture of samples) texture.dispose(); }};
}

/**
 * Convolves a cube render target (any size; its texture must keep mips, as the kernels read it at their source LOD) with the
 * package's kernels into a new cube of the same size and type, or into `into` (an earlier result for a source of the same size, type
 * and kernels), which it returns, reusing its convolution pass. Runs once per source capture, outside the frame.
 */
export function convolveReflection(renderer: WebGLRenderer, source: WebGLCubeRenderTarget, kernels: readonly SceneryConvolutionKernel[], into?: ReflectionCubes): ReflectionCubes {
  const size = source.width, levels = kernels.length;
  if (!source.texture.generateMipmaps) throw Error('The reflection source cube must keep its mips');
  if (size >> (levels - 1) < 1) throw Error(`A ${size} px cube has no mip ${levels - 1} for the convolution`);
  if (into && (into.target.width !== size || into.levels !== levels || into.target.texture.type !== source.texture.type)) throw Error('The reflection cubes to reuse differ in size, type or kernels');
  // Mip storage comes with generateMipmaps; three regenerates the chain only after a mip 0 render, so every mip 0 face is drawn first.
  const target = into?.target ?? new WebGLCubeRenderTarget(size, {type: source.texture.type, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter});
  const pass = into?.pass ?? convolutionPass(kernels), {material, scene, camera} = pass;
  material.uniforms.source.value = source.texture;
  const previous = {target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), level: renderer.getActiveMipmapLevel(), autoClear: renderer.autoClear};
  try {
    renderer.autoClear = false;
    kernels.forEach((kernel, level) => {
      const u = material.uniforms;
      u.samples.value = pass.samples[level]; u.count.value = kernel.samples.length; u.size.value = size >> level; u.sourceLod.value = kernel.sourceLod;
      for (let face = 0; face < 6; face++) {
        u.face.value = face;
        renderer.setRenderTarget(target, face, level);
        renderer.render(scene, camera);
      }
    });
  } finally {
    renderer.setRenderTarget(previous.target, previous.face, previous.level); renderer.autoClear = previous.autoClear;
  }
  // Only the kernels' mips are defined: reads stop at the last one.
  target.texture.generateMipmaps = false;
  if (into) { into.sharp = source.texture; return into; }
  return {sharp: source.texture, convolved: target.texture, target, levels, pass, dispose: () => { target.dispose(); pass.dispose(); }};
}
