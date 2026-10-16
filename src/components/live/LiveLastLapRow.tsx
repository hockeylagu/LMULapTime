import type { LiveLapRecord } from '../../../shared/types/live.js';
import { formatLapTime, formatSectorTime } from './liveFormat.js';
import { RACE_COLUMN, RACE_LEAD, RACE_ROW, UNRULED } from './raceColumns.js';

const SECTORS = [
  { label: 'S1', dot: 'bg-lmu-gold' },
  { label: 'S2', dot: 'bg-lmu-blue' },
  { label: 'S3', dot: 'bg-lmu-green' },
] as const;

/** The last completed lap with its real split sectors; nothing known yet reads as the unknown mark. */
export function LiveLastLapRow({ lap }: { lap: LiveLapRecord | null }) {
  // An invalid lap stays readable but quieter, with no extra text.
  const dim = lap !== null && !lap.valid ? 'opacity-50' : '';
  return (
    <section
      aria-label="Last completed lap and sector times"
      data-testid="live-last-lap"
      className={`${RACE_ROW} h-[184px] shrink-0 items-center ${dim}`}
    >
      <div className={RACE_LEAD}>
        <h2 className="mb-2 flex items-center gap-4 text-[48px] font-semibold text-lmu-text-soft">
          LAST LAP {lap && <span className="text-lmu-muted">{lap.lapNumber}</span>}
        </h2>
        <div className="font-mono text-[88px] font-semibold leading-[1.1] tracking-[-0.025em]">{formatLapTime(lap?.lapSeconds)}</div>
      </div>
      {SECTORS.map((sector, index) => (
        <div key={sector.label} className={`${RACE_COLUMN} ${UNRULED}`}>
          <h2 className="mb-2 flex items-center gap-4 text-[48px] font-semibold text-lmu-text-soft">
            <span aria-hidden="true" className={`size-[10px] rounded-full ${sector.dot}`} />
            {sector.label}
          </h2>
          <div className="font-mono text-[88px] font-semibold leading-[1.1] tracking-[-0.025em]">{formatSectorTime(lap?.sectors[index])}</div>
        </div>
      ))}
    </section>
  );
}
