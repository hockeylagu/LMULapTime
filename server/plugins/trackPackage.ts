import {createHash} from 'node:crypto';
import {parseTrackLayout, TRACK_GEOMETRY_KEYS} from '../../shared/packageContract/index.js';
import type {TrackBoundaryGeometry} from '../../shared/types/trackGeometry.js';

/**
 * The revisions a layout file states, recomputed from its content (docs/PACKAGE_FORMAT.md, Tracks): `geometryRevision` hashes the geometry keys in the
 * published order plus `projectionRevision`; `surfaces` and `brakeMarkers` are display data outside it.
 */
export function trackRevisions(raw:Record<string,unknown>) {
 const payload=Object.fromEntries(TRACK_GEOMETRY_KEYS.filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]));
 const projectionRevision='projection-'+createHash('sha256').update(JSON.stringify({centerline:payload.centerline,timingGates:payload.timingGates})).digest('hex');
 const geometryRevision='geometry-'+createHash('sha256').update(JSON.stringify({...payload,projectionRevision})).digest('hex');
 return {projectionRevision,geometryRevision};
}
/** A layout file the contract accepts (shape, closed route of the stated length) whose stated revisions are the ones its content hashes to. */
export function validateTrackPackage(raw:Record<string,unknown>, expectedLayoutKey?:string):TrackBoundaryGeometry {
 const geometry=parseTrackLayout(raw,expectedLayoutKey);
 const revisions=trackRevisions(raw);
 if(geometry.geometryRevision!==revisions.geometryRevision||geometry.projectionRevision!==revisions.projectionRevision)throw Error('Noncanonical track revisions');
 return geometry;
}
