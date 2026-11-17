import { descriptorTexturePath, normalizeVehicleId } from '../../../shared/packageContract/index.js';
import type { BodyDescriptor, BodyResource, CarAppearance } from '../../../shared/types/scenes/car.js';
import { fetchBinary, fetchJson } from '../apiClient.js';

/** Content-named body files of the package's `vehicles/` folder: the GLB at `<sha256>.glb`, the descriptor at `bodies/<folder>.json`, textures at `textures/<sha256>.ktx2.zst`. */
export const VEHICLE_FILES = '/api/data-plugin/vehicles/files/';

export interface LoadedBody {
  resource: BodyResource;
  /**
   * Reads the body's exterior GLB (every distance level), for the parse only: the parsed model is what stays, so nothing holds the
   * bytes after it. The files are named by their content, so every call returns the same bytes.
   */
  file(): Promise<ArrayBuffer>;
  /** Reads the body's interior GLB (the parts only the driver cameras draw), for the parse only; null for a body without one. */
  interiorFile(): Promise<ArrayBuffer | null>;
  /** Reads the body's far model GLB (the exterior from `resource.far.fromM` metres on, merged by role), for the parse only. */
  farFile(): Promise<ArrayBuffer>;
  descriptor: BodyDescriptor;
  /** The body's cabin volumes by their descriptor path (`volumes/<sha256>.bin`), for the cockpit reflection occlusion. */
  volumes: Map<string, ArrayBuffer>;
  /** The lap's installed VEH id, selecting the appearance (livery) of the shared model. */
  vehicleId: string;
}

/** The appearance (livery) the body's VEH id selects; undefined when the body has none for it. */
export function appearanceOf(body: LoadedBody): CarAppearance | undefined {
  const key = normalizeVehicleId(body.vehicleId);
  return body.descriptor.appearances.find(row => normalizeVehicleId(row.alias) === key);
}

/**
 * The start file of the body's texture at `path` (`textures/<sha256>.ktx2.zst`) and how many of the texture's largest levels it
 * leaves out (the row states both level counts); undefined for a texture without one.
 */
export function startFileOf(body: LoadedBody, path: string): {path: string; skip: number} | undefined {
  const row = body.resource.textures.find(each => descriptorTexturePath(each.sha256) === path);
  return row?.start && row.levels !== undefined ? {path: descriptorTexturePath(row.start.sha256), skip: row.levels - row.start.levels} : undefined;
}

/** What every livery of a body reads alike (its descriptor and cabin volumes), by folder and package revision (`fetchBody`). */
export type BodyFolders = Map<string, Promise<Pick<LoadedBody, 'descriptor' | 'volumes'>>>;

/**
 * The 3D body serving a VEH id. A vehicle without one is an error: the package covers every catalogued vehicle. The liveries of a
 * body share its descriptor and volumes through `folders`: fetched once for them all (a race fetches every livery of the field).
 */
export async function fetchBody(vehicleId: string, packageRevision: string | undefined, signal: AbortSignal, folders: BodyFolders = new Map()): Promise<LoadedBody> {
  const resource = await fetchJson<BodyResource>(`/api/data-plugin/vehicles/${encodeURIComponent(vehicleId)}/body`, { signal });
  if (packageRevision && resource.packageRevision !== packageRevision) throw Error('Body package revision differs from the selected lap');
  const {interior} = resource;
  const file = (path: string) => fetchBinary(`${VEHICLE_FILES}${path}`, { signal, cache: 'default' });
  const glb = async (row: {sha256: string; byteLength: number}) => {
    const bytes = await file(`${row.sha256}.glb`);
    if (bytes.byteLength !== row.byteLength) throw Error('Incomplete 3D body');
    return bytes;
  };
  const key = `${resource.folder}:${resource.packageRevision}`;
  let shared = folders.get(key);
  if (!shared) {
    const own = (async () => {
      const [descriptor, volumes] = await Promise.all([
        fetchJson<BodyDescriptor>(`${VEHICLE_FILES}bodies/${resource.folder}.json`, { signal }),
        Promise.all(resource.volumes.map(async row => {
          const volume = await file(`volumes/${row.sha256}.bin`);
          if (volume.byteLength !== row.byteLength) throw Error('Incomplete 3D body');
          return [`volumes/${row.sha256}.bin`, volume] as const;
        })),
      ]);
      return {descriptor, volumes: new Map(volumes)};
    })();
    // A failed fetch is forgotten: the next livery tries again.
    own.catch(() => { if (folders.get(key) === own) folders.delete(key); });
    folders.set(key, own); shared = own;
  }
  const {descriptor, volumes} = await shared;
  return {
    resource, file: () => glb(resource), interiorFile: async () => (interior ? glb(interior) : null),
    farFile: () => glb(resource.far), descriptor, volumes, vehicleId,
  };
}
