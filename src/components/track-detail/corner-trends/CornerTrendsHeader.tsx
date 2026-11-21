import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { SPARKLINE_BOX } from './CornerTrendSparkline.js';
import { MIN_TREND_SESSIONS, RECENT_SESSIONS, type CornerSort, type CornerSortKey } from './cornerTrendRows.js';

/** A sortable column: its label, hover text and first direction (the numbers start with the biggest). */
const SortButton: React.FC<{
  sortKey: CornerSortKey; label: string; title: string; sort: CornerSort; onSort: (sort: CornerSort) => void; right?: boolean;
}> = ({ sortKey, label, title, sort, onSort, right = false }) => {
  const active = sort.key === sortKey;
  const Arrow = sort.descending ? ArrowDown : ArrowUp;
  const next: CornerSort = active ? { key: sortKey, descending: !sort.descending } : { key: sortKey, descending: sortKey !== 'corner' };
  return (
    <button type="button" onClick={() => onSort(next)} title={title}
      aria-label={`${label}: sort ${next.descending ? 'descending' : 'ascending'}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wider cursor-pointer hover:text-lmu-text ${active ? 'text-lmu-text' : ''} ${right ? 'justify-self-end text-right' : 'justify-self-start'} ${FOCUS_RING}`}>
      {right && <Arrow className={`w-3 h-3 shrink-0 ${active ? '' : 'invisible'}`} aria-hidden="true" />}
      {label}
      {!right && <Arrow className={`w-3 h-3 shrink-0 ${active ? '' : 'invisible'}`} aria-hidden="true" />}
    </button>
  );
};

/** Sortable headings and explanations for the corner trend columns. */
export const CornerTrendsHeader: React.FC<{ columns: string; sort: CornerSort; onSort: (sort: CornerSort) => void }> = ({ columns, sort, onSort }) => (
  <div className={`${columns} py-2 bg-lmu-bg/80 border-b border-lmu-border text-[11px] font-bold uppercase tracking-wider text-lmu-muted`}>
    <SortButton sortKey="corner" label="Corner" sort={sort} onSort={onSort}
      title={'The corner as the class\'s map groups the turns (SQ), or the official turn. Sorts in lap order.\n'
        + 'Focus marks your 2 focus corners, Pinned the ones you picked.'} />
    <span className={`block ${SPARKLINE_BOX}`} title={'Your usual (median) time through the corner, one mark per session, oldest to newest.\n'
      + 'The dashed line is the target\'s usual: the further below it, the bigger your gap. Every row shares one scale.\n'
      + 'Circle: race · diamond: qualifying · hollow: practice. The last mark is green (quicker), red (slower) or grey (level) over your last '
      + `${RECENT_SESSIONS} sessions.`}>Session history</span>
    <SortButton sortKey="latest" label="Latest median (s)" sort={sort} onSort={onSort} right
      title="Your usual time through the corner in your latest session (s)" />
    <SortButton sortKey="recent" label="Recent trend (s)" sort={sort} onSort={onSort} right
      title={`Estimated change in your median corner time across the last ${RECENT_SESSIONS} eligible sessions. `
        + `Uses fewer if needed, with a minimum of ${MIN_TREND_SESSIONS}. Negative means quicker.`} />
    <SortButton sortKey="vsTarget" label="Gap to target (s)" sort={sort} onSort={onSort} right
      title={'Your latest usual against the target\'s (s): the driver your habits and a corner\'s cost are measured against. '
        + 'Where the target has no time through a corner, the class\'s fastest usual stands in.\n'
        + 'Timed from where the speed drops for the corner to where it drops for the next; the cost in an opened row '
        + 'counts only the corner\'s turns, so the two can differ a little.'} />
  </div>
);
