import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CIRCUIT_SPECIFICATIONS } from '../../shared/domain/circuitDefinitions.js';
import { MANIFEST_FILE, PACKAGE_FILES, normalizeVehicleId, parseLogos, parseManifest, parseRenderingIndex, parseTrackCatalog, parseVehicleCatalog, trackLayoutPath, type TrackCatalogRow } from '../../shared/packageContract/index.js';
import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';
import type { DataPluginStatus, VehicleDataRecord } from '../../shared/types/dataPlugin.js';
import { loadScenePackage, type SceneryStore } from './scenePackage.js';
import { loadBodyPackage, type BodyStore } from './bodyPackage.js';
import type { SceneryLayoutPayload } from '../../shared/types/scenes/scenery.js';
import type { BodyResource } from '../../shared/types/scenes/car.js';

/** Layouts whose package layout id differs from the circuit definition's. */
const LAYOUT_ID_ALIASES: Record<string, string> = {daytona_road_course:'road_course',portimao_wec:'wec',laguna_seca:'full'};

/** A package JSON file, contained in the package folder (a junction cannot point outside it) and at most `max` bytes. */
function readPackageJson(base: string, relative: string, max: number): Buffer {
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.includes(':') || relative.split('/').some(p=>!p||p==='.'||p==='..') || !relative.endsWith('.json')) throw Error('Invalid resource path');
  const file=fs.realpathSync(path.join(base,relative));
  const escaped=path.relative(base,file);
  if (escaped.startsWith('..') || path.isAbsolute(escaped)) throw Error('Escaping resource');
  const stat=fs.statSync(file);
  if (!stat.isFile() || stat.size>max) throw Error('Oversized resource');
  return fs.readFileSync(file);
}

/**
 * A schema 12 package, checked by the pipeline before it publishes (`npm run package -- validate`): startup parses the manifest and catalogs, and each
 * track file is read the first time it is asked for (parsing all 32 cost about 0.3 s before the server could listen). Scenery, body and cloud map
 * files are served as is from `filesRoot()`.
 */
