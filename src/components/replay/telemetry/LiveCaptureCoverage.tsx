import type { LiveCaptureOverlay } from '../../../../shared/types/liveEvidence.js';

/** Coverage describes the served chart points, not a claim of continuous raw recording. */
export function LiveCaptureCoverage({ overlay }: { overlay?: LiveCaptureOverlay }) {
  if (!overlay) return null;
  if (overlay.state !== 'applied') return <span className="text-[10px] text-lmu-muted" title={overlay.message}>Live capture unavailable</span>;
  const percent = (count: number) => overlay.totalPoints ? Math.round(100 * count / overlay.totalPoints) : 0;
  const title = `Live measurements at ${overlay.yawPoints}/${overlay.totalPoints} yaw points; body slip from live velocity at ${overlay.slipPoints}/${overlay.totalPoints} points. `
    + `Other points use computed estimates. Nearest source sample only, within 25 ms; no interpolation of live values. `
    + `${overlay.captureGaps} raw capture gaps; ${overlay.recordingDroppedSamples} dropped samples across the recording. `
    + `Recording ${overlay.recordingId}; XML patch ${overlay.gameVersion ?? 'unknown'}; normalization v${overlay.normalizationVersion}.`;
  return <span className="text-[10px] font-mono text-lmu-aqua-soft" title={title}>
    Live capture: yaw {percent(overlay.yawPoints)}% · beta {percent(overlay.slipPoints)}%
  </span>;
}
