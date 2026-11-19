import React, { Fragment } from 'react';
import type { StripCell } from './cornerInsight.js';
import { marksText } from './cornerCardText.js';

/** Within this of the usual, a pass is "usual" (neither colour). */
const SAME_SEC = 0.05;

function cellTone(cell: StripCell): string {
  if (!cell.counts) return 'bg-lmu-raised/50';
  if (cell.deltaSec === null || Math.abs(cell.deltaSec) < SAME_SEC) return 'bg-lmu-muted/60';
  return cell.deltaSec < 0 ? 'bg-lmu-gain' : 'bg-lmu-loss';
}

function cellTitle(cell: StripCell): string {
  const delta = cell.deltaSec === null ? '' : `, ${cell.deltaSec >= 0 ? '+' : '−'}${Math.abs(cell.deltaSec).toFixed(3)} on usual`;
  const marks = marksText(cell.marks, cell.counts);
  return `Lap ${cell.lapNumber}: ${cell.timeSec.toFixed(3)} s${delta}${marks ? ` (${marks})` : ''}`;
}

/**
 * The turn over the session: a cell per lap against the car's usual (faster green, slower red, grey around it, dim
 * when the lap does not count), the current lap outlined, a divider after each pit stop. A click goes to that pass
 * where the view can (the race view's clock, the lap view's lap).
 */
export const CornerStrip: React.FC<{ cells: StripCell[]; onPick?: (cell: StripCell) => void }> = ({ cells, onPick }) => (
  <div className="mt-auto flex h-7 shrink-0 items-stretch gap-px border-t border-lmu-border px-3 py-1.5" data-testid="corner-strip">
    {cells.map(cell => {
      const outline = cell.current ? 'outline outline-1 outline-offset-1 outline-lmu-text' : '';
      const className = `min-w-[2px] max-w-3 flex-1 rounded-[1px] ${cellTone(cell)} ${outline}`;
      return (
        <Fragment key={cell.lapNumber}>
          {onPick ? (
            <button type="button" aria-label={cellTitle(cell)} title={cellTitle(cell)} onClick={() => onPick(cell)}
              className={`${className} cursor-pointer hover:brightness-125`} />
          ) : <span title={cellTitle(cell)} className={className} />}
          {cell.pitAfter && <span aria-hidden className="mx-0.5 w-px shrink-0 bg-lmu-text-soft" />}
        </Fragment>
      );
    })}
  </div>
);
