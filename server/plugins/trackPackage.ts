import {createHash} from 'node:crypto';
import {parseTrackBoundaryGeometry} from '../../shared/domain/trackGeometry.js';
// Mirrors the generator's app payload contract; no generator or game inputs are runtime dependencies.
const fields=['layoutKey','circuitId','layoutId','trackVenue','trackCourse','lengthM','bounds','leftBoundary','rightBoundary','centerline','nominalWidthM','mapSurfaces','startFinish','timingGates','elevationProfile','pitLane','pitStalls','gridSlots','schemaVersion','coordinates','surfaceProfile'];
export function trackRevisions(raw:Record<string,unknown>) {
 const payload=Object.fromEntries(fields.filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]));
 const projectionRevision='projection-'+createHash('sha256').update(JSON.stringify({centerline:payload.centerline,timingGates:payload.timingGates})).digest('hex');
 const geometryRevision='geometry-'+createHash('sha256').update(JSON.stringify({...payload,projectionRevision})).digest('hex');
 return {projectionRevision,geometryRevision};
}
export function validateTrackPackage(raw:Record<string,unknown>, expectedLayoutKey?:string) {
 if(Object.keys(raw).some(k=>![...fields,'projectionRevision','geometryRevision'].includes(k)))throw Error('Unsupported track field');
 const revisions=trackRevisions(raw);
 if(raw.geometryRevision!==revisions.geometryRevision||raw.projectionRevision!==revisions.projectionRevision)throw Error('Noncanonical track revisions');
 const geometry=parseTrackBoundaryGeometry(raw,expectedLayoutKey);
 const points=geometry.centerline;
 if(points.length<3 || new Set(points.map(p=>p.join(','))).size<3)throw Error('Degenerate route');
 let measuredLength=0;
 for(let i=0;i<points.length;i++) {
  const a=points[i],b=points[(i+1)%points.length];
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(length<1e-6)throw Error('Degenerate route segment');
  measuredLength+=length;
 }
 // Allows centimetre publication rounding without accepting a different station frame.
 if(!Number.isFinite(measuredLength) || Math.abs(measuredLength-geometry.lengthM)>.01)throw Error('Route length mismatch');
 return geometry;
}
