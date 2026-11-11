/** The data package's cloud field and sun visibility rule (docs/PLUGINS.md). All values come from the package. */

/** One cloud layer: cells per grid side, its cell count, the cell spacing and base height (m), the jitter and the drift rate inputs. */
export interface SceneryCloudLayer {
  cells: number; instances: number; spacingM: number; heightM: number; jitter: number;
  /** The layer drifts by (wind m/s + windOffsetMs) / divisorM cells per second; the replay carries the drift itself. */
  drift: { windOffsetMs: number; divisorM: number };
}

/** How a cloud material is lit (the pipeline's docs/SCENE_PACKAGE.md "Clouds" states the formula). */
export interface SceneryCloudLight {
  uv: { scale: [number, number]; offset: [number, number] };
  /** The cloud's own colour runs from `min` to `max` with its lit density; `randomMin` and `randomMax` darken each by the cloud's random. */
  albedo: { max: [number, number, number]; min: [number, number, number]; randomMax: number; randomMin: number };
  ambient: { scalar: number; occlusion: number };
  /** Light scattered toward the eye when looking at the sun through the cloud, and the share of light every part gets. */
  backlight: { narrowScalar: number; narrowPower: number; wideScalar: number; widePower: number; base: number };
  /** The sun's weight under a clear and an overcast sky, and the scale on the light's depth component. */
  diffuse: { clear: number; overcast: number; depthScale: number };
}

export interface SceneryCloudMaterial {
  name: string;
  opacity: { scalar: number; visibility: number; randomRange: number };
  /** Key of the material's opacity map in `maps` and of its density map in `lightMaps`. */
  cloudMap: string;
  light: SceneryCloudLight;
  /** Keys of `lightMaps`: how lit the cloud is from the right, the left and the top (red, green, blue), and from the bottom, the back and the front. */
  sideMap: string; endMap: string;
}

export interface SceneryCloudType {
  /** The type's weight in the cloud coverage, 0 for a clear cell. */
  darkness: number;
  /** Keys of `meshes` for a side cell and a centre-line cell; null when the type draws nothing. */
  sideMesh: string | null; centreLineMesh: string | null;
  pushNearCentre: boolean;
  heightOffsetM: number;
  materials: SceneryCloudMaterial[];
}

/** A sheet model; `normals`, `tangents` and `binormals` are the unit vertex frame the light maps are read in. */
export interface SceneryCloudMesh { positions: number[]; uvs: number[]; normals: number[]; tangents: number[]; binormals: number[]; triangles: number[] }

/** The sky's cloud field: two layers of cloud sheets on a grid of cells around the eye; the replay gives each cell's code and the layer drifts. */
export interface SceneryClouds {
  layers: { lower: SceneryCloudLayer; upper: SceneryCloudLayer };
  /** Per cell: [phase offset, grid a, grid b, centre line 1/0]; the first `lowerCells` are the lower layer. */
  cells: [number, number, number, number][];
  lowerCells: number;
  /** Cell code (0–15) to a key of `types`. */
  codes: string[];
  types: Record<string, SceneryCloudType>;
  height: { perCellM: number; perCodeM: number };
  placement: {
    gridScale: number; endMargin: number; fadeGain: number; pushRadius: number; push: number; edgePitchRad: number; edgeDrop: number; riseDrop: number;
    centreLineYawRad: number; centreLinePitchRad: number; centreLineRollRad: number;
  };
  coverage: { falloff: number; approachPerS: number };
  /** alpha = saturate(gain·s)·map^lerp(powerFrom, powerTo, s)·scalar, s = visibility·fade·(1 − randomRange·red). */
  alpha: { gain: number; powerFrom: number; powerTo: number };
  /** Inputs the replay does not carry, as averages: every material of a type counts equally, the per-cloud values and the start age. */
  averagedInputs: { variant: 'mean'; red: number; green: number; jitter: number; startAgeCells: number };
  meshes: Record<string, SceneryCloudMesh>;
  /** Opacity maps: 8-bit row-major levels from `width` × `height` down, base64. */
  maps: Record<string, { width: number; height: number; mips: string[] }>;
  /** Maps that light a cloud: 8-bit row-major levels, `channels` values per texel (1 density, 3 a side or end map), base64. */
  lightMaps: Record<string, { width: number; height: number; channels: 1 | 3; mips: string[] }>;
}

/**
 * How clouds hide the sun: occlusion = curve(saturate((bias + Σ alpha) / resolution²))·lerp(dryMax, wetMax, rain) over a square view
 * of the clouds toward the sun; visibility = (1 − occlusion)·clamp((sun height − limit)·gain, 0, 1), 0 at or below the limit.
 */
export interface ScenerySunVisibility {
  occlusion: { bias: number; curve: 'sqrt'; dryMax: number; wetMax: number };
  view: { fovRad: number; near: number; far: number; resolution: number; refreshFrames: number; readFrame: number };
  horizon: { limit: number; gain: number };
}