export class DataPlugin {
  public readonly status: DataPluginStatus;
  /** By layout key: the catalog row, and the geometry once read (null when its file could not be read or names another layout). */
  private readonly tracks = new Map<string, {row:TrackCatalogRow; geometry?:TrackBoundaryGeometry|null}>();
  private readonly records: VehicleDataRecord[] = [];
  private readonly logoRecords = new Map<string, string>();
  private scenery: SceneryStore | null = null;
  private bodies: BodyStore | null = null;
  private root = '';
  public constructor(root?: string) {
    this.status = {state:root?'invalid':'absent',revision:'none',tracks:false,vehicles:false};
    if (!root) return;
    try {
      const base = fs.realpathSync(root), digest=createHash('sha256');
      this.root = base;
      // The revision covers the manifest and catalogs; a geometry change shows in the scenery catalog (`sourceGeometryRevision`).
      const read = (relative: string, max=16_000_000): unknown => {
        const buffer=readPackageJson(base,relative,max); digest.update(relative).update(buffer); return JSON.parse(buffer.toString('utf8'));
      };
      const manifest=parseManifest(read(MANIFEST_FILE,64_000));
      const catalog=parseTrackCatalog(read(PACKAGE_FILES.tracks));
      for (const row of catalog) {
        const spec=CIRCUIT_SPECIFICATIONS[row.layoutKey];
        if (!spec || row.circuitId!==spec.circuitId || ![spec.layoutId, LAYOUT_ID_ALIASES[row.layoutKey]].includes(row.layoutId)) throw Error('Layout/catalog mismatch');
        this.tracks.set(row.layoutKey,{row});
      }
      const vehicleCatalog=parseVehicleCatalog(read(PACKAGE_FILES.vehicles));
      this.records.push(...vehicleCatalog.vehicles);
      this.bodies = loadBodyPackage(vehicleCatalog.bodies);
      for (const [k, v] of Object.entries(parseLogos(read(PACKAGE_FILES.logos)).logos)) this.logoRecords.set(k, v);
      const trackKeys=catalog.map(row=>row.layoutKey);
      const rendering=parseRenderingIndex(read(PACKAGE_FILES.rendering), {layoutKeys: trackKeys});
      this.scenery = loadScenePackage(read(PACKAGE_FILES.scenery, 32_000_000), rendering);
      // Every track has current scenery (docs/PACKAGE_FORMAT.md, Manifest).
      if ([...this.scenery.layouts.keys()].join() !== trackKeys.join()) throw Error('Scenery layouts differ from the track layouts');
      this.status = {
        state: 'ready',
        revision: digest.digest('hex'),
        packageId: manifest.id,
        packageVersion: manifest.version,
        tracks: true,
        vehicles: true,
        ...(this.logoRecords.size > 0 ? { logos: true } : {}),
        scenery: true,
        bodies: true,
        counts: {
          tracks: this.tracks.size,
          vehicles: this.records.length,
          ...(this.logoRecords.size > 0 ? { logos: this.logoRecords.size } : {}),
          scenery: this.scenery.layouts.size,
          bodies: this.bodies.folders.size,
        },
      };
    } catch {this.tracks.clear(); this.records.length=0; this.logoRecords.clear(); this.scenery = null; this.bodies = null; /* Generic status never discloses local paths. */}
  }
  /** The layout index of a layout's scenery; chunk and texture bytes come from the files route, the cloud map bytes from the `rendering/` files. */
  public sceneryLayout(key: string): SceneryLayoutPayload | null {
    const layout = this.scenery?.layouts.get(key);
    return layout ? { ...structuredClone(layout), packageRevision: this.status.revision } : null;
  }
  /**
   * The package folder that scenery (`scenery/`), vehicle body (`vehicles/`) and cloud map (`rendering/`) files are served from, or null without a valid package.
   * They are pregenerated, content-named and published by folder swap, so they are served as is: no hash or change check.
   */
  public filesRoot(): string | null { return this.status.state === 'ready' ? this.root : null; }
  public body(identity: string): BodyResource | null {
    const row = this.bodies?.rows.get(normalizeVehicleId(identity));
    return row ? { ...structuredClone(row), packageRevision: this.status.revision } : null;
  }
  public track(key:string) {const geometry=this.trackGeometry(key);return geometry?{geometry:structuredClone(geometry)}:null;}
  public trackKeys(): string[] { return Array.from(this.tracks.keys()); }
  /**
   * The shared geometry, read only by convention (not frozen: freezing every point cost a quarter second at startup); API callers get the track() copy.
   * Read on first use and kept; a file that cannot be read or names another layout leaves the layout without geometry.
   */
  public trackGeometry(key: string): TrackBoundaryGeometry | null {
    const entry=this.tracks.get(key);
    if (!entry) return null;
    if (entry.geometry===undefined) {
      try {
        const geometry=JSON.parse(readPackageJson(this.root,trackLayoutPath(key),16_000_000).toString('utf8')) as TrackBoundaryGeometry;
        const {row}=entry;
        entry.geometry=geometry.layoutKey===key && geometry.circuitId===row.circuitId && geometry.layoutId===row.layoutId ? geometry : null;
      } catch { entry.geometry=null; }
      if (!entry.geometry) console.warn(`[Data Plugin] Track file unreadable or not ${key}; the layout has no geometry.`);
    }
    return entry.geometry;
  }
  public vehicles(): VehicleDataRecord[] {return structuredClone(this.records);}
  public logos(): Record<string, string> {return Object.fromEntries(this.logoRecords);}
  public logo(brand: string): string|null {return this.logoRecords.get(brand) ?? null;}
  public vehicle(identity: {vehicleId?:string;carType?:string;carClass?:string}): VehicleDataRecord|null {
    const alias=identity.vehicleId?.trim().replace(/\.veh$/i,'').toUpperCase();
    if (alias) {const match=this.records.find(r=>r.vehicleIds.includes(alias));if(match)return structuredClone(match);}
    const matches=this.records.filter(r=>r.model===identity.carType && (!identity.carClass || r.carClass===identity.carClass));
    return matches.length===1?structuredClone(matches[0]):null;
  }
  /**
   * The deployment kW list of a model and class. Variants of one model (the Peugeot 9x8's two generations) may share
   * it: the list counts when every matching record has the same one, unlike `vehicle()`, which needs a single record.
   */
  public deploymentKw(identity: {carType:string;carClass:string}): number[]|null {
    const lists=this.records.filter(r=>r.model===identity.carType&&r.carClass===identity.carClass).map(r=>JSON.stringify(r.deploymentKw??null));
    return new Set(lists).size===1&&lists[0]!=='null'?JSON.parse(lists[0]) as number[]:null;
  }
}

export function formatPluginStatusLog(status: DataPluginStatus): string {
  if (status.state === 'ready') {
    const counts = status.counts;
    const trackDetail = !status.tracks
      ? 'tracks: no'
      : counts?.tracks !== undefined
        ? `tracks: ${counts.tracks}`
        : 'tracks: yes';
    const vehicleDetail = !status.vehicles
      ? 'vehicles: no'
      : counts?.vehicles !== undefined
        ? `vehicles: ${counts.vehicles}`
        : 'vehicles: yes';
    const details = [
      trackDetail,
      vehicleDetail,
      ...(status.logos ? [`logos: ${counts?.logos !== undefined ? counts.logos : 'yes'}`] : []),
      ...(status.scenery ? [`scenery: ${counts?.scenery !== undefined ? counts.scenery : 'yes'}`] : []),
      ...(status.bodies ? [`bodies: ${counts?.bodies !== undefined ? counts.bodies : 'yes'}`] : []),
      `revision: ${status.revision.slice(0, 8)}`,
    ].join(', ');
    return `[Data Plugin] Plugins loaded: yes (${details})`;
  }
  if (status.state === 'invalid') {
    return '[Data Plugin] Plugins loaded: no (package at LMU_PLUGIN_ROOT is invalid)';
  }
  return '[Data Plugin] Plugins loaded: no (LMU_PLUGIN_ROOT not configured)';
}

export const dataPlugin = new DataPlugin(process.env.LMU_PLUGIN_ROOT);
