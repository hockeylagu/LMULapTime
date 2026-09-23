import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import {
  Point2D,
  TimingGateGeometry,
  TrackBoundaryGeometry,
  TrackConfig,
  TRACK_CONFIGS,
} from './trackConfigs.js';
import {
  resamplePolyline,
  loadReplayLap,
  extractTrackGateSamples,
  applyUniformCorridorMargin,
  fitGateLine,
  intersectLineWithPolyline,
  findClosestOnPolyline,
  findConsensusCluster,
  rollPolyline,
  rollNumberArray,
  computeStationAlongPolyline,
} from './trackBoundaryAlignment.js';
import {
  synthesizeHybridTrack,
  buildTrackSourceGeometry,
} from './trackBoundaryBuilders.js';

export {
  Point2D,
  TimingGateGeometry,
  TrackBoundaryGeometry,
  TrackConfig,
  TRACK_CONFIGS,
  synthesizeHybridTrack,
};

export async function processTrack(cfg: TrackConfig, db: any): Promise<TrackBoundaryGeometry> {
  console.log(`\n==================================================`);
  console.log(`Processing [${cfg.layoutKey}]: ${cfg.trackVenue} - ${cfg.trackCourse}`);
  console.log(`Strategy: ${cfg.sourceType} | Nominal Width: ${cfg.nominalWidthM}m`);

  const replayLap = loadReplayLap(db, cfg.replayPattern, cfg.preferredLap || 2);
  const lmu2D = replayLap.map(p => ({ x: p.x, y: p.z }));
  const N_SAMPLE = 400;
  const lmuResampled = resamplePolyline(lmu2D, N_SAMPLE);

  const {
    finalCenter,
    finalLeft,
    finalRight,
    transformInfo,
    surveyAnchor,
    elevationProfile,
    pitLaneData,
    pitStallsData,
    gridSlotsData,
  } = await buildTrackSourceGeometry(cfg, lmu2D, lmuResampled, N_SAMPLE);

  applyUniformCorridorMargin(finalCenter, finalLeft, finalRight, cfg.corridorMarginM ?? 0);

  // Multi-replay Timing Gate Fitting and Polyline Alignment
  const gateSamples = extractTrackGateSamples(db, cfg.layoutKey, cfg.replayPattern);

  const sfFallback: Point2D = surveyAnchor ?? (replayLap[0] ? { x: replayLap[0].x, y: replayLap[0].z } : finalCenter[0]);
  const sfTangent: Point2D = {
    x: finalCenter[1].x - finalCenter[0].x,
    y: finalCenter[1].y - finalCenter[0].y,
  };

  const CONSENSUS_RADIUS_M = 20;
  const MIN_CONSENSUS_SIZE = 3;
  const SANITY_MAX_DISTANCE_M = 200;

  const consensusCluster = findConsensusCluster(gateSamples.sfSamples, CONSENSUS_RADIUS_M, MIN_CONSENSUS_SIZE);
  let trustedSfSamples: Point2D[];
  if (consensusCluster) {
    const centroid = {
      x: consensusCluster.reduce((a, p) => a + p.x, 0) / consensusCluster.length,
      y: consensusCluster.reduce((a, p) => a + p.y, 0) / consensusCluster.length,
    };
    const distFromAnchor = surveyAnchor ? Math.hypot(centroid.x - surveyAnchor.x, centroid.y - surveyAnchor.y) : 0;
    if (surveyAnchor && distFromAnchor > SANITY_MAX_DISTANCE_M) {
      console.warn(`[${cfg.layoutKey}] Discarding a ${consensusCluster.length}-sample telemetry consensus ${distFromAnchor.toFixed(0)}m from the survey anchor - likely still contamination.`);
      trustedSfSamples = [];
    } else {
      trustedSfSamples = consensusCluster;
    }
  } else if (surveyAnchor) {
    const SURVEY_TRUST_RADIUS_M = 40;
    trustedSfSamples = gateSamples.sfSamples.filter(p => Math.hypot(p.x - surveyAnchor!.x, p.y - surveyAnchor!.y) <= SURVEY_TRUST_RADIUS_M);
    if (trustedSfSamples.length < gateSamples.sfSamples.length) {
      console.warn(`[${cfg.layoutKey}] No telemetry consensus; rejected ${gateSamples.sfSamples.length - trustedSfSamples.length}/${gateSamples.sfSamples.length} S/F samples > ${SURVEY_TRUST_RADIUS_M}m from the survey anchor.`);
    }
  } else {
    trustedSfSamples = gateSamples.sfSamples;
  }

  const sfGate = fitGateLine(trustedSfSamples, sfFallback, sfTangent);
  const sfCenterInter = intersectLineWithPolyline(sfGate.point, sfGate.dir, finalCenter, 35) || findClosestOnPolyline(sfGate.point, finalCenter);

  const mCenter = finalCenter.length;
  const sfIdx = Math.floor(sfCenterInter.index);
  const pSfPrev = finalCenter[(sfIdx - 1 + mCenter) % mCenter];
  const pSfNext = finalCenter[(sfIdx + 1) % mCenter];
  const sfTdx = pSfNext.x - pSfPrev.x;
  const sfTdy = pSfNext.y - pSfPrev.y;
  const sfTLen = Math.hypot(sfTdx, sfTdy) || 1;
  const sfNormal = { x: -sfTdy / sfTLen, y: sfTdx / sfTLen };

  const sfLeftInter = intersectLineWithPolyline(sfCenterInter.point, sfNormal, finalLeft, 35) || findClosestOnPolyline(sfCenterInter.point, finalLeft);
  const sfRightInter = intersectLineWithPolyline(sfCenterInter.point, { x: -sfNormal.x, y: -sfNormal.y }, finalRight, 35) || findClosestOnPolyline(sfCenterInter.point, finalRight);

  const rolledCenter = rollPolyline(finalCenter, sfCenterInter.index, sfCenterInter.point);
  const rolledLeft = rollPolyline(finalLeft, sfCenterInter.index, sfLeftInter.point);
  const rolledRight = rollPolyline(finalRight, sfCenterInter.index, sfRightInter.point);
  const rolledElevation = elevationProfile ? rollNumberArray(elevationProfile, sfCenterInter.index) : undefined;

  const lengthM = computeStationAlongPolyline(rolledCenter, rolledCenter.length);
  const MIN_SECTOR_MARGIN_M = 150;
  const isPlausibleSectorStation = (stationM: number) => stationM >= MIN_SECTOR_MARGIN_M && stationM <= lengthM - MIN_SECTOR_MARGIN_M;

  let sector1Gate: TimingGateGeometry | undefined = undefined;
  if (gateSamples.s1Samples.length > 0) {
    const s1Fallback = gateSamples.s1Samples[0];
    const s1GateLine = fitGateLine(gateSamples.s1Samples, s1Fallback, { x: 1, y: 0 });
    const s1Center = intersectLineWithPolyline(s1GateLine.point, s1GateLine.dir, rolledCenter, 35) || findClosestOnPolyline(s1GateLine.point, rolledCenter);

    const mRolled = rolledCenter.length;
    const s1Idx = Math.floor(s1Center.index);
    const pS1Prev = rolledCenter[(s1Idx - 1 + mRolled) % mRolled];
    const pS1Next = rolledCenter[(s1Idx + 1) % mRolled];
    const s1Tdx = pS1Next.x - pS1Prev.x;
    const s1Tdy = pS1Next.y - pS1Prev.y;
    const s1TLen = Math.hypot(s1Tdx, s1Tdy) || 1;
    const s1Normal = { x: -s1Tdy / s1TLen, y: s1Tdx / s1TLen };

    const s1Left = intersectLineWithPolyline(s1Center.point, s1Normal, rolledLeft, 35) || findClosestOnPolyline(s1Center.point, rolledLeft);
    const s1Right = intersectLineWithPolyline(s1Center.point, { x: -s1Normal.x, y: -s1Normal.y }, rolledRight, 35) || findClosestOnPolyline(s1Center.point, rolledRight);
    const s1StationM = computeStationAlongPolyline(rolledCenter, s1Center.index);
    if (isPlausibleSectorStation(s1StationM)) {
      sector1Gate = {
        name: 'Sector 1',
        center: [s1Center.point.x, s1Center.point.y],
        left: [s1Left.point.x, s1Left.point.y],
        right: [s1Right.point.x, s1Right.point.y],
        stationM: Number(s1StationM.toFixed(1)),
      };
    } else {
      console.warn(`[${cfg.layoutKey}] Rejected implausible Sector 1 gate at stationM=${s1StationM.toFixed(1)} (lengthM=${lengthM.toFixed(1)}).`);
    }
  }

  let sector2Gate: TimingGateGeometry | undefined = undefined;
  if (gateSamples.s2Samples.length > 0) {
    const s2Fallback = gateSamples.s2Samples[0];
    const s2GateLine = fitGateLine(gateSamples.s2Samples, s2Fallback, { x: 1, y: 0 });
    const s2Center = intersectLineWithPolyline(s2GateLine.point, s2GateLine.dir, rolledCenter, 35) || findClosestOnPolyline(s2GateLine.point, rolledCenter);

    const mRolled = rolledCenter.length;
    const s2Idx = Math.floor(s2Center.index);
    const pS2Prev = rolledCenter[(s2Idx - 1 + mRolled) % mRolled];
    const pS2Next = rolledCenter[(s2Idx + 1) % mRolled];
    const s2Tdx = pS2Next.x - pS2Prev.x;
    const s2Tdy = pS2Next.y - pS2Prev.y;
    const s2TLen = Math.hypot(s2Tdx, s2Tdy) || 1;
    const s2Normal = { x: -s2Tdy / s2TLen, y: s2Tdx / s2TLen };

    const s2Left = intersectLineWithPolyline(s2Center.point, s2Normal, rolledLeft, 35) || findClosestOnPolyline(s2Center.point, rolledLeft);
    const s2Right = intersectLineWithPolyline(s2Center.point, { x: -s2Normal.x, y: -s2Normal.y }, rolledRight, 35) || findClosestOnPolyline(s2Center.point, rolledRight);
    const s2StationM = computeStationAlongPolyline(rolledCenter, s2Center.index);
    if (isPlausibleSectorStation(s2StationM) && (!sector1Gate || s2StationM > sector1Gate.stationM)) {
      sector2Gate = {
        name: 'Sector 2',
        center: [s2Center.point.x, s2Center.point.y],
        left: [s2Left.point.x, s2Left.point.y],
        right: [s2Right.point.x, s2Right.point.y],
        stationM: Number(s2StationM.toFixed(1)),
      };
    } else {
      console.warn(`[${cfg.layoutKey}] Rejected implausible Sector 2 gate at stationM=${s2StationM.toFixed(1)} (lengthM=${lengthM.toFixed(1)}).`);
    }
  }

  const timingGates = {
    startFinish: {
      name: 'Start / Finish',
      center: [sfCenterInter.point.x, sfCenterInter.point.y] as [number, number],
      left: [sfLeftInter.point.x, sfLeftInter.point.y] as [number, number],
      right: [sfRightInter.point.x, sfRightInter.point.y] as [number, number],
      stationM: 0,
    },
    sector1: sector1Gate,
    sector2: sector2Gate,
  };

  const allX = [...rolledLeft.map(p => p.x), ...rolledRight.map(p => p.x)];
  const allZ = [...rolledLeft.map(p => p.y), ...rolledRight.map(p => p.y)];
  const minX = Number(Math.min(...allX).toFixed(2));
  const maxX = Number(Math.max(...allX).toFixed(2));
  const minZ = Number(Math.min(...allZ).toFixed(2));
  const maxZ = Number(Math.max(...allZ).toFixed(2));

  const geometry: TrackBoundaryGeometry = {
    layoutKey: cfg.layoutKey,
    circuitId: cfg.circuitId,
    layoutId: cfg.layoutId,
    trackVenue: cfg.trackVenue,
    trackCourse: cfg.trackCourse,
    lengthM: Number(lengthM.toFixed(1)),
    source: cfg.sourceType === 'lmu_api' ? 'LMU-API+Telemetry'
      : cfg.sourceType === 'TUM' ? 'TUM-survey'
      : cfg.sourceType === 'osm' ? 'OpenStreetMap'
      : cfg.sourceType === 'atlas' ? 'track-atlas'
      : cfg.sourceType === 'hybrid' ? `hybrid (${cfg.parentLayoutKey})`
      : 'telemetry-corridor',
    transform: transformInfo,
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ,
      spanX: Number((maxX - minX).toFixed(2)),
      spanZ: Number((maxZ - minZ).toFixed(2)),
    },
    leftBoundary: rolledLeft.map(p => [p.x, p.y]),
    rightBoundary: rolledRight.map(p => [p.x, p.y]),
    centerline: rolledCenter.map(p => [p.x, p.y]),
    nominalWidthM: cfg.nominalWidthM,
    startFinish: [sfCenterInter.point.x, sfCenterInter.point.y],
    timingGates,
    elevationProfile: rolledElevation,
    pitLane: pitLaneData,
    pitStalls: pitStallsData,
    gridSlots: gridSlotsData,
    createdAt: new Date().toISOString(),
  };

  console.log(`Completed [${geometry.layoutKey}]: ${geometry.lengthM}m length, S/F=[${sfCenterInter.point.x}, ${sfCenterInter.point.y}], S1=${sector1Gate?.stationM}m, S2=${sector2Gate?.stationM}m`);
  return geometry;
}

