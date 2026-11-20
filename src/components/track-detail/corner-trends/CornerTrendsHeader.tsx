import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { SPARKLINE_BOX } from './CornerTrendSparkline.js';
import { RECENT_SESSIONS, type CornerSort, type CornerSortKey } from './cornerTrendRows.js';

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
      className={`inline-flex items-center gap-1 uppercase tracking-wider cursor-pointer hover:text-lmu-text ${active ? 'text-lmu-text' : ''} ${right ? 'justify-self-end' : 'justify-self-start'} ${FOCUS_RING}`}>
      {right && <Arrow className={`w-3 h-3 ${active ? '' : 'invisible'}`} aria-hidden="true" />}
      {label}
      {!right && <Arrow className={`w-3 h-3 ${active ? '' : 'invisible'}`} aria-hidden="true" />}
    </button>
  );
};

/** The corner table's header row: Corner, Latest, Last 5 and Vs class sort the rows; every column explains itself on hover. */
export const CornerTrendsHeader: React.FC<{ columns: string; sort: CornerSort; onSort: (sort: CornerSort) => void }> = ({ columns, sort, onSort }) => (
  <div className={`${columns} py-3 bg-lmu-bg/80 border-b border-lmu-border text-[11px] font-bold uppercase tracking-wider text-lmu-muted`}>
    <SortButton sortKey="corner" label="Corner" sort={sort} onSort={onSort}
      title="The corner as the class's map groups the turns (SQ), or the official turn. Sorts in lap order." />
    <span title="The official turns the corner holds">Turns</span>
    <span className={`block ${SPARKLINE_BOX}`} title={'Your usual (median) time through the corner, one mark per session, oldest to newest.\n'
      + 'The dashed line is the class\'s fastest usual: the further below it, the bigger your gap. Every row shares one scale.\n'
      + 'Circle: race · diamond: qualifying · hollow: practice. The last mark is green (quicker), red (slower) or grey (level) over your last '
      + `${RECENT_SESSIONS} sessions.`}>Usual per session</span>
    <SortButton sortKey="latest" label="Latest" sort={sort} onSort={onSort} right
      title="Your usual time through the corner in your latest session (s)" />
    <SortButton sortKey="recent" label={`Last ${RECENT_SESSIONS}`} sort={sort} onSort={onSort} right
      title={`How much your usual time changed over your last ${RECENT_SESSIONS} sessions (s), from the median change between every pair `
        + 'of them, so one odd session cannot make or hide a trend. Negative is quicker.'} />
    <SortButton sortKey="vsClass" label="Vs class" sort={sort} onSort={onSort} right
      title={'Your latest usual against the class\'s fastest usual here by another driver (s). '
        + 'The two biggest gaps of 0.1 s or more are in red: the corners to work on.'} />
  </div>
);
