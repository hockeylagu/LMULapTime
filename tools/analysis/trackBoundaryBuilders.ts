import fs from 'fs';
import path from 'path';
import {
  Point2D,
  NativeTrackPoint,
  PitLaneData,
  PitStallData,
  GridSlotData,
  TrackConfig,
} from './trackConfigs.js';
import {
  parseTumCsv,
  gpsToLocalMeters,
  resamplePolyline,
  resampleStep,
  smoothPolyline,
  computeCorridorBoundaries,
  findSimilarityTransform,
  loadNativeTrackmap,
  ensureSourceFile,
} from './trackBoundaryAlignment.js';

export function synthesizeHybridTrack(
  parentGeom: any,
  telem2D: Point2D[],
  nominalWidthM: number,
  divThresholdM: number = 12.0,
  parentElevation?: number[],
  telemElevation?: number[]
): {
  centerline: Point2D[];
  left: Point2D[];
  right: Point2D[];
  elevation?: number[];
  sharedPct: number;
} {
  const P_center: Point2D[] = parentGeom.centerline.map(([x, y]: [number, number]) => ({ x, y }));
  const P_left: Point2D[] = parentGeom.leftBoundary.map(([x, y]: [number, number]) => ({ x, y }));
  const P_right: Point2D[] = parentGeom.rightBoundary.map(([x, y]: [number, number]) => ({ x, y }));
  const N_parent = P_center.length;

  const T = telem2D.length > 500 ? telem2D : smoothPolyline(resampleStep(telem2D, 2.5), 5);
  const N_telem = T.length;

  // Closest parent search
  const closestParent: Array<{ i: number; minD: number; k: number }> = [];
  for (let i = 0; i < N_telem; i++) {
    let minD = Infinity, bestK = 0;
    for (let k = 0; k < N_parent; k++) {
      const d = Math.hypot(T[i].x - P_center[k].x, T[i].y - P_center[k].y);
      if (d < minD) { minD = d; bestK = k; }
    }
    closestParent.push({ i, minD, k: bestK });
  }

  // Detect divergent sections
  const isDivergent = closestParent.map(cp => cp.minD > divThresholdM);
  const divRuns: Array<{ divStartT: number; divEndT: number; kExit: number; kEntry: number }> = [];
  let inDiv = false, dStart = 0;
  for (let i = 0; i < N_telem; i++) {
    if (isDivergent[i] && !inDiv) {
      inDiv = true;
      dStart = i;
    } else if (!isDivergent[i] && inDiv) {
      inDiv = false;
      const dEnd = i - 1;
      const kExit = closestParent[Math.max(0, dStart - 1)].k;
      const kEntry = closestParent[dEnd + 1 < N_telem ? dEnd + 1 : 0].k;
      divRuns.push({ divStartT: dStart, divEndT: dEnd, kExit, kEntry });
    }
  }
  if (inDiv) {
    const dEnd = N_telem - 1;
    const kExit = closestParent[Math.max(0, dStart - 1)].k;
    const kEntry = closestParent[0].k;
    divRuns.push({ divStartT: dStart, divEndT: dEnd, kExit, kEntry });
  }

  const finalCenter: Point2D[] = [];
  const finalLeft: Point2D[] = [];
  const finalRight: Point2D[] = [];
  const finalElevation: number[] = [];
  let totalParentPoints = 0;

  for (let r = 0; r < divRuns.length; r++) {
    const curRun = divRuns[r];
    const prevRun = r > 0 ? divRuns[r - 1] : divRuns[divRuns.length - 1];

    // Shared parent segment
    let parentStartK = r === 0 ? prevRun.kEntry : prevRun.kEntry;
    let parentEndK = curRun.kExit;
    const parentSegCenter: Point2D[] = [];
    const parentSegLeft: Point2D[] = [];
    const parentSegRight: Point2D[] = [];
    const parentSegElev: number[] = [];

    let k = parentStartK;
    while (true) {
      parentSegCenter.push(P_center[k]);
      parentSegLeft.push(P_left[k]);
      parentSegRight.push(P_right[k]);
      if (parentElevation && parentElevation[k] !== undefined) {
        parentSegElev.push(parentElevation[k]);
      }
      totalParentPoints++;
      if (k === parentEndK) break;
      k = (k + 1) % N_parent;
      if (parentSegCenter.length > N_parent * 1.5) break;
    }

    // Divergent connector
    const divCenter: Point2D[] = [];
    let t = curRun.divStartT;
    while (true) {
      divCenter.push(T[t]);
      if (t === curRun.divEndT) break;
      t = (t + 1) % N_telem;
      if (divCenter.length > N_telem * 1.5) break;
    }

    // Snap connector endpoints
    divCenter[0] = { x: P_center[curRun.kExit].x, y: P_center[curRun.kExit].y };
    divCenter[divCenter.length - 1] = { x: P_center[curRun.kEntry].x, y: P_center[curRun.kEntry].y };

    const L = divCenter.length;
    const BLEND_ZONE = Math.min(12, Math.floor(L / 3));

    // Variable road width profile
    const hwStart = Math.hypot(P_left[curRun.kExit].x - P_center[curRun.kExit].x, P_left[curRun.kExit].y - P_center[curRun.kExit].y);
    const hwEnd = Math.hypot(P_left[curRun.kEntry].x - P_center[curRun.kEntry].x, P_left[curRun.kEntry].y - P_center[curRun.kEntry].y);
    const hwNominal = nominalWidthM / 2;

    const hwProfile: number[] = [];
    for (let i = 0; i < L; i++) {
      const frac = i / (L - 1 || 1);
      let hw = hwNominal;
      if (i < BLEND_ZONE) {
        const u = 0.5 * (1 + Math.cos((Math.PI * i) / BLEND_ZONE));
        hw = hwStart * u + hwNominal * (1 - u);
      } else if (i >= L - BLEND_ZONE) {
        const u = 0.5 * (1 + Math.cos((Math.PI * (L - 1 - i)) / BLEND_ZONE));
        hw = hwEnd * u + hwNominal * (1 - u);
      } else {
        hw = hwStart * (1 - frac) + hwEnd * frac;
      }
      hwProfile.push(hw);
    }

    // Curvature shift
    const divOffsets: number[] = [];
    for (let i = 0; i < L; i++) {
      const prev = divCenter[Math.max(0, i - 2)];
      const cur = divCenter[i];
      const next = divCenter[Math.min(L - 1, i + 2)];
      const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y;
      const dx2 = next.x - cur.x, dy2 = next.y - cur.y;
      const a1 = Math.atan2(dy1, dx1), a2 = Math.atan2(dy2, dx2);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const ds = (Math.hypot(dx1, dy1) + Math.hypot(dx2, dy2)) / 2;
      const kCurv = diff / (ds || 1);

      const maxShift = Math.max(0, hwProfile[i] - 2.8);
      const shift = -Math.tanh(kCurv * 80) * maxShift;
      divOffsets.push(shift);
    }

    // Smooth offsets
    const smoothOffsets: number[] = [];
    const W = Math.min(5, Math.floor(L / 4));
    for (let i = 0; i < L; i++) {
      let sum = 0, count = 0;
      for (let w = -W; w <= W; w++) {
        const idx = i + w;
        if (idx >= 0 && idx < L) {
          sum += divOffsets[idx];
          count++;
        }
      }
      const taper = Math.sin((Math.PI * i) / (L - 1 || 1));
      smoothOffsets.push((sum / count) * taper);
    }

    // Extrude connector road center, left, and right
    const divRoadCenter: Point2D[] = [];
    const divLeft: Point2D[] = [];
    const divRight: Point2D[] = [];
    for (let i = 0; i < L; i++) {
      const prev = divCenter[Math.max(0, i - 1)];
      const next = divCenter[Math.min(L - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const offset = smoothOffsets[i];
      const cx = divCenter[i].x + nx * offset;
      const cy = divCenter[i].y + ny * offset;
      divRoadCenter.push({ x: Number(cx.toFixed(2)), y: Number(cy.toFixed(2)) });
      divLeft.push({ x: Number((cx + nx * hwProfile[i]).toFixed(2)), y: Number((cy + ny * hwProfile[i]).toFixed(2)) });
      divRight.push({ x: Number((cx - nx * hwProfile[i]).toFixed(2)), y: Number((cy - ny * hwProfile[i]).toFixed(2)) });
    }

    // Smooth C1 blend of boundaries into parent boundaries at both junctions
    const deltaL_start = { x: P_left[curRun.kExit].x - divLeft[0].x, y: P_left[curRun.kExit].y - divLeft[0].y };
    const deltaR_start = { x: P_right[curRun.kExit].x - divRight[0].x, y: P_right[curRun.kExit].y - divRight[0].y };
    const deltaL_end = { x: P_left[curRun.kEntry].x - divLeft[L - 1].x, y: P_left[curRun.kEntry].y - divLeft[L - 1].y };
    const deltaR_end = { x: P_right[curRun.kEntry].x - divRight[L - 1].x, y: P_right[curRun.kEntry].y - divRight[L - 1].y };

    for (let b = 0; b < BLEND_ZONE; b++) {
      const u = 0.5 * (1 + Math.cos((Math.PI * b) / BLEND_ZONE));
      divLeft[b] = {
        x: Number((divLeft[b].x + deltaL_start.x * u).toFixed(2)),
        y: Number((divLeft[b].y + deltaL_start.y * u).toFixed(2)),
      };
      divRight[b] = {
        x: Number((divRight[b].x + deltaR_start.x * u).toFixed(2)),
        y: Number((divRight[b].y + deltaR_start.y * u).toFixed(2)),
      };

      const idx = L - 1 - b;
      divLeft[idx] = {
        x: Number((divLeft[idx].x + deltaL_end.x * u).toFixed(2)),
        y: Number((divLeft[idx].y + deltaL_end.y * u).toFixed(2)),
      };
      divRight[idx] = {
        x: Number((divRight[idx].x + deltaR_end.x * u).toFixed(2)),
        y: Number((divRight[idx].y + deltaR_end.y * u).toFixed(2)),
      };
    }

    // Connector elevation
    const divElevation: number[] = [];
    if (parentSegElev && parentElevation) {
      finalElevation.push(...parentSegElev);
      const elevExit = parentElevation[curRun.kExit];
      const elevEntry = parentElevation[curRun.kEntry];
      const dElevStart = telemElevation && telemElevation.length === N_telem ? elevExit - telemElevation[curRun.divStartT] : 0;
      const dElevEnd = telemElevation && telemElevation.length === N_telem ? elevEntry - telemElevation[curRun.divEndT] : 0;
      for (let i = 0; i < L; i++) {
        const frac = i / (L - 1 || 1);
        if (telemElevation && telemElevation.length === N_telem) {
          const rawElev = telemElevation[curRun.divStartT + i];
          divElevation.push(Number((rawElev + (1 - frac) * dElevStart + frac * dElevEnd).toFixed(3)));
        } else {
          divElevation.push(Number((elevExit * (1 - frac) + elevEntry * frac).toFixed(3)));
        }
      }
      finalElevation.push(...divElevation.slice(1, L - 1));
    }

    finalCenter.push(...parentSegCenter, ...divRoadCenter.slice(1, L - 1));
    finalLeft.push(...parentSegLeft, ...divLeft.slice(1, L - 1));
    finalRight.push(...parentSegRight, ...divRight.slice(1, L - 1));
  }

  const sharedPct = Number(((totalParentPoints / finalCenter.length) * 100).toFixed(1));

  return {
    centerline: finalCenter,
    left: finalLeft,
    right: finalRight,
    elevation: finalElevation.length === finalCenter.length ? finalElevation : undefined,
    sharedPct,
  };
}

export interface TrackSourceGeometry {
  finalCenter: Point2D[];
  finalLeft: Point2D[];
  finalRight: Point2D[];
  transformInfo: any;
  surveyAnchor: Point2D | null;
  elevationProfile?: number[];
  pitLaneData?: PitLaneData;
  pitStallsData?: PitStallData[];
  gridSlotsData?: GridSlotData[];
}

export async function buildTrackSourceGeometry(
  cfg: TrackConfig,
  lmu2D: Point2D[],
  lmuResampled: Point2D[],
  N_SAMPLE: number
): Promise<TrackSourceGeometry> {
  let finalCenter: Point2D[] = [];
  let finalLeft: Point2D[] = [];
  let finalRight: Point2D[] = [];
  let transformInfo: any = undefined;
  let surveyAnchor: Point2D | null = null;
  let elevationProfile: number[] | undefined = undefined;
  let pitLaneData: PitLaneData | undefined = undefined;
  let pitStallsData: PitStallData[] | undefined = undefined;
  let gridSlotsData: GridSlotData[] | undefined = undefined;

  if (cfg.sourceType === 'lmu_api') {
    const trackId = cfg.lmuTrackId || '4cdc72fe3acb2c912fd6cbd6828095625ba2d5a7';
    const trackmap = await loadNativeTrackmap(trackId);

    const t0 = trackmap.filter(p => p.type === 0);
    const t1 = trackmap.filter(p => p.type === 1);
    const rawStalls = trackmap.filter(p => p.type >= 2 && p.type < 100);
    const rawGrid = trackmap.filter(p => p.type >= 100);

    const nativeCenter: Point2D[] = t0.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.z.toFixed(2)) }));
    const rawElevation: number[] = t0.map(p => Number(p.y.toFixed(3)));

    transformInfo = {
      scale: 1.0,
      rotationDeg: 0.0,
      tx: 0.0,
      tz: 0.0,
      rmse: 0.0,
    };

    const m = nativeCenter.length;
    const cumDist: number[] = [0];
    for (let i = 0; i < m - 1; i++) {
      cumDist.push(cumDist[i] + Math.hypot(nativeCenter[i + 1].x - nativeCenter[i].x, nativeCenter[i + 1].y - nativeCenter[i].y));
    }

    const getHalfWidth = (s: number): number => {
      if (!cfg.sectionWidths || cfg.sectionWidths.length === 0) {
        return cfg.nominalWidthM / 2;
      }
      for (const sec of cfg.sectionWidths) {
        if (s >= sec.startM && s <= sec.endM) {
          return sec.widthM / 2;
        }
      }
      return cfg.nominalWidthM / 2;
    };

    const targetHalfWidths: number[] = [];
    for (let i = 0; i < m; i++) {
      targetHalfWidths.push(getHalfWidth(cumDist[i]));
    }
    const smoothHalfWidths: number[] = [];
    const HW_WINDOW = 8;
    for (let i = 0; i < m; i++) {
      let sum = 0;
      let count = 0;
      for (let w = -HW_WINDOW; w <= HW_WINDOW; w++) {
        const idx = (i + w + m) % m;
        sum += targetHalfWidths[idx];
        count++;
      }
      smoothHalfWidths.push(sum / count);
    }

    const rawOffsets: number[] = [];
    for (let i = 0; i < m; i++) {
      const prev = nativeCenter[(i - 2 + m) % m];
      const cur = nativeCenter[i];
      const next = nativeCenter[(i + 2) % m];
      const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y;
      const dx2 = next.x - cur.x, dy2 = next.y - cur.y;
      const a1 = Math.atan2(dy1, dx1), a2 = Math.atan2(dy2, dx2);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const ds = (Math.hypot(dx1, dy1) + Math.hypot(dx2, dy2)) / 2;
      const kCurv = diff / (ds || 1);

      const maxShift = Math.max(0, smoothHalfWidths[i] - 2.8);
      const shift = -Math.tanh(kCurv * 80) * maxShift;
      rawOffsets.push(shift);
    }

    const smoothOffsets: number[] = [];
    const SHIFT_WINDOW = 5;
    for (let i = 0; i < m; i++) {
      let sum = 0, count = 0;
      for (let w = -SHIFT_WINDOW; w <= SHIFT_WINDOW; w++) {
        sum += rawOffsets[(i + w + m) % m];
        count++;
      }
      smoothOffsets.push(sum / count);
    }

    const roadCenter: Point2D[] = [];
    const lmuLeft: Point2D[] = [];
    const lmuRight: Point2D[] = [];
    for (let i = 0; i < m; i++) {
      const prev = nativeCenter[(i - 1 + m) % m];
      const next = nativeCenter[(i + 1) % m];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const offset = smoothOffsets[i];
      const cx = nativeCenter[i].x + nx * offset;
      const cy = nativeCenter[i].y + ny * offset;
      roadCenter.push({
        x: Number(cx.toFixed(2)),
        y: Number(cy.toFixed(2)),
      });

      const hw = smoothHalfWidths[i];
      lmuLeft.push({
        x: Number((cx + nx * hw).toFixed(2)),
        y: Number((cy + ny * hw).toFixed(2)),
      });
      lmuRight.push({
        x: Number((cx - nx * hw).toFixed(2)),
        y: Number((cy - ny * hw).toFixed(2)),
      });
    }

    finalCenter = roadCenter;
    finalLeft = lmuLeft;
    finalRight = lmuRight;
    elevationProfile = rawElevation;

    if (t1.length > 0) {
      pitLaneData = {
        centerline: t1.map(p => [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]),
        elevation: t1.map(p => Number(p.y.toFixed(3))),
      };
    }

    if (rawStalls.length > 0) {
      const stallsByType = new Map<number, NativeTrackPoint[]>();
      for (const p of rawStalls) {
        if (!stallsByType.has(p.type)) stallsByType.set(p.type, []);
        stallsByType.get(p.type)!.push(p);
      }
      pitStallsData = [];
      for (const [typeId, pts] of stallsByType.entries()) {
        if (pts.length >= 2) {
          const cx = (pts[0].x + pts[1].x) / 2;
          const cz = (pts[0].z + pts[1].z) / 2;
          const w = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
          const angle = Math.atan2(pts[1].z - pts[0].z, pts[1].x - pts[0].x) * 180 / Math.PI;
          pitStallsData.push({
            id: typeId,
            center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
            widthM: Number(w.toFixed(2)),
            angleDeg: Number(angle.toFixed(1)),
          });
        }
      }
    }

    if (rawGrid.length > 0) {
      const gridByType = new Map<number, NativeTrackPoint[]>();
      for (const p of rawGrid) {
        if (!gridByType.has(p.type)) gridByType.set(p.type, []);
        gridByType.get(p.type)!.push(p);
      }
      gridSlotsData = [];
      for (const [typeId, pts] of gridByType.entries()) {
        if (pts.length >= 2) {
          const cx = (pts[0].x + pts[1].x) / 2;
          const cz = (pts[0].z + pts[1].z) / 2;
          gridSlotsData.push({
            slot: typeId,
            center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
          });
        }
      }
    }

    const anchorIdx = cfg.sfCenterIndex !== undefined ? cfg.sfCenterIndex : (cfg.layoutKey === 'sarthe_full' ? 206 : 0);
    surveyAnchor = nativeCenter[anchorIdx] || nativeCenter[0];
    console.log(`LMU API native ground truth: ${finalCenter.length} center pts, S/F anchor index ${anchorIdx}, pit lane: ${t1.length} pts, stalls: ${pitStallsData?.length || 0}, grid: ${gridSlotsData?.length || 0}`);

  } else if (cfg.sourceType === 'TUM') {
    const tumPath = await ensureSourceFile(cfg);
    const tumPts = parseTumCsv(fs.readFileSync(tumPath, 'utf8'));

    const tumCenter: Point2D[] = [];
    const tumLeft: Point2D[] = [];
    const tumRight: Point2D[] = [];
    const m = tumPts.length;

    for (let i = 0; i < m; i++) {
      const prev = tumPts[(i - 1 + m) % m];
      const next = tumPts[(i + 1) % m];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;

      tumCenter.push({ x: tumPts[i].x, y: tumPts[i].y });
      tumLeft.push({ x: tumPts[i].x + nx * tumPts[i].wLeft, y: tumPts[i].y + ny * tumPts[i].wLeft });
      tumRight.push({ x: tumPts[i].x - nx * tumPts[i].wRight, y: tumPts[i].y - ny * tumPts[i].wRight });
    }

    const variants = [
      { name: 'normal', pts: tumCenter },
      { name: 'flipY', pts: tumCenter.map(p => ({ x: p.x, y: -p.y })) },
      { name: 'reversed', pts: [...tumCenter].reverse() },
      { name: 'reversed_flipY', pts: [...tumCenter].reverse().map(p => ({ x: p.x, y: -p.y })) },
      { name: 'flipX', pts: tumCenter.map(p => ({ x: -p.x, y: p.y })) },
      { name: 'reversed_flipX', pts: [...tumCenter].reverse().map(p => ({ x: -p.x, y: p.y })) },
    ];

    let bestVariant = variants[0];
    let bestShift = 0, minRmse = Infinity, bestTransform: any = null;

    for (const v of variants) {
      const vRes = resamplePolyline(v.pts, N_SAMPLE);
      for (let s = 0; s < N_SAMPLE; s += 2) {
        const shifted = [];
        for (let i = 0; i < N_SAMPLE; i++) shifted.push(vRes[(i + s) % N_SAMPLE]);
        const t = findSimilarityTransform(shifted, lmuResampled);
        if (t.rmse < minRmse) {
          minRmse = t.rmse;
          bestShift = s;
          bestTransform = t;
          bestVariant = v;
        }
      }
    }

    const cosT = Math.cos(bestTransform.rotationRad);
    const sinT = Math.sin(bestTransform.rotationRad);
    const scale = bestTransform.scale;
    const tx = bestTransform.tx;
    const ty = bestTransform.ty;

    const applyTransform = (p: Point2D): Point2D => {
      let x = p.x, y = p.y;
      if (bestVariant.name.includes('flipY')) y = -y;
      if (bestVariant.name.includes('flipX')) x = -x;
      return {
        x: Number((scale * (cosT * x - sinT * y) + tx).toFixed(2)),
        y: Number((scale * (sinT * x + cosT * y) + ty).toFixed(2)),
      };
    };

    let orientedCenter = tumCenter;
    let orientedLeft = tumLeft;
    let orientedRight = tumRight;
    if (bestVariant.name.startsWith('reversed')) {
      orientedCenter = [...tumCenter].reverse();
      orientedLeft = [...tumLeft].reverse();
      orientedRight = [...tumRight].reverse();
    }

    finalCenter = orientedCenter.map(applyTransform);
    finalLeft = orientedLeft.map(applyTransform);
    finalRight = orientedRight.map(applyTransform);

    surveyAnchor = applyTransform(tumCenter[0]);

    transformInfo = {
      scale: Number(scale.toFixed(5)),
      rotationDeg: Number((bestTransform.rotationRad * 180 / Math.PI).toFixed(2)),
      tx: Number(tx.toFixed(2)),
      tz: Number(ty.toFixed(2)),
      rmse: Number(bestTransform.rmse.toFixed(2)),
    };

    console.log(`TUM Alignment: scale=${transformInfo.scale}, rot=${transformInfo.rotationDeg}°, rmse=${transformInfo.rmse}m`);

    if (cfg.lmuTrackId) {
      try {
        const trackmap = await loadNativeTrackmap(cfg.lmuTrackId);
        const t0 = trackmap.filter(p => p.type === 0);
        const t1 = trackmap.filter(p => p.type === 1);
        const rawStalls = trackmap.filter(p => p.type >= 2 && p.type < 100);
        const rawGrid = trackmap.filter(p => p.type >= 100);

        if (t1.length > 0) {
          pitLaneData = {
            centerline: t1.map(p => [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]),
            elevation: t1.map(p => Number(p.y.toFixed(3))),
          };
        }

        if (rawStalls.length > 0) {
          const stallsByType = new Map<number, NativeTrackPoint[]>();
          for (const p of rawStalls) {
            if (!stallsByType.has(p.type)) stallsByType.set(p.type, []);
            stallsByType.get(p.type)!.push(p);
          }
          pitStallsData = [];
          for (const [typeId, pts] of stallsByType.entries()) {
            if (pts.length >= 2) {
              const cx = (pts[0].x + pts[1].x) / 2;
              const cz = (pts[0].z + pts[1].z) / 2;
              const w = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
              const angle = Math.atan2(pts[1].z - pts[0].z, pts[1].x - pts[0].x) * 180 / Math.PI;
              pitStallsData.push({
                id: typeId,
                center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
                widthM: Number(w.toFixed(2)),
                angleDeg: Number(angle.toFixed(1)),
              });
            }
          }
        }

        if (rawGrid.length > 0) {
          const gridByType = new Map<number, NativeTrackPoint[]>();
          for (const p of rawGrid) {
            if (!gridByType.has(p.type)) gridByType.set(p.type, []);
            gridByType.get(p.type)!.push(p);
          }
          gridSlotsData = [];
          for (const [typeId, pts] of gridByType.entries()) {
            if (pts.length >= 2) {
              const cx = (pts[0].x + pts[1].x) / 2;
              const cz = (pts[0].z + pts[1].z) / 2;
              gridSlotsData.push({
                slot: typeId,
                center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
              });
            }
          }
        }

        if (t0.length > 0) {
          elevationProfile = [];
          for (let i = 0; i < finalCenter.length; i++) {
            let minD = Infinity, bestY = 0;
            for (const p of t0) {
              const d = Math.hypot(finalCenter[i].x - p.x, finalCenter[i].y - p.z);
              if (d < minD) { minD = d; bestY = p.y; }
            }
            elevationProfile.push(Number(bestY.toFixed(3)));
          }
        }

        console.log(`[${cfg.layoutKey}] Enriched TUM survey with native trackmap pit infrastructure (pit: ${t1.length} pts, stalls: ${pitStallsData?.length || 0}, grid: ${gridSlotsData?.length || 0}) and 3D elevation`);
      } catch (err) {
        console.warn(`[${cfg.layoutKey}] Could not load native trackmap infrastructure for TUM layout:`, err);
      }
    }

  } else if (cfg.sourceType === 'atlas' || cfg.sourceType === 'osm') {
    const atlasPath = await ensureSourceFile(cfg);
    const geojson = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
    const feature0 = geojson.features.find((f: any) => f.geometry.type === 'LineString') || geojson.features[0];
    const coords: Array<[number, number]> = feature0.geometry.coordinates;

    const rawMeters = gpsToLocalMeters(coords);
    const smoothCenter = smoothPolyline(resampleStep(rawMeters, 2.5), 5);
    const corridor = computeCorridorBoundaries(smoothCenter, cfg.nominalWidthM / 2);

    const variants = [
      { name: 'normal', pts: smoothCenter },
      { name: 'flipY', pts: smoothCenter.map(p => ({ x: p.x, y: -p.y })) },
      { name: 'reversed', pts: [...smoothCenter].reverse() },
      { name: 'reversed_flipY', pts: [...smoothCenter].reverse().map(p => ({ x: p.x, y: -p.y })) },
      { name: 'flipX', pts: smoothCenter.map(p => ({ x: -p.x, y: p.y })) },
      { name: 'reversed_flipX', pts: [...smoothCenter].reverse().map(p => ({ x: -p.x, y: p.y })) },
    ];

    let bestVariant = variants[0];
    let bestShift = 0, minRmse = Infinity, bestTransform: any = null;

    for (const v of variants) {
      const vRes = resamplePolyline(v.pts, N_SAMPLE);
      for (let s = 0; s < N_SAMPLE; s += 2) {
        const shifted = [];
        for (let i = 0; i < N_SAMPLE; i++) shifted.push(vRes[(i + s) % N_SAMPLE]);
        const t = findSimilarityTransform(shifted, lmuResampled);
        if (t.rmse < minRmse) {
          minRmse = t.rmse;
          bestShift = s;
          bestTransform = t;
          bestVariant = v;
        }
      }
    }

    const cosT = Math.cos(bestTransform.rotationRad);
    const sinT = Math.sin(bestTransform.rotationRad);
    const scale = bestTransform.scale;
    const tx = bestTransform.tx;
    const ty = bestTransform.ty;

    const applyTransform = (p: Point2D): Point2D => {
      let x = p.x, y = p.y;
      if (bestVariant.name.includes('flipY')) y = -y;
      if (bestVariant.name.includes('flipX')) x = -x;
      return {
        x: Number((scale * (cosT * x - sinT * y) + tx).toFixed(2)),
        y: Number((scale * (sinT * x + cosT * y) + ty).toFixed(2)),
      };
    };

    let orientedCenter = smoothCenter;
    let orientedLeft = corridor.left;
    let orientedRight = corridor.right;
    if (bestVariant.name.startsWith('reversed')) {
      orientedCenter = [...smoothCenter].reverse();
      orientedLeft = [...corridor.left].reverse();
      orientedRight = [...corridor.right].reverse();
    }

    finalCenter = orientedCenter.map(applyTransform);
    finalLeft = orientedLeft.map(applyTransform);
    finalRight = orientedRight.map(applyTransform);

    transformInfo = {
      scale: Number(scale.toFixed(5)),
      rotationDeg: Number((bestTransform.rotationRad * 180 / Math.PI).toFixed(2)),
      tx: Number(tx.toFixed(2)),
      tz: Number(ty.toFixed(2)),
      rmse: Number(bestTransform.rmse.toFixed(2)),
    };

    console.log(`Atlas Alignment: scale=${transformInfo.scale}, rot=${transformInfo.rotationDeg}°, rmse=${transformInfo.rmse}m`);

  } else if (cfg.sourceType === 'hybrid') {
    const parentFile = path.resolve('server/data/tracks', `${cfg.parentLayoutKey}.json`);
    if (!fs.existsSync(parentFile)) {
      throw new Error(`Parent track geometry not found for hybrid layout: ${parentFile}`);
    }
    const parentGeom = JSON.parse(fs.readFileSync(parentFile, 'utf8'));

    let hybridInput2D = lmu2D;
    let telemElevation: number[] | undefined = undefined;
    let childPitLane: PitLaneData | undefined = undefined;
    let childStalls: PitStallData[] | undefined = undefined;
    let childGrid: GridSlotData[] | undefined = undefined;

    if (cfg.lmuTrackId) {
      try {
        const childMap = await loadNativeTrackmap(cfg.lmuTrackId);
        const t0 = childMap.filter(p => p.type === 0);
        if (t0.length > 0) {
          hybridInput2D = t0.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.z.toFixed(2)) }));
          telemElevation = t0.map(p => Number(p.y.toFixed(3)));
          console.log(`[${cfg.layoutKey}] Sourced child divergent trajectory from native LMU API ground truth (${t0.length} pts)`);
        }
        const t1 = childMap.filter(p => p.type === 1);
        if (t1.length > 0) {
          childPitLane = {
            centerline: t1.map(p => [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]),
            elevation: t1.map(p => Number(p.y.toFixed(3))),
          };
        }
        const rawStalls = childMap.filter(p => p.type >= 2 && p.type < 100);
        if (rawStalls.length > 0) {
          const stallsByType = new Map<number, NativeTrackPoint[]>();
          for (const p of rawStalls) {
            if (!stallsByType.has(p.type)) stallsByType.set(p.type, []);
            stallsByType.get(p.type)!.push(p);
          }
          childStalls = [];
          for (const [typeId, pts] of stallsByType.entries()) {
            if (pts.length >= 2) {
              const cx = (pts[0].x + pts[1].x) / 2;
              const cz = (pts[0].z + pts[1].z) / 2;
              const w = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
              const angle = Math.atan2(pts[1].z - pts[0].z, pts[1].x - pts[0].x) * 180 / Math.PI;
              childStalls.push({
                id: typeId,
                center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
                widthM: Number(w.toFixed(2)),
                angleDeg: Number(angle.toFixed(1)),
              });
            }
          }
        }
        const rawGrid = childMap.filter(p => p.type >= 100);
        if (rawGrid.length > 0) {
          const gridByType = new Map<number, NativeTrackPoint[]>();
          for (const p of rawGrid) {
            if (!gridByType.has(p.type)) gridByType.set(p.type, []);
            gridByType.get(p.type)!.push(p);
          }
          childGrid = [];
          for (const [typeId, pts] of gridByType.entries()) {
            if (pts.length >= 2) {
              const cx = (pts[0].x + pts[1].x) / 2;
              const cz = (pts[0].z + pts[1].z) / 2;
              childGrid.push({
                slot: typeId,
                center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[${cfg.layoutKey}] Could not load LMU API map for child layout:`, err);
      }
    }

    const hybrid = synthesizeHybridTrack(
      parentGeom,
      hybridInput2D,
      cfg.nominalWidthM,
      12.0,
      parentGeom.elevationProfile,
      telemElevation
    );

    finalCenter = hybrid.centerline.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }));
    finalLeft = hybrid.left.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }));
    finalRight = hybrid.right.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }));
    elevationProfile = hybrid.elevation ?? parentGeom.elevationProfile;

    pitLaneData = childPitLane ?? parentGeom.pitLane;
    pitStallsData = childStalls ?? parentGeom.pitStalls;
    gridSlotsData = childGrid ?? parentGeom.gridSlots;

    if (parentGeom.startFinish) {
      surveyAnchor = { x: parentGeom.startFinish[0], y: parentGeom.startFinish[1] };
    } else if (parentGeom.timingGates?.startFinish?.center) {
      surveyAnchor = { x: parentGeom.timingGates.startFinish.center[0], y: parentGeom.timingGates.startFinish.center[1] };
    }

    transformInfo = {
      scale: 1.0,
      rotationDeg: 0.0,
      tx: 0.0,
      tz: 0.0,
      rmse: 0.0,
    };

    console.log(`Hybrid Synthesis: ${hybrid.sharedPct}% anchored to parent survey [${cfg.parentLayoutKey}] (${parentGeom.source})`);

  } else {
    const stepCenter = smoothPolyline(resampleStep(lmu2D, 2.5), 7);
    const corridor = computeCorridorBoundaries(stepCenter, cfg.nominalWidthM / 2);

    finalCenter = stepCenter.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }));
    finalLeft = corridor.left;
    finalRight = corridor.right;

    transformInfo = {
      scale: 1.0,
      rotationDeg: 0.0,
      tx: 0.0,
      tz: 0.0,
      rmse: 0.0,
    };

    console.log(`Telemetry Corridor: direct 1:1 LMU native space with ${cfg.nominalWidthM}m width profile`);
  }

  return {
    finalCenter,
    finalLeft,
    finalRight,
    transformInfo,
    surveyAnchor,
    elevationProfile,
    pitLaneData,
    pitStallsData,
    gridSlotsData,
  };
}
