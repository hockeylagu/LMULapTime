import type { SceneryChunk, SceneryLayout, ScenerySectorChunk } from '../../../../../shared/types/scenes/scenery.js';
import { TEST_HAZE_WEIGHTS, testCamera, testShading, testSky } from '../../../../helpers/scenes/sceneryProfiles.js';

const base = { sha256: 'x', byteLength: 1, triangles: 1, vertices: 1, drawCalls: 1, shadowDrawCalls: 1, shadowTriangles: 1, geometryBytes: 1, meshes: 1, materials: 1 };
const box = (x: number, z: number) => ({ min: [x, 0, z] as [number, number, number], max: [x + 100, 10, z + 100] as [number, number, number] });

/** Four main sectors of 1000 m on a 4000 m route (xz bounds along x), a pit chunk covering the first 500 m, and a horizon. */
export function testLayout(): SceneryLayout {
  const main = (index: number): ScenerySectorChunk => ({
    ...base, id: `s${index}`, kind: 'main', asset: `scenery/s${index}.glb`, bounds: box(index * 1000, 0), textures: [`t${index % 2}`, 'shared'],
    lapStartM: index * 1000, lapEndM: (index + 1) * 1000
  });
  const pit: ScenerySectorChunk = { ...base, id: 'p0', kind: 'pit', asset: 'scenery/p0.glb', bounds: box(0, 500), textures: ['shared'], lapStartM: 0, lapEndM: 500, pitStartM: 0, pitEndM: 400 };
  const horizon: SceneryChunk = { ...base, id: 'horizon', kind: 'horizon', asset: 'scenery/h.glb', bounds: box(-5000, -5000), textures: [] };
  return {
    layoutKey: 'test', sourceGeometryRevision: 'g', routeLengthM: 4000, pitLaneLengthM: 400, shadowRangeM: 750, environmentProbe: { position: [0, 0, 0] },
    chunking: { sectorLengthM: 1000, minSectorLengthM: 100, maxSectorTriangles: 1, horizonDistanceM: 1, skylineHeightM: 1, skylineMinDistanceM: 1, terrainScaleExtentM: 1, pitBandM: 1 },
    streaming: { residentBehindM: 300, residentAheadM: 1500, freeCameraRadiusM: 1500 },
    camera: testCamera(),
    shading: testShading(),
    sky: testSky(),
    daylight: { date: '2023-09-10', sessions: [{ id: 'race', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'qualify', localTime: '15:00', sunElevationDeg: 46.1 }, { id: 'practice1', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'practice2', localTime: '15:30', sunElevationDeg: 40.89 }], airPollution: 0.5, hazeBaseScale: 0.55, ...TEST_HAZE_WEIGHTS, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9 },
    horizon, sectors: [0, 1, 2, 3].map(main).concat(pit), textures: [],
  };
}
