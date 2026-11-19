import React from 'react';
import { Spline, X } from 'lucide-react';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { turnDisplayName } from '../../../utils/cornerConsistency.js';
import type { CornerInsight, StripCell, Versus } from './cornerInsight.js';
import { CornerStrip } from './CornerStrip.js';
import { setCornerCardCompare, toggleCornerCard, useCornerCardShown } from './cornerCardShown.js';
import { DASH, howText, marksText } from './cornerCardText.js';

/** Under the scene's minimap (GpsCircuitMinimap: 176 px from 10 px, or 256 px from 14 px on a fullscreen map), 8 px apart. */
export const CORNER_CARD_UNDER_MINIMAP = 'left-2.5 top-[194px]';
export const CORNER_CARD_UNDER_FULLSCREEN_MINIMAP = 'left-3.5 top-[278px]';

const seconds = (value: number) => value.toFixed(3);
/** "+0.12", "−3", "±0": the sign of the value as shown (−0.4 km/h shows ±0). */
const signed = (value: number, digits: number) => {
  const shown = Math.abs(value).toFixed(digits);
  return `${Number(shown) === 0 ? '±' : value > 0 ? '+' : '−'}${shown}`;
};

/** A time against the usual: faster in the gain colour, slower in the loss colour. */
function timeTone(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 0.0005) return 'text-lmu-text-soft';
  return delta < 0 ? 'text-lmu-gain' : 'text-lmu-loss';
}

const LABEL = 'text-[11px] font-medium uppercase tracking-wide text-lmu-text-soft';

