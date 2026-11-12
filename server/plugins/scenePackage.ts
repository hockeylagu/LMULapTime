import { expandSceneryCatalog, parseSceneryCatalog, type RenderingProfiles, type SceneryLayoutRow } from '../../shared/packageContract/index.js';
import type { SceneryCloudsFile } from '../../shared/types/scenes/clouds.js';
import type { SceneryLayoutOf } from '../../shared/types/scenes/scenery.js';
import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';
import { registerPackageFile, type PackageFile } from './packageFiles.js';

/** Validated scenery of a package: layouts by layout key, as the viewer receives them (cloud maps still files). */
export interface SceneryStore { layouts: Map<string, SceneryLayoutOf<SceneryCloudsFile>> }

const MAX_GLB_BYTES = 128_000_000, MAX_TEXTURE_BYTES = 64_000_000;

/**
 * A layout's sky: the rendering profile's sky with the layout's own sun grid and altitude in place of the per-layout maps. `parseRenderingIndex` has
 * checked that both maps have exactly the package's layouts as keys.
 */
function layoutSky(sky: RenderingProfiles['sky'], layoutKey: string): SceneryLayoutOf<SceneryCloudsFile>['sky'] {
  const { layouts, ...sun } = sky.sun, { layoutAltitudeM, ...hosek } = sky.hosek;
  return { ...sky, sun: { ...sun, grid: layouts[layoutKey] }, hosek: { ...hosek, altitudeM: layoutAltitudeM[layoutKey] } };
}

/**
 * Loads the scenery catalog (`scenery/index.json`, compact form) against the track geometry and the rendering profiles: every layout row is expanded
 * and given the catalog's shared chunking and streaming and the profiles. The layouts' chunks, textures and start files are registered at their derived
 * paths (existence and size); they are then served as is.
 */
export function loadScenePackage(root: string, catalog: unknown, rendering: RenderingProfiles, geometry: (key: string) => TrackBoundaryGeometry | null): SceneryStore {
  const parsed = parseSceneryCatalog(catalog), rows = expandSceneryCatalog(parsed) as unknown as SceneryLayoutRow[];
  const layouts = new Map<string, SceneryLayoutOf<SceneryCloudsFile>>(), files = new Map<string, PackageFile>();
  const register = (asset: string, hash: string, byteLength: number, max: number) => {
    const known = files.get(asset);
    if (known) {
      if (known.sha256 !== hash || known.byteLength !== byteLength) throw Error(`Conflicting scenery file ${asset}`);
      return;
    }
    files.set(asset, registerPackageFile(root, asset, hash, byteLength, max));
  };
  for (const row of rows) {
    const track = geometry(row.layoutKey);
    if (!track || track.geometryRevision !== row.sourceGeometryRevision) throw Error(`${row.layoutKey}: scenery does not match the track geometry`);
    for (const chunk of [row.horizon, ...row.sectors]) register(chunk.asset, chunk.sha256, chunk.byteLength, MAX_GLB_BYTES);
    for (const texture of row.textures) {
      register(texture.asset, texture.sha256, texture.byteLength, MAX_TEXTURE_BYTES);
      if (texture.start) register(texture.start.asset, texture.start.sha256, texture.start.byteLength, MAX_TEXTURE_BYTES);
    }
    layouts.set(row.layoutKey, { ...row, chunking: parsed.chunking, streaming: parsed.streaming, camera: rendering.camera, shading: rendering.shading, sky: layoutSky(rendering.sky, row.layoutKey) });
  }
  return { layouts };
}
