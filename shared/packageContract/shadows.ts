// Copied from LMUTrackPipeline/shared/contract/shadows.ts, do not edit: change it there and run npm run package -- sync-contract.
/** The cascaded sun shadow block `shading.shadows` of the rendering profiles: the split scheme and the checks of a published block (docs/SCENE_PACKAGE.md, Shadows). */

/**
 * Practical split scheme (the CAM shadow-range keys): split_i = λ·n·(f/n)^(i/N) + (1 − λ)·(n + (f − n)·i/N), i = 1..N.
 * Rounded to 1 mm so the published numbers do not depend on the floating point evaluation.
 */
export function resolveShadowSplits(nearM: number, farM: number, splitRatio: number, count: number): number[] {
  if (!(nearM > 0 && farM > nearM && splitRatio >= 0 && splitRatio <= 1 && Number.isInteger(count) && count > 0)) throw Error('Shadow splits need 0 < near < far, a ratio in [0, 1] and a cascade count');
  return Array.from({length: count}, (_, index) => {
    const i = index + 1;
    return Math.round((splitRatio * nearM * (farM / nearM) ** (i / count) + (1 - splitRatio) * (nearM + (farM - nearM) * i / count)) * 1000) / 1000;
  });
}

/** Problems in a published `shading.shadows` block; empty when it is well formed and its splits follow the scheme. */
export function shadowProblems(shadows: any): string[] {
  if (!shadows || typeof shadows !== 'object') return ['shading.shadows is missing'];
  const problems: string[] = [], number = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  const atlas = shadows.atlas;
  if (!(atlas && number(atlas.count) && number(atlas.sizePx) && number(atlas.tilePx) && Array.isArray(atlas.cascadeTiles))) problems.push('atlas is incomplete');
  else {
    if (atlas.cascadeTiles.length !== 6) problems.push('atlas.cascadeTiles is not six cascades');
    for (const tile of atlas.cascadeTiles) {
      const ok = Array.isArray(tile) && tile.length === 3 && tile.every(Number.isInteger) && tile[0] >= 0 && tile[0] < atlas.count
        && tile[1] >= 0 && tile[2] >= 0 && tile[1] + atlas.tilePx <= atlas.sizePx && tile[2] + atlas.tilePx <= atlas.sizePx;
      if (!ok) problems.push(`atlas tile ${JSON.stringify(tile)} is not inside the atlas`);
    }
  }
  if (shadows.select?.method !== 'firstContainingTile' || !number(shadows.select?.halfExtent)) problems.push('select is incomplete');
  const filter = shadows.filter;
  if (!(filter && typeof filter.hardwarePcf === 'boolean' && number(filter.texelSize) && number(filter.scale) && Array.isArray(filter.taps) && filter.taps.length)) problems.push('filter is incomplete');
  else {
    const total = filter.taps.reduce((sum: number, tap: any) => sum + (number(tap?.weight) ? tap.weight : NaN), 0) * filter.scale;
    if (!(Math.abs(total - 1) < 1e-9)) problems.push(`filter weights times scale are ${total}, not 1`);
    for (const tap of filter.taps) if (!(Array.isArray(tap?.offset) && tap.offset.length === 2 && tap.offset.every(number))) problems.push('filter tap has no offset');
  }
  if (!number(shadows.normalOffset?.scale) || shadows.normalOffset?.by !== 'normalShadowInfluence') problems.push('normalOffset is incomplete');
  if (typeof shadows.texelSnap !== 'boolean') problems.push('texelSnap is not a boolean');
  if (shadows.fit?.shape !== 'square' || !number(shadows.fit?.widthPerSplit)) problems.push('fit is incomplete');
  if (typeof shadows.fade?.endsAtFar !== 'boolean' || !number(shadows.fade?.lengthOfLastSpan)) problems.push('fade is incomplete');
  const centre = shadows.centre, orientation = shadows.orientation;
  if (!(centre && centre.along === 'viewForward' && centre.at === 'sliceMidpoint' && centre.firstSliceStartsAt === 'nearM' && Object.keys(centre).length === 3)) problems.push('centre is not the slice-midpoint rule');
  if (!(orientation && orientation.followsView === false && orientation.u === 'horizontalAcrossSun' && orientation.v === 'sunVerticalPlane' && Object.keys(orientation).length === 3)) problems.push('orientation is not the sun-aligned rule');
  const cameras = shadows.cameras;
  if (!cameras || Object.keys(cameras).sort().join() !== 'chase,cockpit,tv') problems.push('cameras are not {chase, cockpit, tv}');
  else for (const [name, set] of Object.entries<any>(cameras)) {
    const far = number(set?.farM) && number(set?.farScale) ? set.farM * set.farScale : NaN;
    if (!number(set?.nearM) || !(set.nearM > 0 && far > set.nearM)) { problems.push(`${name}: near and far are not 0 < near < farScale · farM`); continue; }
    if (!(number(set.splitRatio) && set.splitRatio >= 0 && set.splitRatio <= 1 && Number.isInteger(set.count) && set.count > 0)) { problems.push(`${name}: no split ratio or cascade count`); continue; }
    if (!(Array.isArray(set.depthBias) && set.depthBias.length === set.count && set.depthBias.every((value: unknown) => number(value) && (value as number) >= 0))) problems.push(`${name}: depthBias is not one value per cascade`);
    if (!(number(set.slopeBias) && number(set.biasClamp))) problems.push(`${name}: slopeBias or biasClamp is missing`);
    if (set.splitsM === null) continue;
    if (!(Array.isArray(set.splitsM) && set.splitsM.length === set.count)) { problems.push(`${name}: splits do not match the count`); continue; }
    const expected = resolveShadowSplits(set.nearM, far, set.splitRatio, set.count);
    if (expected.some((value, index) => value !== set.splitsM[index])) problems.push(`${name}: splits differ from the split scheme`);
    if (set.splitsM[set.count - 1] !== far) problems.push(`${name}: the last split is not the far distance`);
  }
  return problems;
}