/** One of the two headline numbers: its label, the value large, its change against the usual under it. */
function Stat({ label, title, children, delta }: { label: string; title: string; children: React.ReactNode; delta: React.ReactNode }) {
  return (
    <div className="min-w-0" title={title}>
      <dt className={LABEL}>{label}</dt>
      <dd className="truncate font-mono text-base font-semibold tabular-nums text-lmu-text">{children}</dd>
      <dd className="truncate font-mono text-xs tabular-nums">{delta}</dd>
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const speedTone = (delta: number) => (Math.abs(delta) < 0.5 ? 'text-lmu-text-soft' : delta > 0 ? 'text-lmu-gain' : 'text-lmu-loss');
const vsUsual = <span className="font-sans text-lmu-muted"> vs usual</span>;

/**
 * What to know (driver, 2026-11-18): this pass's time and minimum speed against the usual, the gain to find against the class,
 * where in the corner it is (entry or exit), and what the faster car does differently. The two numbers lead; the gain reads
 * below as labelled values and a sentence.
 */
function Body({ insight, versusMode, versusNote, onPick }: { insight: CornerInsight; versusMode: boolean; versusNote?: string | null; onPick?: (cell: StripCell) => void }) {
  const { time, minSpeed, gain, best } = insight;
  if (versusMode) return <VersusBody insight={insight} note={versusNote} onPick={onPick} />;
  const usual = insight.usualSec === null ? 'no usual yet: it needs 3 laps that count through this corner'
    : `Usual ${seconds(insight.usualSec)} s${insight.spreadSec === null ? '' : ` ±${seconds(insight.spreadSec)}`}${best ? `, best ${seconds(best.timeSec)} s on lap ${best.lapNumber}` : ''}`;
  const rival = gain ? `${gain.carNumber ? `#${gain.carNumber} ` : ''}${gain.name}` : '';
  const split = gain && gain.entrySec !== null && gain.exitSec !== null ? { entry: gain.entrySec, exit: gain.exitSec } : null;
  return (
    <>
      <dl className="grid grid-cols-[3fr_2fr] gap-x-3 px-3 pt-2">
        <Stat label="Time" title={`First number: seconds since the car entered this corner, counting with the replay. Second: its whole time through the corner on this lap. Under them: that time against its usual time here. ${usual}`}
          delta={time.delta === null ? <span className="text-lmu-muted">no usual yet</span> : <><span className={timeTone(time.delta)}>{signed(time.delta, 3)}</span>{vsUsual}</>}>
          {/* Padded to the pass time's width so the line does not move as the seconds tick. */}
          <span className="whitespace-pre">{insight.elapsedSec.toFixed(1).padStart(seconds(time.value).length - 2)}</span>
          <span className="font-normal text-lmu-muted"> / </span>{seconds(time.value)}<span className="text-xs font-normal text-lmu-muted"> s</span>
        </Stat>
        <Stat label="Min speed" title="The slowest speed in this corner on this lap, against the car's usual slowest speed here"
          delta={minSpeed?.delta == null ? <span className="text-lmu-muted">{DASH}</span> : <><span className={speedTone(minSpeed.delta)}>{signed(minSpeed.delta, 0)}</span>{vsUsual}</>}>
          {minSpeed ? <>{Math.round(minSpeed.value)}<span className="text-xs font-normal text-lmu-muted"> km/h</span></> : DASH}
        </Stat>
      </dl>
      <dl className="mx-3 mt-2 space-y-1 border-t border-lmu-border pt-2 pb-2.5 text-xs">
        <div className="flex items-baseline gap-2" title={gain ? `The car's usual time through this corner against the fastest usual time of its class (${rival}); and where this corner ranks among the car's corners by time to find` : 'Needs 3 laps that count through this corner, for the car and for another car of its class'}>
          <dt className={LABEL}>Gain</dt>
          <dd className="truncate">{!gain ? DASH : gain.deltaSec > 0.0005
            ? <><span className="font-mono text-sm font-semibold tabular-nums text-lmu-loss">{seconds(gain.deltaSec)} s</span>
              <span className="text-lmu-text-soft"> to find · {ordinal(gain.rank)} of {gain.of} corners</span></>
            : <span className="text-lmu-gain">fastest in class</span>}</dd>
        </div>
        {split && <div className="flex items-baseline gap-3" title="The gain split at the slowest point: on the way in (braking, turn-in) and on the way out (back to the throttle)">
          <dt className="sr-only">Where</dt>
          <dd><span className="text-lmu-text-soft">Entry </span><span className={`font-mono tabular-nums ${timeTone(split.entry)}`}>{signed(split.entry, 3)}</span></dd>
          <dd><span className="text-lmu-text-soft">Exit </span><span className={`font-mono tabular-nums ${timeTone(split.exit)}`}>{signed(split.exit, 3)}</span></dd>
        </div>}
        {gain && <div title={`How ${rival} usually takes this corner compared with the car: ${howText(gain)}`}>
          <dt className="sr-only">How</dt>
          <dd className="line-clamp-2 leading-snug text-lmu-text"><span className="font-mono text-lmu-text-soft">{gain.carNumber ? `#${gain.carNumber}` : gain.name}</span> {howText(gain)}</dd>
        </div>}
      </dl>
      <CornerStrip cells={insight.strip} onPick={onPick} />
    </>
  );
}

const whoText = (versus: Versus) => `${versus.carNumber ? `#${versus.carNumber} ` : ''}L${versus.lapNumber}`;

/** The compare mode: this pass against the compare lap's pass through the corner, with where and how the gap is made. */
function VersusBody({ insight, note, onPick }: { insight: CornerInsight; note?: string | null; onPick?: (cell: StripCell) => void }) {
  const { time, minSpeed, versus } = insight;
  const vs = versus && <span className="font-sans text-lmu-muted"> vs {whoText(versus)}</span>;
  return (
    <>
      <dl className="grid grid-cols-[3fr_2fr] gap-x-3 px-3 pt-2">
        <Stat label="Time" title="First number: seconds since the car entered this corner, counting with the replay. Second: its whole time through the corner on this lap. Under them: that time against the compare lap's time through the same turn"
          delta={versus ? <><span className={timeTone(versus.timeDelta)}>{signed(versus.timeDelta, 3)}</span>{vs}</> : <span className="text-lmu-muted">{DASH}</span>}>
          <span className="whitespace-pre">{insight.elapsedSec.toFixed(1).padStart(seconds(time.value).length - 2)}</span>
          <span className="font-normal text-lmu-muted"> / </span>{seconds(time.value)}<span className="text-xs font-normal text-lmu-muted"> s</span>
        </Stat>
        <Stat label="Min speed" title="The slowest speed in this corner on this lap, against the compare lap's slowest speed here"
          delta={versus?.minSpeedDelta == null ? <span className="text-lmu-muted">{DASH}</span> : <><span className={speedTone(versus.minSpeedDelta)}>{signed(versus.minSpeedDelta, 0)}</span>{vs}</>}>
          {minSpeed ? <>{Math.round(minSpeed.value)}<span className="text-xs font-normal text-lmu-muted"> km/h</span></> : DASH}
        </Stat>
      </dl>
      <dl className="mx-3 mt-2 space-y-1 border-t border-lmu-border pt-2 pb-2.5 text-xs">
        {!versus ? <p className="text-lmu-muted">{note ?? 'The compare lap has no time through this corner.'}</p> : <>
          <div className="flex items-baseline gap-2" title={`The compare lap's time through this corner: ${versus.name}, lap ${versus.lapNumber}`}>
            <dt className={LABEL}>Compare</dt>
            <dd className="truncate"><span className="font-mono tabular-nums text-lmu-text">{seconds(versus.timeSec)} s</span>
              <span className="text-lmu-text-soft"> {whoText(versus)}</span></dd>
          </div>
          {versus.entrySec !== null && versus.exitSec !== null && <div className="flex items-baseline gap-3" title="Where the time is gained or lost, split at each lap's slowest point in the corner: on the way in (braking, turn-in) and on the way out (back to the throttle)">
            <dt className="sr-only">Where</dt>
            <dd><span className="text-lmu-text-soft">Entry </span><span className={`font-mono tabular-nums ${timeTone(versus.entrySec)}`}>{signed(versus.entrySec, 3)}</span></dd>
            <dd><span className="text-lmu-text-soft">Exit </span><span className={`font-mono tabular-nums ${timeTone(versus.exitSec)}`}>{signed(versus.exitSec, 3)}</span></dd>
          </div>}
          <div title={`How the compare lap takes this corner compared with this lap: ${howText(versus)}`}>
            <dt className="sr-only">How</dt>
            <dd className="line-clamp-2 leading-snug text-lmu-text"><span className="font-mono text-lmu-text-soft">{whoText(versus)}</span> {howText(versus)}</dd>
          </div>
        </>}
      </dl>
      <CornerStrip cells={insight.strip} onPick={onPick} />
    </>
  );
}

/** The header's switch between the car's usual and the compare lap. */
function ModeSwitch({ versusMode }: { versusMode: boolean }) {
  const option = (on: boolean, label: string, title: string) => (
    <button type="button" aria-pressed={versusMode === on} title={title} onClick={() => setCornerCardCompare(on)}
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${versusMode === on ? 'bg-lmu-raised text-lmu-text' : 'text-lmu-muted hover:text-lmu-text'} ${FOCUS_RING}`}>{label}</button>
  );
  return <div role="group" aria-label="Measure against" className="flex shrink-0 items-center">
    {option(false, 'Usual', "Against the car's usual and its class's fastest")}
    {option(true, 'Compare', "Against the compare lap's time through each corner")}
  </div>;
}

interface Props {
  insight: CornerInsight | null;
  /** Why there is no card (no replay, passes not built); null while loading or when there is one. */
  reason: string | null;
  loading: boolean;
  /** Goes to a pass of the strip: the race view moves its clock, the lap view opens that lap. */
  onPick?: (cell: StripCell) => void;
  /** With a compare lap: whether the card measures against it (true) or the usual; undefined without one (no switch). */
  versusMode?: boolean;
  /** Why the compare lap has no pass in any turn (its passes load, or its session has none); null when it has them. */
  versusNote?: string | null;
  className?: string;
}

/**
 * The corner insight card (docs/plans/proposed/CORNER_INSIGHT.md): the followed car's pass through the corner it is in,
 * against its usual and the class's fastest, and the turn's strip over the session. The whole pass shows from the
 * turn's entry; fixed size, a value the pass lacks shows "–" or "none".
 */
export const CornerInsightCard: React.FC<Props> = ({ insight, reason, loading, onPick, versusMode, versusNote, className = '' }) => {
  const heading = insight ? turnDisplayName(insight.turn) : 'Corner';
  const marks = insight ? marksText(insight.marks, insight.counts) : '';
  return (
    <aside aria-label="Corner insight" data-testid="corner-insight-card" onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      className={`absolute z-20 flex h-[236px] w-[288px] flex-col overflow-hidden rounded-xl border border-lmu-border bg-lmu-strip/95 text-lmu-text ${className}`}>
      <header className="flex items-center gap-2 border-b border-lmu-border px-3 py-1.5">
        <h3 className="text-sm font-semibold" title={insight?.turn.title}>{heading}</h3>
        <span className="min-w-0 flex-1 truncate text-[11px] text-lmu-warn" title={marks}>{marks}</span>
        {versusMode !== undefined && <ModeSwitch versusMode={versusMode} />}
        <button type="button" onClick={toggleCornerCard} aria-label="Close corner card" title="Close corner card (K)"
          className={`rounded p-0.5 text-lmu-muted hover:bg-lmu-raised/70 hover:text-lmu-text ${FOCUS_RING}`}><X className="h-3.5 w-3.5" /></button>
      </header>
      {insight ? <Body insight={insight} versusMode={Boolean(versusMode)} versusNote={versusNote} onPick={onPick} /> : (
        <p role={reason ? 'note' : 'status'} className="px-3 py-3 text-xs text-lmu-muted">
          {reason ?? (loading ? 'Loading the corner times…' : 'The car has not reached a corner yet.')}
        </p>
      )}
    </aside>
  );
};

/** The controls row's button that shows or hides the corner card (K). */
export const CornerCardButton: React.FC = () => {
  const shown = useCornerCardShown(false);
  return <button type="button" onClick={toggleCornerCard} aria-label="Corner card" aria-pressed={shown} title={`${shown ? 'Hide' : 'Show'} corner card (K)`}
    className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors ${shown
      ? 'bg-lmu-raised text-lmu-text' : 'bg-lmu-raised/40 text-lmu-muted hover:bg-lmu-raised hover:text-lmu-text'} ${FOCUS_RING}`}>
    <Spline className="h-3.5 w-3.5" />
  </button>;
};
