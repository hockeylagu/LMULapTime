import assert from 'node:assert/strict';
import { register } from 'tsx/esm/api';
register();
const { getStoredReplayTrajectory, getAdjacentLapTrajectories } = await import('../../../server/core/replay/dbReplayTrajectoryStore.ts');
const { applyGarageState } = await import('../../../server/replay/decode/garageState.ts');
const { lapEdgesFromNeighbours } = await import('../../../server/replay/decode/replayLapPoints.ts');
const { withoutReplayFacts, lapFactsFrom, lapSpanFrom, lapSummariesFrom } = await import('../../../server/replay/decode/replayFacts.ts');
const { classifyRetainedReplayLaps } = await import('../../../server/replay/decode/replayLapClassification.ts');
const { applyPureOfficialLapValidation, downsampleTrajectoryResponse } = await import('../../../server/replay/decode/replayTransforms.ts');
const { enrichTrajectoryWithTrackGeometry, stripLapEdgeSamples, getTrackDefinition, applyCanonicalProjection } = await import('../../../server/tracks/serverTrackSync.ts');
const { pointBudgetForSpacing } = await import('../../../server/replay/decode/trajectoryDownsampler.ts');
const { applyTelemetryPostProcessingToTrajectory } = await import('../../../src/utils/telemetryPostProcessing.ts');
const { getCircuitSpecification } = await import('../../../shared/domain/circuitSpecs.ts');
const { buildCenterlineSpatialIndex } = await import('../../../server/tracks/trackProjection.ts');
import { decodeColumns, assembleView } from './codec.mjs';
import zlib from 'node:zlib';

export const VIEWS = ['high', 'standard', 'full', 'consistency'];

export function canonicalDriverLaps(driver) {
  const laps = driver.allLapsData ?? [driver];
  const spans = new Map(laps.map(lap => [lap.currentLap, lapSpanFrom(lap.points)]).filter(([, span]) => span));
  const summaries = lapSummariesFrom(lapFactsFrom(driver.laps ?? [], spans));
  return laps.map(lap => {
    const stripped = withoutReplayFacts(lap, driver.driverSlot);
    const { allLapsData: _all, ...single } = stripped;
    const result = { ...single, points: single.points.map(point => ({ ...point })) };
    applyGarageState(result.points, (result.pitEvents ?? []).filter(event => event.driverSlot === result.driverSlot));
    result.laps = summaries.map(summary => ({ ...summary, isPitStop: undefined }));
    result.laps = classifyRetainedReplayLaps(result, spans, driver.driverSlot);
    return result;
  });
}

export function attachEdges(lap, previous, next) {
  const { leadIn, leadOut } = lapEdgesFromNeighbours(lap.points, previous?.points, next?.points);
  return { ...lap, leadInPoints: leadIn.length ? leadIn : undefined, leadOutPoints: leadOut.length ? leadOut : undefined };
}

export function geometry(lap, config) {
  const driver = config.session?.drivers.find(row => (row.driverName || row.name).trim().toLowerCase() === lap.driverName?.trim().toLowerCase());
  let result = applyPureOfficialLapValidation({ ...lap, source: 'vcr',
    vcrRawPointsCount: lap.vcrRawPointsCount ?? lap.points.length, vcrRawSampleRateHz: lap.vcrRawSampleRateHz }, config.session, driver);
  result = enrichTrajectoryWithTrackGeometry(result, config.venue, config.course, config.filename, config.sceneDesc, config.trackLength);
  stripLapEdgeSamples(result);
  return result;
}

export function readyView(projected, view) {
  const budget = view === 'full' ? 0 : view === 'consistency' ? 400
    : pointBudgetForSpacing(projected.points, projected.trackLengthM, view === 'high' ? 2 : 4);
  return applyTelemetryPostProcessingToTrajectory(downsampleTrajectoryResponse(projected, budget));
}

export function baselineRead(db, config, slot, lapNumber, view) {
  const lap = getStoredReplayTrajectory(db, config.filename, slot, lapNumber);
  assert(lap, 'Missing baseline lap');
  const { previous, next } = getAdjacentLapTrajectories(db, config.filename, slot, lapNumber);
  return readyView(geometry(attachEdges(lap, previous, next), config), view);
}

export function proposedRead(db, slot, lap, view) {
  const source = db.prepare('SELECT samples FROM poc_samples WHERE slot=? AND lap=?').get(slot, lap);
  const row = db.prepare('SELECT delta FROM poc_views WHERE slot=? AND lap=? AND view=?').get(slot, lap, view);
  assert(source && row, 'Missing prepared view');
  return { ...assembleView(decodeColumns(source.samples), decodeColumns(row.delta)), ...sharedDriver(db, slot) };
}

export function sharedDriver(db, slot) {
  return JSON.parse(zlib.brotliDecompressSync(db.prepare('SELECT shared FROM poc_drivers WHERE slot=?').get(slot).shared));
}

export function retainedSource(db, slot, lap) {
  const row = db.prepare('SELECT samples FROM poc_samples WHERE slot=? AND lap=?').get(slot, lap);
  const decoded = decodeColumns(row.samples);
  const { validation: _validation, ...shared } = sharedDriver(db, slot);
  return { ...decoded.metadata, ...shared, points: Array.from({ length: decoded.length }, (_, index) => decoded.point(index)) };
}

export function shiftedGeometry(config) {
  const specification = getCircuitSpecification(config.venue, config.course, config.sceneDesc, config.filename, null, config.trackLength);
  const original = getTrackDefinition(specification.layoutKey);
  assert(original, 'A real track package is required');
  // Move the centreline station origin by one existing vertex (~metres), preserving the layout shape.
  const closed = original.centerline[0][0] === original.centerline.at(-1)[0] && original.centerline[0][1] === original.centerline.at(-1)[1];
  const open = closed ? original.centerline.slice(0, -1) : [...original.centerline];
  const centerline = [...open.slice(1), open[0]];
  centerline.push(centerline[0]);
  return { ...original, centerline, spatialIndex: buildCenterlineSpatialIndex(centerline),
    geometryRevision: 'poc-shifted-geometry', projectionRevision: 'poc-shifted-projection' };
}

export function recut(lap, previous, next, definition) {
  const result = attachEdges(structuredClone(lap), previous, next);
  // Read-ready annotations must not cause the canonical cutter to skip this new cut.
  delete result.lineCut; delete result.projectionRevision; delete result.stationSource;
  applyCanonicalProjection(result, definition);
  return result;
}
