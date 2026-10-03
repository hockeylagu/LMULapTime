import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TrackBoundaryGeometry } from '../../../shared/types/trackGeometry.js';
import { TrackGeometryStore } from '../../../server/tracks/trackGeometryStore.js';

const PROMOTED_LAYOUTS = [
  'monza_gp',
  'monza_curvagrande',
  'spa_gp',
  'sarthe_full',
  'sarthe_mulsanne',
  'cota_gp',
  'cota_national',
  'barcelona_gp',
  'interlagos_gp',
  'silverstone_wec',
  'silverstone_national',
  'silverstone_international',
  'bahrain_wec',
  'bahrain_outer',
  'bahrain_paddock',
  'bahrain_endurance',
  'imola_gp',
  'daytona_road_course',
  'fuji_chicane',
  'fuji_classic',
  'portimao_wec',
  'sebring_full',
  'sebring_school',
  'laguna_seca',
  'qatar_short',
  'qatar_gp',
  'paul_ricard_1a_v2_short',
  'paul_ricard_1a_v2',
  'paul_ricard_1a',
  'paul_ricard_3a',
  'long_beach',
  'road_atlanta',
] as const;

describe('Promoted native surface geometry across all 32 canonical layouts', () => {
  const store = new TrackGeometryStore(path.resolve('public/tracks'));

  it.each(PROMOTED_LAYOUTS)('%s satisfies runtime contracts', (layoutKey) => {
    const publicPath = path.resolve('public/tracks', `${layoutKey}.json`);
    const publicRaw = fs.readFileSync(publicPath, 'utf8');

    const data = JSON.parse(publicRaw) as TrackBoundaryGeometry;
    expect(data.schemaVersion).toBe(2);
    expect(data.projectionRevision).toMatch(/^projection-[a-f0-9]{32,}$/);
    expect(data.geometryRevision).toMatch(/^geometry-[a-f0-9]{32,}$/);

    // Centerline and boundary sanity
    expect(data.centerline.length).toBeGreaterThan(100);
    expect(data.leftBoundary?.length).toBe(data.centerline.length);
    expect(data.rightBoundary?.length).toBe(data.centerline.length);

    // Surface profile checks
    const profile = data.surfaceProfile;
    expect(profile).toBeDefined();
    if (!profile) return;

    expect(profile.stationM.length).toBe(data.centerline.length);
    expect(profile.leftWidthM.length).toBe(data.centerline.length);
    expect(profile.rightWidthM.length).toBe(data.centerline.length);
    expect(profile.elevationM.length).toBe(data.centerline.length);
    expect(profile.gradePct.length).toBe(data.centerline.length);
    expect(profile.bankDeg.length).toBe(data.centerline.length);

    // Monotonic stations
    for (let i = 1; i < profile.stationM.length; i++) {
      expect(profile.stationM[i]).toBeGreaterThan(profile.stationM[i - 1]);
    }

    // Map surfaces checks
    expect(data.mapSurfaces).toBeDefined();
    expect(data.mapSurfaces?.road?.length).toBeGreaterThan(0);
    expect(data.mapSurfaces?.kerb?.length).toBeGreaterThan(0);

    // Store loading and projection sanity
    const cached = store.get(layoutKey);
    expect(cached).toBeDefined();
    expect(cached?.layoutKey).toBe(layoutKey);
    expect(cached?.spatialIndex).toBeDefined();
    expect(cached?.spatialIndex.totalLengthM).toBeGreaterThan(100);
    expect(cached?.spatialIndex.points.length).toBe(data.centerline.length);
  });

  it('verifies index.json catalogs all promoted layouts with elevation enabled', () => {
    const publicIndex = JSON.parse(fs.readFileSync('public/tracks/index.json', 'utf8')) as Array<{
      layoutKey: string;
      hasElevation?: boolean;
      bounds?: { spanX: number; spanZ: number };
    }>;

    for (const layoutKey of PROMOTED_LAYOUTS) {
      const entry = publicIndex.find(e => e.layoutKey === layoutKey);
      expect(entry, `Missing index entry for ${layoutKey}`).toBeDefined();
      expect(entry?.hasElevation).toBe(true);
      expect(entry?.bounds?.spanX).toBeGreaterThan(100);
      expect(entry?.bounds?.spanZ).toBeGreaterThan(100);
    }
  });
});
