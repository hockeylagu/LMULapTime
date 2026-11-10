import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import type { PointComparison } from '../../../../utils/replayComparison.js';

interface Props {
  channel: 'speed' | 'pedals' | 'delta';
  point: ReplayTrajectoryPoint | undefined;
  comparison: PointComparison | undefined;
  cursorPct: number;
}

const CHIP = 'px-2 py-0.5 rounded-md bg-lmu-badge font-mono font-bold text-[11px] shadow-marker-lift whitespace-nowrap border';
const signed = (value: number, digits = 0) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

/** The value at the cursor beside the line, with the baseline and the difference, as on the telemetry page. */
export function GpsMapTraceCursorChips({ channel, point, comparison, cursorPct }: Props) {
  if (!point) return null;
  const chips = channel === 'speed' ? <>
    <span className={`${CHIP} border-lmu-info/80 text-lmu-info-soft`}>
      {Math.round(point.speedKmh ?? 0)} <span className="text-[10px] font-normal text-lmu-info/70">km/h</span>
    </span>
    {comparison && <span data-testid="trace-chip-baseline" className={`${CHIP} text-[10px] ${comparison.deltaSpeedKmh >= 0
      ? 'border-lmu-gain-strong/80 text-lmu-gain-soft' : 'border-lmu-loss-strong/80 text-lmu-loss-soft'}`}>
      <span className="text-lmu-warn font-semibold mr-1">B: {Math.round(comparison.baseline.speedKmh)}</span>
      {signed(Math.round(comparison.deltaSpeedKmh))}
    </span>}
  </> : channel === 'pedals' ? <>
    <span className={`${CHIP} border-lmu-gain/80 text-lmu-gain-soft`}>
      THR {(point.throttle ?? 0).toFixed(0)}%{comparison && <span className="text-lmu-warn font-semibold ml-1">B: {comparison.baseline.throttle.toFixed(0)}%</span>}
    </span>
    <span className={`${CHIP} border-lmu-loss/80 text-lmu-loss-soft`}>
      BRK {(point.brake ?? 0).toFixed(0)}%{comparison && <span className="text-lmu-warn font-semibold ml-1">B: {comparison.baseline.brake.toFixed(0)}%</span>}
    </span>
  </> : comparison ? <span className={`${CHIP} ${comparison.deltaTimeSec <= 0 ? 'border-lmu-gain/80 text-lmu-gain-soft' : 'border-lmu-loss/80 text-lmu-loss-soft'}`}>
    Δt: {signed(comparison.deltaTimeSec, 3)}s
  </span> : null;
  return <div data-testid="trace-cursor-chips" style={{ left: `${cursorPct}%` }}
    className={`absolute top-9 z-30 flex items-center gap-1 pointer-events-none ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}>
    {chips}
  </div>;
}
