import React from 'react';
import type { LapDetailSection } from './lapDetailSections.js';

export interface SessionLapDetailsRowProps {
  lapNum: number;
  sections: LapDetailSection[];
  columnCount: number;
}

/** The expanded line under a lap: what happened on it, one labelled group per kind. */
export const SessionLapDetailsRow: React.FC<SessionLapDetailsRowProps> = ({ lapNum, sections, columnCount }) => (
  <tr className="bg-lmu-bg/60" data-testid={`lap-details-${lapNum}`}>
    <td colSpan={columnCount} className="px-3 py-2 pl-10">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-sans text-[11px]">
        {sections.map((section) => (
          <React.Fragment key={section.label}>
            <dt className="text-lmu-muted font-semibold uppercase tracking-wider text-[10px] pt-px">{section.label}</dt>
            <dd className="text-slate-200">{section.lines.join(' · ')}</dd>
          </React.Fragment>
        ))}
      </dl>
    </td>
  </tr>
);
