import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CIRCUIT_SPECIFICATIONS } from '../../shared/domain/circuitSpecs.js';
import { parseTrackMapDisplay } from '../../shared/domain/trackGeometry.js';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../shared/types/trackGeometry.js';
import type { DataPluginStatus, VehicleDataRecord } from '../../shared/types/dataPlugin.js';
import { validateTrackPackage } from './trackPackage.js';
import { setVehicleCatalog } from '../../shared/domain/vehicleMapping.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw Error('Unsupported field');
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw Error('Invalid identity');
  return value;
}
function pair(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10)) throw Error('Invalid local coordinate');
  return [value[0], value[1]];
}
export function parseVehicleCatalog(value: unknown): VehicleDataRecord[] {
  const catalog = object(value);
  keys(catalog, ['schemaVersion', 'coordinates', 'vehicles']);
  if (catalog.schemaVersion !== 1 || catalog.coordinates !== 'local-xz-metres-forward-minus-z' || !Array.isArray(catalog.vehicles) || catalog.vehicles.length > 2000) throw Error('Invalid vehicle catalog');
  const aliases = new Set<string>(), ids = new Set<string>();
  return catalog.vehicles.map(item => {
    const row = object(item);
    keys(row, ['id', 'model', 'carClass', 'vehicleIds', 'dimensions', 'outlineXZ', 'replayOriginOffsetXZ']);
    const id = text(row.id), model = text(row.model), carClass = text(row.carClass);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id) || !Array.isArray(row.vehicleIds) || row.vehicleIds.length > 5000) throw Error('Invalid vehicle record');
    ids.add(id);
    const vehicleIds = row.vehicleIds.map(alias => {
      const normalized = text(alias).replace(/\.veh$/i, '').toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(normalized) || aliases.has(normalized)) throw Error('Conflicting vehicle alias');
      aliases.add(normalized); return normalized;
    });
    const result: VehicleDataRecord = {id, model, carClass, vehicleIds};
    if (row.dimensions !== undefined) {
      const d = object(row.dimensions); keys(d, ['lengthM', 'widthM', 'heightM']);
      if (typeof d.lengthM !== 'number' || d.lengthM < 3 || d.lengthM > 7 || typeof d.widthM !== 'number' || d.widthM < 1 || d.widthM > 3 || (d.heightM !== undefined && (typeof d.heightM !== 'number' || !Number.isFinite(d.heightM) || d.heightM < .3 || d.heightM > 3)) || !Number.isFinite(d.lengthM) || !Number.isFinite(d.widthM)) throw Error('Invalid dimensions');
      result.dimensions = {lengthM:d.lengthM, widthM:d.widthM, ...(d.heightM !== undefined ? {heightM:d.heightM as number} : {})};
    }
    if (row.replayOriginOffsetXZ !== undefined) result.replayOriginOffsetXZ = pair(row.replayOriginOffsetXZ);
    if (row.outlineXZ !== undefined) {
      if (!result.dimensions || !Array.isArray(row.outlineXZ) || row.outlineXZ.length < 3 || row.outlineXZ.length > 256) throw Error('Invalid outline');
      const outline = row.outlineXZ.map(pair);
      if (outline.length > 3 && outline[0][0] === outline[outline.length-1][0] && outline[0][1] === outline[outline.length-1][1]) outline.pop();
      const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]);
      if (Math.abs(Math.max(...xs)-Math.min(...xs)-result.dimensions.widthM) > .02 || Math.abs(Math.max(...zs)-Math.min(...zs)-result.dimensions.lengthM) > .02) throw Error('Outline dimensions disagree');
      let sign = 0;
      // Version 1 accepts convex collision envelopes, preventing crossing/degenerate polygons.
      for (let i=0;i<outline.length;i++) {
        const a=outline[i], b=outline[(i+1)%outline.length], c=outline[(i+2)%outline.length];
        const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
        if (Math.abs(cross)>1e-8) {if (sign && Math.sign(cross)!==sign) throw Error('Outline must be convex'); sign=Math.sign(cross);}
      }
      if (!sign || new Set(outline.map(p=>p.join(','))).size !== outline.length) throw Error('Degenerate outline');
      for (let i=0;i<outline.length;i++) {
        const a=outline[i], b=outline[(i+1)%outline.length];
        for (const c of outline) {
          const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
          if (Math.abs(cross)>1e-8 && Math.sign(cross)!==sign) throw Error('Crossing outline');
        }
      }
      result.outlineXZ = outline;
    }
    return result;
  });
}

