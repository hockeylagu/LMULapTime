import React from 'react';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { formatGap } from '../leaderboard/leaderboardFormat.js';

export interface SectorTimes {
  s1: number | null;
  s2: number | null;
  s3: number | null;
}

const SECTORS = [
  { key: 's1', label: 'S1' },
  { key: 's2', label: 'S2' },
  { key: 's3', label: 'S3' },
] as const;

/** The sector where your lap loses the most to theirs; null when it loses in none. */
export function worstSector(yours: SectorTimes | null, theirs: SectorTimes | null): { label: string; gap: number } | null {
  if (!yours || !theirs) return null;
  let worst: { label: string; gap: number } | null = null;
  for (const s of SECTORS) {
    const mine = yours[s.key];
    const other = theirs[s.key];
    if (mine === null || other === null) continue;
    const gap = mine - other;
    if (gap > 0 && (worst === null || gap > worst.gap)) worst = { label: s.label, gap };
  }
  return worst;
}

export interface SectorGapSummaryProps {
  /** Your lap time minus theirs; positive when yours is slower. */
  gap: number;
  /** Your best sectors added up, when known. */
  theoreticalBest: number | null;
  /** Your best sectors added up minus their lap time, when known. */
  theoreticalGap: number | null;
  yours: SectorTimes | null;
  theirs: SectorTimes | null;
  /** Whose lap the gap is to, as the sentence names it. */
  theirLabel?: string;
  /** Shows each sector's gap as a chip instead of naming the worst one. */
  showSectors?: boolean;
  /** Shown at the right end of the best-sectors line. */
  aside?: React.ReactNode;
}

/** How much your best sectors close of the gap between two laps, and where the gap is. */
export const SectorGapSummary: React.FC<SectorGapSummaryProps> = ({
  gap, theoreticalBest, theoreticalGap, yours, theirs, theirLabel = 'this lap', showSectors = false, aside,
}) => {
  const worst = worstSector(yours, theirs);
  const sectors = theoreticalBest !== null && theoreticalGap !== null && gap > 0 ? { best: theoreticalBest, gap: theoreticalGap } : null;
  const chips = showSectors && yours && theirs
    ? SECTORS.map((s) => {
        const mine = yours[s.key];
        const other = theirs[s.key];
        return { label: s.label, gap: mine !== null && other !== null ? mine - other : null };
      })
    : [];
  if (!sectors && !worst && chips.length === 0 && !aside) return null;

  const sentence = (sectors || (worst && !showSectors)) && (
    <p>
      {sectors && (sectors.gap < 0 ? (
        <>
          Your best sectors add up to <span className="font-mono text-white">{formatTime(sectors.best)}</span>,{' '}
          <span className="font-mono text-emerald-400">{Math.abs(sectors.gap).toFixed(3)} s</span> under {theirLabel}.
          You have already driven it, just not on one lap.{' '}
        </>
      ) : (
        <>
          Your best sectors close <span className="font-mono text-white">{Math.max(0, gap - sectors.gap).toFixed(3)}</span> of the{' '}
          <span className="font-mono text-white">{gap.toFixed(3)} s</span>: the rest is new pace.{' '}
        </>
      ))}
      {worst && !showSectors && (
        <>
          {gap > 0 ? 'Most of it is in' : 'Still slower in'} {worst.label}{' '}
          <span className="font-mono text-rose-300">({formatGap(worst.gap)})</span>.
        </>
      )}
    </p>
  );

  return (
    <div className="space-y-2 text-xs text-slate-300">
      {(sentence || aside) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {sentence || <span />}
          {aside}
        </div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Sector by sector">
          <span className="text-lmu-muted mr-0.5">Sector by sector</span>
          {chips.map((c) => (
            <span
              key={c.label}
              title={c.gap === null ? undefined : c.gap < 0 ? `You are faster in ${c.label}` : `You lose time in ${c.label}`}
              className={`px-2 py-0.5 rounded-lg border font-mono ${
                c.gap !== null && c.gap < 0
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : worst?.label === c.label
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                  : 'border-lmu-border bg-lmu-bg/60'
              }`}
            >
              {c.label} {c.gap !== null ? formatGap(c.gap) : '—'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
