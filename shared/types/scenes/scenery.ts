/**
 * Scenery layout of package schema 12: the layout row of `scenery/index.json` expanded (asset paths rebuilt, chunk textures as paths) with the catalog's shared
 * chunking and streaming and the rendering profiles (camera, sky, shading) attached; the pipeline's docs/SCENE_PACKAGE.md is the authority.
 * The horizon chunk is always resident; sector chunks are loaded by lap distance around the replay car.
 */
import type { SceneryCamera, SceneryChunkingParameters, SceneryHorizonChunk, SceneryHosekSky as PackageHosekSky, SceneryLayoutRow, SceneryShading, ScenerySectorChunk,
  ScenerySky as PackageSky, SceneryStreaming, ScenerySun as PackageSun } from '../../packageContract/index.js';
import type { SceneryClouds, SceneryCloudsFile } from './clouds.js';

export type { SceneryBounds, SceneryCamera, SceneryCameraLook, SceneryCameraProfile, SceneryCameraType, SceneryCameraTypeProfile, SceneryChunkingParameters, SceneryConvolutionKernel,
  SceneryDaylight, SceneryFog, SceneryHorizonChunk, SceneryReflectionLod, ScenerySectorChunk, ScenerySessionDaylight, ScenerySessionId, SceneryShading, SceneryShadowCamera, SceneryShadows,
  ScenerySkyColourLook, ScenerySkyColourProfiles, ScenerySkyHaze, SceneryStreaming, SceneryTexture, SceneryToneCurve, TextureStart, Vec3 } from '../../packageContract/index.js';

export type SceneryChunk = SceneryHorizonChunk | ScenerySectorChunk;
/** What fetching a chunk file needs. */
export type SceneryChunkFile = Pick<SceneryChunk, 'id' | 'sha256' | 'byteLength'>;

/** The direct sun's radiance of a layout: the catalog's `layouts` map is narrowed to the layout's own `grid`. */
export type ScenerySun = Omit<PackageSun, 'layouts'> & {
  /** `grid[i][j]` is the RGB at `cloudCoverage[i]` and `sunElevationDeg[j]`, all positive. */
  grid: [number, number, number][][];
};

/** The Hosek-Wilkie sky of a layout: the package's `layoutAltitudeM` map is narrowed to the layout's own `altitudeM`. */
export type SceneryHosekSky = Omit<PackageHosekSky, 'layoutAltitudeM'> & {
  /** The layout's altitude, in metres. */
  altitudeM: number;
};

/** The analytic sky of a layout. `Clouds` is the package's file form on the wire and the decoded form in the viewer. */
export type ScenerySky<Clouds = SceneryClouds> = Omit<PackageSky, 'sun' | 'hosek' | 'clouds'> & { sun: ScenerySun; hosek: SceneryHosekSky; clouds: Clouds };

/** One layout: its expanded catalog row, the catalog's shared parameters and the rendering profiles of the package. */
export type SceneryLayoutOf<Clouds> = SceneryLayoutRow & {
  chunking: SceneryChunkingParameters;
  streaming: SceneryStreaming;
  camera: SceneryCamera;
  sky: ScenerySky<Clouds>;
  shading: SceneryShading;
};

/** The layout the viewer draws: cloud maps decoded. */
export type SceneryLayout = SceneryLayoutOf<SceneryClouds>;
/** The drivable surface's height from the layout's road height grid, by lookup; null where the grid has none (off its corridor). */
export type RoadHeightLookup = (x: number, z: number) => number | null;
/**
 * The layout as the 3D view uses it: its cloud maps and road height grid read, and its RealRoad point table (`realRoad`: entry p is the
 * surface element of venue point p, or `REALROAD_NONE`).
 */
export type SceneryLayoutResource = SceneryLayout & { packageRevision: string; roadHeightAt: RoadHeightLookup; realRoadTable: Uint32Array };

/** The layout JSON `/api/data-plugin/scenery/<layoutKey>` serves: the cloud maps are files (`CloudMapFile`) the client fetches. */
export type SceneryLayoutPayload = SceneryLayoutOf<SceneryCloudsFile> & { packageRevision: string };