/** A fully validated startup snapshot. Package files are never served directly. */
export class DataPlugin {
  public readonly status: DataPluginStatus;
  private readonly tracks = new Map<string, {geometry:TrackBoundaryGeometry; display:TrackMapDisplay|null}>();
  private readonly records: VehicleDataRecord[] = [];
  public constructor(root?: string) {
    this.status = {state:root?'invalid':'absent',revision:'none',tracks:false,vehicles:false};
    if (!root) return;
    try {
      const base = fs.realpathSync(root), digest=createHash('sha256'); let bytes=0;
      const read = (relative: string, max=16_000_000): unknown => {
        if (path.isAbsolute(relative) || relative.includes('\\') || relative.includes(':') || relative.split('/').some(p=>!p||p==='.'||p==='..') || !relative.endsWith('.json')) throw Error('Invalid resource path');
        const file=fs.realpathSync(path.join(base,relative));
        const escaped=path.relative(base,file);
        if (escaped.startsWith('..') || path.isAbsolute(escaped)) throw Error('Escaping resource');
        const stat=fs.statSync(file); bytes+=stat.size;
        if (!stat.isFile() || stat.size>max || bytes>256_000_000) throw Error('Oversized resource');
        const buffer=fs.readFileSync(file); digest.update(relative).update(buffer); return JSON.parse(buffer.toString('utf8'));
      };
      const manifest=object(read('manifest.json',64_000));
      keys(manifest,['schemaVersion','id','version','tracks','vehicles']);
      if (manifest.schemaVersion!==1) throw Error('Unsupported schema');
      text(manifest.id); text(manifest.version);
      for (const capability of ['tracks','vehicles']) if (manifest[capability] !== undefined) object(manifest[capability]);
      if (!manifest.tracks && !manifest.vehicles) throw Error('Empty package');
      if (manifest.tracks) {
        const resource=object(manifest.tracks); keys(resource,['catalog']);
        const catalogPath=text(resource.catalog), catalog=read(catalogPath);
        if (!Array.isArray(catalog) || !catalog.length || catalog.length>100) throw Error('Invalid track catalog');
        for (const entry of catalog) {
          const row=object(entry), key=text(row.layoutKey);
          if (!/^[a-z0-9_]+$/.test(key) || !CIRCUIT_SPECIFICATIONS[key] || this.tracks.has(key)) throw Error('Invalid layout identity');
          const raw=object(read(path.posix.join(path.posix.dirname(catalogPath), key+'.json')));
          const geometry=validateTrackPackage(raw,key), spec=CIRCUIT_SPECIFICATIONS[key];
          if (geometry.circuitId!==spec.circuitId || ![spec.layoutId, ({daytona_road_course:'road_course',portimao_wec:'wec',laguna_seca:'full'} as Record<string,string>)[key]].includes(geometry.layoutId!) || row.circuitId!==spec.circuitId || row.layoutId!==geometry.layoutId || row.lengthM!==geometry.lengthM || row.pointsCount!==geometry.centerline.length || !geometry.geometryRevision || !geometry.projectionRevision) throw Error('Layout/catalog mismatch');
          let display: TrackMapDisplay|null=null;
          const displayPath=`tracks-display/${key}.json`;
          if (fs.existsSync(path.join(base,displayPath))) {const sidecar=object(read(displayPath));keys(sidecar,['layoutKey','surfaces','brakeMarkers','sourceRevision']);display=parseTrackMapDisplay(sidecar,key,geometry.geometryRevision);}
          this.tracks.set(key,{geometry,display});
        }
      }
      if (manifest.vehicles) {const resource=object(manifest.vehicles); keys(resource,['catalog']); this.records.push(...parseVehicleCatalog(read(text(resource.catalog))));}
      this.status={state:'ready',revision:digest.digest('hex'),tracks:!!manifest.tracks,vehicles:!!manifest.vehicles};
    } catch {this.tracks.clear(); this.records.length=0; /* Generic status never discloses local paths. */}
  }
  public track(key:string) {const row=this.tracks.get(key);return row?structuredClone(row):null;}
  public vehicles(): VehicleDataRecord[] {return structuredClone(this.records);}
  public vehicle(identity: {vehicleId?:string;carModel?:string;carClass?:string}): VehicleDataRecord|null {
    const alias=identity.vehicleId?.trim().replace(/\.veh$/i,'').toUpperCase();
    if (alias) {const match=this.records.find(r=>r.vehicleIds.includes(alias));if(match)return structuredClone(match);}
    const matches=this.records.filter(r=>r.model===identity.carModel && (!identity.carClass || r.carClass===identity.carClass));
    return matches.length===1?structuredClone(matches[0]):null;
  }
}

export function formatPluginStatusLog(status: DataPluginStatus): string {
  if (status.state === 'ready') {
    const details = [
      `tracks: ${status.tracks ? 'yes' : 'no'}`,
      `vehicles: ${status.vehicles ? 'yes' : 'no'}`,
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
setVehicleCatalog(dataPlugin.vehicles());

