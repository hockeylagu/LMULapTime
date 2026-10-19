import type { LiveLapRecord, LiveSessionBest } from '../../../shared/types/live.js';
import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import { LiveDelta } from './LiveDelta.js';
import { formatLapTime, formatRunningTime, formatSectorTime, UNKNOWN, worstSectorIndex } from './liveFormat.js';

export const HISTORY_ROWS = 2;

const HEAD = 'px-5 text-left text-[48px] font-medium text-lmu-text-soft';
const CELL = 'px-5 text-left font-mono text-[80px] font-medium leading-[1.08]';

/** A lap against the session best; unknown for an invalid lap or before a best exists. */
function vsBest(lap: LiveLapRecord, best: LiveSessionBest | null): number | null {
  return lap.valid && lap.lapSeconds !== null && best?.lapSeconds != null ? lap.lapSeconds - best.lapSeconds : null;
}

/**
 * The lap in progress, in the same pattern as the completed rows: lap number, the running lap clock, and each
 * sector as it is crossed. Only this row subscribes to the 5 Hz timing stream; completed history stays stable.
 */
function CurrentLapRow({ store }: { store: LiveTimingStore }) {
  const timing = useLiveTiming(store);
  return (
    <tr data-testid="live-history-current" className="border-b border-lmu-border bg-lmu-card font-bold">
      <th scope="row" className={CELL}>{timing?.lapNumber ?? UNKNOWN}</th>
      <td className={CELL}>{formatRunningTime(timing?.lapElapsedSeconds)}</td>
      {[0, 1, 2].map((index) => (
        <td key={index} className={CELL}>{formatSectorTime(timing?.sectors[index])}</td>
      ))}
      <td className={CELL}><LiveDelta seconds={timing?.deltaSeconds ?? null} unit={false} /></td>
    </tr>
  );
}

/**
 * The lap in progress on top, then the last two laps and the session's best row. When the lap ends it moves
 * down as the newest completed row. The latest completed lap's biggest sector loss is tinted.
 * Rows not driven yet are held at full height with hidden cells, so the table never reflows as laps arrive.
 */
export function LivePracticeHistory({ laps, best, store }: { laps: LiveLapRecord[]; best: LiveSessionBest | null; store: LiveTimingStore }) {
  const rows = laps.slice(-HISTORY_ROWS).reverse();
  const blanks = HISTORY_ROWS - rows.length;
  const worst = rows[0]?.valid && best ? worstSectorIndex(rows[0], best.bestSectors) : -1;
  return (
    <section aria-label="Lap in progress and last two completed laps" className="h-[460px] shrink-0 px-9">
      <table data-testid="live-history" className="h-full w-full table-fixed border-collapse">
        <colgroup><col className="w-[10%]" /><col className="w-[20%]" /><col /><col /><col /><col className="w-[17%]" /></colgroup>
        <thead className="h-16">
          <tr>
            <th scope="col" className={HEAD}>LAP</th>
            <th scope="col" className={HEAD}>LAP TIME</th>
            <th scope="col" className={HEAD}>S1</th>
            <th scope="col" className={HEAD}>S2</th>
            <th scope="col" className={HEAD}>S3</th>
            <th scope="col" className={HEAD}>VS BEST</th>
          </tr>
        </thead>
        <tbody>
          <CurrentLapRow store={store} />
          {rows.map((lap, row) => (
            <tr
              key={lap.lapNumber}
              data-testid={row === 0 ? 'live-history-latest' : 'live-history-row'}
              className={`border-b border-lmu-border ${lap.valid ? '' : 'opacity-50'}`}
            >
              <th scope="row" className={`${CELL} ${row === 0 ? 'text-lmu-text' : 'text-lmu-muted'}`}>{lap.lapNumber}</th>
              <td className={CELL}>{formatLapTime(lap.lapSeconds)}</td>
              {lap.sectors.map((sector, index) => (
                <td
                  key={index}
                  data-sector-loss={row === 0 && index === worst ? 'true' : undefined}
                  className={`${CELL} ${row === 0 && index === worst ? 'text-lmu-loss' : ''}`}
                >
                  {formatSectorTime(sector)}
                </td>
              ))}
              <td className={CELL}><LiveDelta seconds={vsBest(lap, best)} unit={false} /></td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, index) => (
            <tr key={`blank-${index}`} aria-hidden="true" data-testid="live-history-blank" className="invisible border-b border-lmu-border">
              {Array.from({ length: 6 }, (_, cell) => <td key={cell} className={CELL}>{UNKNOWN}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-lmu-border" data-testid="live-history-best">
            <th scope="row" className="px-5 text-left text-[48px] font-medium text-lmu-text-soft">BEST</th>
            <td className={CELL}>{formatLapTime(best?.lapSeconds)}</td>
            {[0, 1, 2].map((index) => <td key={index} className={CELL}>{formatSectorTime(best?.bestSectors[index])}</td>)}
            <td className={CELL} />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
