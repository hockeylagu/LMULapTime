vi.mock('../../../server/plugins/dataPlugin.js', async (importOriginal) => {
  const actual=await importOriginal<typeof import('../../../server/plugins/dataPlugin.js')>();
  const {syntheticTrack}=await import('../../helpers/syntheticTrack.js');
  return {...actual,dataPlugin:{status:actual.dataPlugin.status,
    track:(key:string)=>['monza_gp','daytona_road_course'].includes(key)?{geometry:syntheticTrack(key),display:null}:null,
    vehicle:()=>null,vehicles:()=>[]}};
});
import { vi } from 'vitest';
import { describe, it, expect } from 'vitest';
import { buildTrackOutlinePath, getTrackOutlinePath } from '../../../server/tracks/trackOutline.js';

const coords = (path: string) =>
  path.replace(/^M|Z$/g, '').split('L').map((p) => p.split(' ').map(Number) as [number, number]);

describe('buildTrackOutlinePath', () => {
  it('resamples the centerline evenly and fits it in the box, keeping the aspect ratio', () => {
    // A 200 m x 100 m rectangle, drawn with uneven point spacing.
    const rectangle: Array<[number, number]> = [[0, 0], [150, 0], [200, 0], [200, 100], [0, 100], [0, 1]];
    const points = coords(buildTrackOutlinePath(rectangle, 100, 12)!);

    expect(points).toHaveLength(12);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(6, 0);
    expect(Math.max(...xs)).toBeCloseTo(94, 0);
    // Half as tall as wide, centred vertically.
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(44, 0);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(50, 0);
    // z grows upwards: the first point (z = 0) is at the bottom.
    expect(points[0][1]).toBeCloseTo(Math.max(...ys), 5);
  });

  it('gives no outline for a centerline too short to draw', () => {
    expect(buildTrackOutlinePath([[0, 0], [1, 1]])).toBeNull();
    expect(buildTrackOutlinePath([[0, 0], [0, 0], [0, 0]])).toBeNull();
  });
});

describe('getTrackOutlinePath', () => {
  it('draws the layouts whose geometry is known, and nothing for the others', () => {
    const monza = getTrackOutlinePath('monza_gp');
    expect(monza).toMatch(/^M[\d. L]+Z$/);
    expect(monza!.length).toBeLessThan(1500);
    expect(getTrackOutlinePath('no_such_layout')).toBeNull();
  });
});