export function hasGeometryChanged(existing: TrackBoundaryGeometry, current: TrackBoundaryGeometry): boolean {
  if (!existing.timingGates || !existing.startFinish) {
    return true;
  }
  if (
    Boolean(existing.elevationProfile) !== Boolean(current.elevationProfile) ||
    Boolean(existing.pitLane) !== Boolean(current.pitLane) ||
    Boolean(existing.pitStalls) !== Boolean(current.pitStalls) ||
    Boolean(existing.gridSlots) !== Boolean(current.gridSlots)
  ) {
    return true;
  }
  if (
    existing.elevationProfile && current.elevationProfile &&
    JSON.stringify(existing.elevationProfile) !== JSON.stringify(current.elevationProfile)
  ) {
    return true;
  }
  if (
    existing.pitLane && current.pitLane &&
    JSON.stringify(existing.pitLane) !== JSON.stringify(current.pitLane)
  ) {
    return true;
  }
  if (
    existing.pitStalls && current.pitStalls &&
    JSON.stringify(existing.pitStalls) !== JSON.stringify(current.pitStalls)
  ) {
    return true;
  }
  if (
    existing.gridSlots && current.gridSlots &&
    JSON.stringify(existing.gridSlots) !== JSON.stringify(current.gridSlots)
  ) {
    return true;
  }
  if (
    existing.startFinish[0] !== current.startFinish?.[0] ||
    existing.startFinish[1] !== current.startFinish?.[1]
  ) {
    return true;
  }
  if (
    existing.timingGates?.startFinish?.stationM !== current.timingGates?.startFinish?.stationM ||
    existing.timingGates?.sector1?.stationM !== current.timingGates?.sector1?.stationM ||
    existing.timingGates?.sector2?.stationM !== current.timingGates?.sector2?.stationM
  ) {
    return true;
  }
  if (
    existing.layoutKey !== current.layoutKey ||
    existing.circuitId !== current.circuitId ||
    existing.layoutId !== current.layoutId ||
    existing.trackVenue !== current.trackVenue ||
    existing.trackCourse !== current.trackCourse ||
    existing.lengthM !== current.lengthM ||
    existing.source !== current.source ||
    existing.nominalWidthM !== current.nominalWidthM
  ) {
    return true;
  }
  if (
    (existing.transform?.scale ?? 0) !== (current.transform?.scale ?? 0) ||
    (existing.transform?.rotationDeg ?? 0) !== (current.transform?.rotationDeg ?? 0) ||
    (existing.transform?.tx ?? 0) !== (current.transform?.tx ?? 0) ||
    (existing.transform?.tz ?? 0) !== (current.transform?.tz ?? 0) ||
    (existing.transform?.rmse ?? 0) !== (current.transform?.rmse ?? 0)
  ) {
    return true;
  }
  if (
    existing.bounds.minX !== current.bounds.minX ||
    existing.bounds.maxX !== current.bounds.maxX ||
    existing.bounds.minZ !== current.bounds.minZ ||
    existing.bounds.maxZ !== current.bounds.maxZ ||
    existing.bounds.spanX !== current.bounds.spanX ||
    existing.bounds.spanZ !== current.bounds.spanZ
  ) {
    return true;
  }
  if (
    existing.centerline.length !== current.centerline.length ||
    existing.leftBoundary.length !== current.leftBoundary.length ||
    existing.rightBoundary.length !== current.rightBoundary.length
  ) {
    return true;
  }
  if (
    JSON.stringify(existing.centerline) !== JSON.stringify(current.centerline) ||
    JSON.stringify(existing.leftBoundary) !== JSON.stringify(current.leftBoundary) ||
    JSON.stringify(existing.rightBoundary) !== JSON.stringify(current.rightBoundary)
  ) {
    return true;
  }
  return false;
}

