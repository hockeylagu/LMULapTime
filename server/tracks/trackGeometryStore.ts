import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';
import { parseTrackBoundaryGeometry } from '../../shared/domain/trackGeometry.js';
import { buildCenterlineSpatialIndex, type CenterlineSpatialIndex } from './trackProjection.js';

export interface CachedTrackDefinition extends TrackBoundaryGeometry {
  geometryRevision: string;
  projectionRevision: string;
  spatialIndex: CenterlineSpatialIndex;
}

interface CacheEntry {
  fileStamp: string;
  definition: CachedTrackDefinition | null;
}

/** The station frame is independent of display contours and surface measurements. */
export function centerlineProjectionRevision(
  centerline: Array<[number, number]>,
  timingGates?: TrackBoundaryGeometry['timingGates'],
): string {
  return `projection-${createHash('sha256').update(JSON.stringify({ centerline, timingGates })).digest('hex')}`;
}

/** Validates geometry at the file boundary and rebuilds indexes after atomic file replacement. */
export class TrackGeometryStore {
  private readonly cache = new Map<string, CacheEntry>();

  public constructor(private readonly directory: string | ((key:string)=>TrackBoundaryGeometry|null)) {}

  public get(layoutKey: string): CachedTrackDefinition | null {
    if (!/^[a-z0-9_]+$/.test(layoutKey)) return null;
    if (typeof this.directory === 'function') {
      const cached=this.cache.get(layoutKey); if(cached)return cached.definition;
      const geometry=this.directory(layoutKey); if(!geometry)return null;
      const spatialIndex=buildCenterlineSpatialIndex(geometry.centerline);
      if (!(spatialIndex.totalLengthM>0))return null;
      const definition={...geometry,geometryRevision:geometry.geometryRevision!,projectionRevision:geometry.projectionRevision!,spatialIndex};
      this.cache.set(layoutKey,{fileStamp:geometry.geometryRevision!,definition});return definition;
    }
    const filename = path.join(this.directory, `${layoutKey}.json`);
    let fileStamp = 'missing';
    try {
      const stat = fs.statSync(filename, { bigint: true });
      fileStamp = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    } catch {
      this.cache.delete(layoutKey);
      return null;
    }
    const cached = this.cache.get(layoutKey);
    if (cached?.fileStamp === fileStamp) return cached.definition;
    try {
      const raw = fs.readFileSync(filename, 'utf8');
      const geometry = parseTrackBoundaryGeometry(JSON.parse(raw) as unknown, layoutKey);
      const spatialIndex = buildCenterlineSpatialIndex(geometry.centerline);
      if (!(spatialIndex.totalLengthM > 0) || !Number.isFinite(spatialIndex.totalLengthM)) {
        throw new Error('Invalid track geometry: centerline has no finite route length');
      }
      const definition: CachedTrackDefinition = {
        ...geometry,
        geometryRevision: geometry.geometryRevision ?? `geometry-${createHash('sha256').update(raw).digest('hex')}`,
        projectionRevision: geometry.projectionRevision ?? centerlineProjectionRevision(geometry.centerline, geometry.timingGates),
        spatialIndex,
      };
      this.cache.set(layoutKey, { fileStamp, definition });
      return definition;
    } catch (error) {
      console.warn(`[serverTrackSync] Failed to load track geometry for ${layoutKey}:`, error);
      this.cache.set(layoutKey, { fileStamp, definition: null });
      return null;
    }
  }

  public clear(): void {
    this.cache.clear();
  }
}
