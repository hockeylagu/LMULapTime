import { useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import { computeBaselineChartSamples, type PointComparison } from '../../../../utils/replayComparison.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { usePlaybackPosition } from '../../inspector/replayPlaybackCursor.js';
import { computeTelemetryChartPaths } from '../../telemetry/telemetryChartPaths.js';
import { TelemetryChannelRenderer } from '../../telemetry/TelemetryChannelRenderer.js';
import { TelemetryScrubCursor } from '../../telemetry/TelemetryScrubCursor.js';
import { useTelemetryStripInteraction } from '../../telemetry/useTelemetryStripInteraction.js';
import { AVAILABLE_TELEMETRY_CHANNELS, type TelemetryChannelId } from '../../telemetry/presets/telemetryPresets.js';
import { GpsMapCompactTrace } from './GpsMapCompactTrace.js';
import { GpsMapPlaybackStrip } from './GpsMapPlaybackStrip.js';
import { TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { Select } from '../../../common/dropdown/Select.js';

const CHANNEL_KEY = 'lmu-map-trace-channel-v1';
type Channel = TelemetryChannelId | 'pedals';
const NO_COMPARISONS: PointComparison[] = [];

function loadChannel(): Channel {
  try {
    const saved = localStorage.getItem(CHANNEL_KEY);
    if (saved === 'pedals' || AVAILABLE_TELEMETRY_CHANNELS.some(channel => channel.id === saved)) return saved as Channel;
  } catch { /* Storage may be disabled. */ }
  return 'speed';
}

interface Props {
  points: ReplayTrajectoryPoint[];
  baselinePoints?: ReplayTrajectoryPoint[];
  /** The scene's primary-vs-baseline comparisons, shared rather than recomputed here. */
  comparisons?: PointComparison[] | null;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  trackLengthM?: number;
  source?: 'vcr' | 'duckdb';
  sectors?: ReplayTrajectoryData['sectors'];
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  /** Owned by the scene, so the T shortcut and this button share one remembered state. */
  traceHidden: boolean;
  onToggleTrace: () => void;
  hud?: ReactNode;
}

/** One short trace, independent of the inspector's full telemetry presets. */
export function GpsMapTelemetryDock({ points, baselinePoints, comparisons: sceneComparisons, currentIndex, onSelectIndex, trackLengthM, source, sectors,
  isPlaying, onTogglePlay, traceHidden: collapsed, onToggleTrace, hud }: Props) {
  const [channel, setChannel] = useState(loadChannel);
  const contentId = useId();
  const hasBaseline = Boolean(baselinePoints?.length);
  // Keep the saved comparison choice, but show speed while there is no reference lap.
  const activeChannel = channel === 'delta' && !hasBaseline ? 'speed' : channel;
  const interaction = useTelemetryStripInteraction({ points, currentIndex, onSelectIndex, trackLengthM, enabled: !collapsed });
  const { viewStart, viewEnd, cumDists, safeIndex, pctForIndex } = interaction;
  const playback = usePlaybackPosition(points, currentIndex);
  const index = playback?.index ?? safeIndex;
  const cursorPct = pctForIndex(index) + (playback?.fraction ?? 0)
    * (pctForIndex(Math.min(index + 1, points.length - 1)) - pctForIndex(index));
  const isCursorInView = index >= viewStart && index <= viewEnd;
  const fraction = playback?.fraction ?? 0;
  const elapsedSec = (playback?.timeSec ?? points[index]?.timeSec ?? 0) - (points[0]?.timeSec ?? 0);
  const distanceM = (cumDists[index] ?? 0) + ((cumDists[index + 1] ?? cumDists[index] ?? 0) - (cumDists[index] ?? 0)) * fraction;
  // Same rule as the main strip: a line only inside the visible range, never at the lap ends.
  const sectorLines = sectors ? [
    { label: 'S1', frame: sectors.s1Frame, line: 'bg-lmu-gold/50', tag: 'bg-lmu-gold/20 text-lmu-gold' },
    { label: 'S2', frame: sectors.s2Frame, line: 'bg-lmu-blue/50', tag: 'bg-lmu-blue/20 text-lmu-cyan' },
  ].filter(sector => sector.frame > viewStart && sector.frame < viewEnd) : [];
  const comparisons = sceneComparisons ?? NO_COMPARISONS;
  const baselineSamples = useMemo(() => baselinePoints?.length
    ? computeBaselineChartSamples(points, baselinePoints, trackLengthM, cumDists) : undefined,
  [points, baselinePoints, trackLengthM, cumDists]);
  const paths = useMemo(() => computeTelemetryChartPaths(points, comparisons, viewStart, viewEnd, cumDists, baselineSamples),
    [points, comparisons, viewStart, viewEnd, cumDists, baselineSamples]);
  const compactChannel = activeChannel === 'speed' || activeChannel === 'pedals' || activeChannel === 'delta';
  const selectChannel = (next: Channel) => {
    setChannel(next);
    try { localStorage.setItem(CHANNEL_KEY, next); } catch { /* Storage may be disabled. */ }
  };
  const buttonClass = `inline-flex h-7 items-center gap-1.5 rounded px-2 text-[11px] text-lmu-muted hover:text-lmu-text hover:bg-lmu-raised transition-colors ${FOCUS_RING}`;

  return <section aria-label="Fullscreen telemetry" data-map-control
    className="w-full shrink-0 border-t border-lmu-border bg-lmu-strip cursor-default"
    onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()}
    onPointerUp={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    {hud}
    <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1">
      <div role="group" aria-label="Quick telemetry traces" className="flex shrink-0 items-center gap-1">
        {([
          { value: 'speed', label: 'Speed' },
          { value: 'delta', label: 'Delta' },
          { value: 'pedals', label: 'Throttle + Brake' },
        ] as const).map(item => <button key={item.value} type="button"
          aria-pressed={activeChannel === item.value} disabled={item.value === 'delta' && !hasBaseline}
          title={item.value === 'delta' && !hasBaseline ? 'Select a comparison lap to show delta' : `Show ${item.label.toLowerCase()} trace`}
          onClick={() => selectChannel(item.value)}
          className={`${buttonClass} font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${activeChannel === item.value ? 'bg-lmu-raised text-lmu-text' : ''}`}>
          {item.label}
        </button>)}
        <Select<TelemetryChannelId> value={compactChannel ? null : activeChannel} aria-label="More telemetry channels"
          placeholder="More" title="More telemetry channels" className={compactChannel ? 'w-24' : 'w-48'} align="start"
          onChange={selectChannel}
          options={AVAILABLE_TELEMETRY_CHANNELS.filter(item => item.id !== 'speed' && item.id !== 'delta')
            .map(item => ({ value: item.id, label: item.name }))} />
      </div>
      <span aria-hidden="true" className="h-5 w-px bg-lmu-border" />
      {!collapsed && <>
        <button type="button" className={`${buttonClass} ${interaction.interactionMode === 'zoom' ? 'bg-lmu-raised text-lmu-text' : ''}`} aria-pressed={interaction.interactionMode === 'zoom'}
          title="Select a range by dragging. Shift-drag also selects a range; double-click restores the full lap."
          onClick={() => interaction.setInteractionMode(mode => mode === 'scrub' ? 'zoom' : 'scrub')}>
          Zoom range
        </button>
        {interaction.isZoomed && <button type="button" className={buttonClass}
          onClick={interaction.handleResetZoom}>Full lap</button>}
        {activeChannel === 'pedals' && <span className="flex gap-3 text-[10px] text-lmu-muted">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-3 border-t-2" style={{ borderColor: TELEMETRY_COLORS.throttle }} />Throttle</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-3 border-t-2" style={{ borderColor: TELEMETRY_COLORS.brake }} />Brake</span>
        </span>}
        {activeChannel === 'delta' && <span className="text-[10px] text-lmu-muted" title="Green shading shows time gained; red shading shows time lost.">− ahead / + behind</span>}
      </>}
      <div className="ml-auto flex shrink-0 items-center gap-3">
      <GpsMapPlaybackStrip isPlaying={isPlaying} onTogglePlay={onTogglePlay} elapsedSec={elapsedSec} distanceM={distanceM} />
      <button type="button" className={buttonClass}
        aria-label={collapsed ? 'Show telemetry trace' : 'Hide telemetry trace'} aria-expanded={!collapsed} aria-controls={contentId}
        title={collapsed ? 'Show trace (T)' : 'Hide trace (T)'} aria-keyshortcuts="T" onClick={onToggleTrace}>
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{collapsed ? 'Show trace' : 'Hide trace'}
      </button>
      </div>
    </div>
    <div id={contentId} ref={interaction.containerRef} tabIndex={0} data-replay-surface="chart" style={collapsed ? { display: 'none' } : undefined}
      aria-label="Fullscreen telemetry chart" className={`group/trace relative flex h-28 flex-col cursor-crosshair outline-none ${compactChannel ? 'ml-14 mr-4' : 'overflow-hidden'}`}
      onPointerDown={interaction.handlePointerDown} onPointerMove={interaction.handlePointerMove}
      onPointerUp={interaction.handlePointerUp} onPointerCancel={interaction.handlePointerCancel}
      onDoubleClick={interaction.handleResetZoom}
      onKeyDown={event => {
        if (event.key === ' ') { event.preventDefault(); onTogglePlay?.(); }
      }}>
      {/* Inset keyboard-focus corners stay visible at the screen edge without framing the data. */}
      <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-20 hidden h-3 w-3 border-l-2 border-t-2 border-lmu-accent-text group-focus-visible/trace:block" />
      <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 z-20 hidden h-3 w-3 border-r-2 border-t-2 border-lmu-accent-text group-focus-visible/trace:block" />
      {activeChannel === 'speed' || activeChannel === 'pedals' || activeChannel === 'delta'
        ? <GpsMapCompactTrace channel={activeChannel} paths={paths} /> : <TelemetryChannelRenderer channelId={activeChannel} paths={paths} points={points} source={source}
        currentPoint={points[index]} currentComparison={comparisons[index]} pointComparisons={comparisons}
        isCursorInView={isCursorInView} cursorPct={cursorPct} cumDists={cumDists} viewStart={viewStart} viewEnd={viewEnd} />}
      {sectorLines.map(sector => <div key={sector.label} data-testid={`trace-sector-${sector.label}`} style={{ left: `${pctForIndex(sector.frame)}%` }}
        className={`absolute inset-y-0 z-10 w-px pointer-events-none ${sector.line}`}>
        <span className={`absolute top-1 left-1 rounded px-1 py-0.5 font-mono text-[10px] font-bold ${sector.tag}`}>{sector.label}</span>
      </div>)}
      {isCursorInView && <TelemetryScrubCursor cursorPct={cursorPct} />}
      {interaction.dragSelection && <div className="absolute inset-y-0 bg-lmu-info-strong/25 border-x border-lmu-info pointer-events-none"
        style={{ left: `${Math.min(interaction.dragSelection.startPct, interaction.dragSelection.currentPct)}%`,
          width: `${Math.abs(interaction.dragSelection.currentPct - interaction.dragSelection.startPct)}%` }} />}
    </div>
  </section>;
}
