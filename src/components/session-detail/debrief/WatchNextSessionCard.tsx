import { Link } from 'react-router';
import { ChevronRight, Loader2, Target } from 'lucide-react';
import type { DetailedSession } from '../../../../shared/types/index.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { useWatchNextSession } from './useWatchNextSession.js';
import type { WatchNextSession } from './watchNextSession.js';

const linkClass = `shrink-0 inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold text-lmu-info hover:bg-lmu-info-strong/10 border border-transparent hover:border-lmu-info-strong/30 transition-colors ${FOCUS_RING}`;

/** One line to watch: what to do, what it costs, and the corner in telemetry. */
function WatchLine({ index, line, cost, note = null, link, label }: { index: number; line: string; cost: string; note?: string | null; link: string | null; label: string }) {
  return (
    <li className="flex items-start gap-3 py-2 border-t border-lmu-border/40 first:border-t-0">
      <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-lmu-raised border border-lmu-rule text-[11px] font-bold text-white flex items-center justify-center">{index}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{line}</p>
        <p className="text-xs text-lmu-muted font-mono">{cost}</p>
        {note && <p className="text-[11px] text-lmu-muted">{note}</p>}
      </div>
      {link && <Link to={link} className={linkClass} aria-label={label}>Open <ChevronRight className="w-3.5 h-3.5" /></Link>}
    </li>
  );
}

function referenceText(watch: WatchNextSession, ownCar: string): string {
  const { reference } = watch;
  if (!reference) return '';
  const car = reference.car && reference.car !== ownCar ? ` (${reference.car})` : '';
  return `vs ${reference.name}${car}${reference.sameSession ? '' : ' from another session'}, usual against usual over your ${watch.laps} counted laps`;
}

function WatchLists({ watch, ownCar }: { watch: WatchNextSession; ownCar: string }) {
  if (!watch.habits.length && !watch.mistakes.length) {
    return <p className="text-xs text-lmu-gain py-1">Nothing repeats: no corner loses time on most laps, and no lap went clearly wrong.</p>;
  }
  return (
    <>
      {watch.habits.length > 0 && (
        <div>
          <h5 className="text-[11px] font-bold text-lmu-muted uppercase tracking-wider">Habits</h5>
          <ol>
            {watch.habits.map((habit, i) => (
              <WatchLine
                key={habit.key}
                index={i + 1}
                line={habit.line}
                cost={`+${habit.lossSec.toFixed(2)} s a lap${habit.share === null ? '' : ` · ${Math.round(habit.share * 100)} % of laps`}`}
                note={habit.since}
                link={habit.link}
                label={`Open in telemetry: ${habit.line}`}
              />
            ))}
          </ol>
        </div>
      )}
      {watch.mistakes.length > 0 && (
        <div>
          <h5 className="text-[11px] font-bold text-lmu-muted uppercase tracking-wider">Mistakes, against your usual</h5>
          <ol>
            {watch.mistakes.map((mistake, i) => (
              <WatchLine
                key={mistake.key}
                index={i + 1}
                line={mistake.line}
                cost={mistake.lapNumber === null ? '' : `Lap ${mistake.lapNumber}`}
                link={mistake.link}
                label={`Open lap ${mistake.lapNumber ?? ''} in telemetry: ${mistake.line}`}
              />
            ))}
          </ol>
          {watch.moreMistakes > 0 && <p className="text-[11px] text-lmu-muted">{watch.moreMistakes} smaller {watch.moreMistakes === 1 ? 'one' : 'ones'} left out.</p>}
        </div>
      )}
      {watch.carTurns.length > 0 && (
        <p className="text-[11px] text-lmu-muted">
          The car, not the driving: {watch.carTurns.join(', ')} (the quickest {ownCar} loses there too).
        </p>
      )}
    </>
  );
}

/**
 * What to work on next session, from the corner analysis engine: the habits that cost time against the session's
 * reference lap after lap, and the laps where a corner went clearly worse than the driver's own usual.
 */
export function WatchNextSessionCard({ session, driverName, ownCar }: { session: DetailedSession; driverName: string; ownCar: string }) {
  const { state, retry } = useWatchNextSession(session, driverName);
  return (
    <section className="space-y-3" data-testid="watch-next-session">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-lmu-warn" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Watch next session</h4>
        </div>
        {state.status === 'ready' && <span className="text-xs text-lmu-muted">{referenceText(state.watch, ownCar)}</span>}
      </div>
      <p role="status" aria-atomic="true" className="sr-only">{state.status === 'loading' ? 'Reading your corners.' : ''}</p>
      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-xs text-lmu-muted py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading your corners...</p>
      )}
      {state.status === 'unavailable' && (
        <p className="text-xs text-lmu-muted py-1">No corner analysis for this session: it needs the replay's corner passes and dry, counted laps.</p>
      )}
      {state.status === 'error' && (
        <div className="flex items-center justify-between gap-2 py-1">
          <p role="alert" className="text-xs text-lmu-loss">{state.message}</p>
          <button type="button" onClick={retry} className={`text-xs font-bold text-lmu-info hover:text-lmu-info-soft whitespace-nowrap ${FOCUS_RING}`}>Try again</button>
        </div>
      )}
      {state.status === 'ready' && <WatchLists watch={state.watch} ownCar={ownCar} />}
    </section>
  );
}
