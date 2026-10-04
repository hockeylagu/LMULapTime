import {createHash} from 'node:crypto';
// Mirrors the generator's app payload contract; no generator or game inputs are runtime dependencies.
const fields=['layoutKey','circuitId','layoutId','trackVenue','trackCourse','lengthM','bounds','leftBoundary','rightBoundary','centerline','nominalWidthM','mapSurfaces','startFinish','timingGates','elevationProfile','pitLane','pitStalls','gridSlots','schemaVersion','coordinates','surfaceProfile'];
export function trackRevisions(raw:Record<string,unknown>) {
 const payload=Object.fromEntries(fields.filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]));
 const projectionRevision='projection-'+createHash('sha256').update(JSON.stringify({centerline:payload.centerline,timingGates:payload.timingGates})).digest('hex');
 const geometryRevision='geometry-'+createHash('sha256').update(JSON.stringify({...payload,projectionRevision})).digest('hex');
 return {projectionRevision,geometryRevision};
}
export function validateTrackPackage(raw:Record<string,unknown>) {
 if(Object.keys(raw).some(k=>![...fields,'projectionRevision','geometryRevision'].includes(k)))throw Error('Unsupported track field');
 const revisions=trackRevisions(raw);
 if(raw.geometryRevision!==revisions.geometryRevision||raw.projectionRevision!==revisions.projectionRevision)throw Error('Noncanonical track revisions');
}
