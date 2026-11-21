import { expandSceneryCatalog, parseSceneryCatalog, type RenderingProfiles, type SceneryLayoutRow } from '../../shared/packageContract/index.js';
import type { SceneryCloudsFile } from '../../shared/types/scenes/clouds.js';
import type { SceneryLayoutOf } from '../../shared/types/scenes/scenery.js';

/** Validated scenery of a package: layouts by layout key, as the viewer receives them (cloud maps still files). */
export interface SceneryStore { layouts: Map<string, SceneryLayoutOf<SceneryCloudsFile>> }

/**
 * A layout's sky: the rendering profile's sky with the layout's own sun grid and altitude in place of the per-layout maps. `parseRenderingIndex` has
 * checked that both maps have exactly the package's layouts as keys.
 */
function layoutSky(sky: RenderingProfiles['sky'], layoutKey: string): SceneryLayoutOf<SceneryCloudsFile>['sky'] {
  const { layouts, ...sun } = sky.sun, { layoutAltitudeM, ...hosek } = sky.hosek;
  return { ...sky, sun: { ...sun, grid: layouts[layoutKey] }, hosek: { ...hosek, altitudeM: layoutAltitudeM[layoutKey] } };
}

/**
 * Loads the scenery catalog (`scenery/index.json`, compact form) with the rendering profiles: every layout row is expanded and given the catalog's
 * shared chunking and streaming and the profiles. The layouts' chunks, textures and start files are pregenerated and served as is: startup does not
 * touch them (checking ~16,500 files cost over 9 s before the server could listen). That each layout's scenery follows the current track geometry is
 * the pipeline's check before it publishes.
 */
export function loadScenePackage(catalog: unknown, rendering: RenderingProfiles): SceneryStore {
  const parsed = parseSceneryCatalog(catalog), rows = expandSceneryCatalog(parsed) as unknown as SceneryLayoutRow[];
  const layouts = new Map<string, SceneryLayoutOf<SceneryCloudsFile>>();
  for (const row of rows) {
    layouts.set(row.layoutKey, { ...row, chunking: parsed.chunking, streaming: parsed.streaming, camera: rendering.camera, shading: rendering.shading, sky: layoutSky(rendering.sky, row.layoutKey) });
  }
  return { layouts };
}