export async function main() {
  console.log('🏁 Starting Comprehensive Track Boundary Generation for All 21 Driven Layouts...');

  const db = new Database('server/lmu_cache.db');
  const serverDir = path.resolve('server/data/tracks');
  const publicDir = path.resolve('public/tracks');

  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const targetLayoutArg = process.argv.find(arg => arg.startsWith('--layout='))?.split('=')[1];
  const targetLayouts = targetLayoutArg ? targetLayoutArg.split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : null;
  const configsToProcess = targetLayouts
    ? TRACK_CONFIGS.filter(c => targetLayouts.includes(c.layoutKey))
    : TRACK_CONFIGS;

  if (targetLayouts && configsToProcess.length === 0) {
    console.error(`Layout "${targetLayoutArg}" not found in TRACK_CONFIGS.`);
    process.exit(1);
  }

  const serverIndexFile = path.join(serverDir, 'index.json');
  const publicIndexFile = path.join(publicDir, 'index.json');

  let indexManifest: Array<{
    layoutKey: string;
    circuitId: string;
    layoutId: string;
    trackVenue: string;
    trackCourse: string;
    lengthM: number;
    source: string;
    bounds: any;
    pointsCount: number;
    startFinish?: [number, number];
    timingGates?: any;
    hasElevation?: boolean;
    hasPitLane?: boolean;
  }> = [];

  if (fs.existsSync(serverIndexFile)) {
    try {
      indexManifest = JSON.parse(fs.readFileSync(serverIndexFile, 'utf8'));
    } catch {}
  }

  let updatedCount = 0;
  let unchangedCount = 0;

  for (const cfg of configsToProcess) {
    try {
      const geom = await processTrack(cfg, db);
      const serverFile = path.join(serverDir, `${cfg.layoutKey}.json`);
      const publicFile = path.join(publicDir, `${cfg.layoutKey}.json`);

      let existing: TrackBoundaryGeometry | null = null;
      if (fs.existsSync(serverFile)) {
        try {
          existing = JSON.parse(fs.readFileSync(serverFile, 'utf8'));
        } catch {}
      }

      const changed = !existing || hasGeometryChanged(existing, geom);
      if (!changed && existing) {
        geom.createdAt = existing.createdAt;
        if (existing.updatedAt) {
          geom.updatedAt = existing.updatedAt;
        }
        unchangedCount++;
        console.log(`⏩ [${cfg.layoutKey}] No geometry changes; retaining existing version (${existing.updatedAt || existing.createdAt}).`);
      } else {
        const now = new Date().toISOString();
        geom.createdAt = existing?.createdAt || now;
        geom.updatedAt = now;

        const jsonStr = JSON.stringify(geom, null, 2);
        fs.writeFileSync(serverFile, jsonStr, 'utf8');
        fs.writeFileSync(publicFile, jsonStr, 'utf8');
        updatedCount++;
        console.log(`💾 [${cfg.layoutKey}] Geometry updated; wrote new version (updatedAt: ${geom.updatedAt}).`);
      }

      const manifestEntry = {
        layoutKey: geom.layoutKey,
        circuitId: geom.circuitId,
        layoutId: geom.layoutId,
        trackVenue: geom.trackVenue,
        trackCourse: geom.trackCourse,
        lengthM: geom.lengthM,
        source: geom.source,
        bounds: geom.bounds,
        pointsCount: geom.centerline.length,
        startFinish: geom.startFinish,
        timingGates: geom.timingGates,
        hasElevation: Boolean(geom.elevationProfile),
        hasPitLane: Boolean(geom.pitLane),
      };

      const existingManifestIdx = indexManifest.findIndex(m => m.layoutKey === geom.layoutKey);
      if (existingManifestIdx >= 0) {
        indexManifest[existingManifestIdx] = manifestEntry;
      } else {
        indexManifest.push(manifestEntry);
      }
    } catch (err: any) {
      console.error(`❌ Failed processing ${cfg.layoutKey}:`, err.message);
    }
  }

  let existingIndexStr = '';
  if (fs.existsSync(serverIndexFile)) {
    try {
      existingIndexStr = fs.readFileSync(serverIndexFile, 'utf8');
    } catch {}
  }
  const newIndexStr = JSON.stringify(indexManifest, null, 2);
  if (existingIndexStr !== newIndexStr) {
    fs.writeFileSync(serverIndexFile, newIndexStr, 'utf8');
    fs.writeFileSync(publicIndexFile, newIndexStr, 'utf8');
    console.log('💾 index.json: Saved updated catalog manifest.');
  } else {
    console.log('⏩ index.json: No changes detected; skipping rewrite.');
  }

  console.log(`\n🎉 Track Boundary Pipeline complete: ${updatedCount} updated, ${unchangedCount} unchanged.`);
  console.log(`Output locations:`);
  console.log(` - Server Data: ${serverDir}`);
  console.log(` - Public Web:  ${publicDir}`);
}

const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('buildAllTrackBoundaries.ts') ||
  process.argv[1].endsWith('buildAllTrackBoundaries.js') ||
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
);

if (isDirectExecution) {
  main().catch(e => {
    console.error('Fatal error running pipeline:', e);
    process.exit(1);
  });
}
