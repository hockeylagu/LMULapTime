import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CIRCUIT_SPECIFICATIONS } from '../../shared/domain/circuitDefinitions.js';
import { MANIFEST_FILE, PACKAGE_FILES, normalizeVehicleId, parseLogos, parseManifest, parseTrackCatalog, parseVehicleCatalog, trackLayoutPath } from '../../shared/packageContract/index.js';
import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';
import type { DataPluginStatus, VehicleDataRecord } from '../../shared/types/dataPlugin.js';
import { validateTrackPackage } from './trackPackage.js';
import { loadScenePackage, type SceneryStore } from './scenePackage.js';
import { loadBodyPackage, type BodyStore } from './bodyPackage.js';
import { loadRenderingPackage } from './renderingPackage.js';
import type { SceneryLayoutPayload } from '../../shared/types/scenes/scenery.js';
import type { BodyResource } from '../../shared/types/scenes/car.js';

/** Shared internal geometry is immutable at every nested array/object boundary. */
function freezeGeometry(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeGeometry(child);
  Object.freeze(value);
}

/** A fully validated startup snapshot of a schema 9 package. Scenery, body and cloud map files are served as is from `filesRoot()`. */
export class DataPlugin {
  public readonly status: DataPluginStatus;
  private readonly tracks = new Map<string, {geometry:TrackBoundaryGeometry}>();
  private readonly records: VehicleDataRecord[] = [];
  private readonly logoRecords = new Map<string, string>();
  private scenery: SceneryStore | null = null;
  private bodies: BodyStore | null = null;
  private root = '';
  public constructor(root?: string) {
    this.status = {state:root?'invalid':'absent',revision:'none',tracks:false,vehicles:false};
    if (!root) return;
    try {
      const base = fs.realpathSync(root), digest=createHash('sha256'); let bytes=0;
      this.root = base;
      const read = (relative: string, max=16_000_000): unknown => {
        if (path.isAbsolute(relative) || relative.includes('\\') || relative.includes(':') || relative.split('/').some(p=>!p||p==='.'||p==='..') || !relative.endsWith('.json')) throw Error('Invalid resource path');
        const file=fs.realpathSync(path.join(base,relative));
        const escaped=path.relative(base,file);
        if (escaped.startsWith('..') || path.isAbsolute(escaped)) throw Error('Escaping resource');
        const stat=fs.statSync(file); bytes+=stat.size;
        if (!stat.isFile() || stat.size>max || bytes>256_000_000) throw Error('Oversized resource');
        const buffer=fs.readFileSync(file); digest.update(relative).update(buffer); return JSON.parse(buffer.toString('utf8'));
      };
      const manifest=parseManifest(read(MANIFEST_FILE,64_000));
      const catalog=parseTrackCatalog(read(PACKAGE_FILES.tracks));
      for (const row of catalog) {
        const key=row.layoutKey, spec=CIRCUIT_SPECIFICATIONS[key];
        if (!spec) throw Error('Invalid layout identity');
        const raw=read(trackLayoutPath(key));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Expected object');
        const geometry=validateTrackPackage(raw as Record<string,unknown>,key);
        if (geometry.circuitId!==spec.circuitId || ![spec.layoutId, ({daytona_road_course:'road_course',portimao_wec:'wec',laguna_seca:'full'} as Record<string,string>)[key]].includes(geometry.layoutId) || row.circuitId!==spec.circuitId || row.layoutId!==geometry.layoutId) throw Error('Layout/catalog mismatch');
        freezeGeometry(geometry);
        this.tracks.set(key,{geometry});
      }
      const vehicleCatalog=parseVehicleCatalog(read(PACKAGE_FILES.vehicles));
      this.records.push(...vehicleCatalog.vehicles);
      this.bodies = loadBodyPackage(base, vehicleCatalog.bodies);
      for (const [k, v] of Object.entries(parseLogos(read(PACKAGE_FILES.logos)).logos)) this.logoRecords.set(k, v);
      const trackKeys=catalog.map(row=>row.layoutKey);
      const rendering=loadRenderingPackage(base, read(PACKAGE_FILES.rendering), trackKeys);
      this.scenery = loadScenePackage(base, read(PACKAGE_FILES.scenery, 32_000_000), rendering, key => this.trackGeometry(key));
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
   * They are pregenerated, content-named and published by folder swap, so they are served as is: no hash or change check (the cloud maps' hashes are
   * checked once at load, `loadRenderingPackage`).
   */
  public filesRoot(): string | null { return this.status.state === 'ready' ? this.root : null; }
  public body(identity: string): BodyResource | null {
    const row = this.bodies?.rows.get(normalizeVehicleId(identity));
    return row ? { ...structuredClone(row), packageRevision: this.status.revision } : null;
  }
  public track(key:string) {const row=this.tracks.get(key);return row?structuredClone(row):null;}
  public trackKeys(): string[] { return Array.from(this.tracks.keys()); }
  /** Internal immutable geometry view; API callers use the defensive track() snapshot. */
  public trackGeometry(key: string): TrackBoundaryGeometry | null { return this.tracks.get(key)?.geometry ?? null; }
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
