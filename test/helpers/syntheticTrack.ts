import {trackRevisions} from '../../server/plugins/trackPackage.js';
import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';
/** Invented circle for projection/timing regressions; canonical key is a routing identity only. */
export function syntheticTrack(layoutKey='monza_gp'):TrackBoundaryGeometry {
  const n=2048, radius=1000;
  const ring=(r:number):Array<[number,number]>=>Array.from({length:n},(_,i)=>{const t=i/n*Math.PI*2;return [radius-r*Math.cos(t),-r*Math.sin(t)];});
  const values=(value:number|null)=>Array.from({length:n},()=>value);
  const geometry:TrackBoundaryGeometry = {trackVenue:'Synthetic venue',trackCourse:'Synthetic layout',layoutKey,circuitId:layoutKey==='monza_gp'?'monza':'daytona',layoutId:layoutKey==='monza_gp'?'gp':'road',
    schemaVersion:2,geometryRevision:'synthetic-geometry',projectionRevision:'synthetic-projection',
    lengthM:Math.PI*2*radius,centerline:ring(radius),leftBoundary:ring(radius-6),rightBoundary:ring(radius+7),
    bounds:{minX:0,maxX:2000,minZ:-1000,maxZ:1000,spanX:2000,spanZ:2000},
    timingGates:{startFinish:{name:'Synthetic start',center:[0,0],left:[-6,0],right:[7,0],stationM:0}},
    surfaceProfile:{stationM:Array.from({length:n},(_,i)=>i/n*Math.PI*2*radius),leftWidthM:values(6),rightWidthM:values(7),
      elevationM:values(20),gradePct:values(2),bankDeg:values(3),leftElevationM:values(20),rightElevationM:values(20),
      leftKerbWidthM:values(1),rightKerbWidthM:values(null),leftKerbHeightM:values(.05),rightKerbHeightM:values(null)}};
  return {...geometry,...trackRevisions(geometry as unknown as Record<string,unknown>)};
}
