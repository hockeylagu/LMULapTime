import React from 'react';
import type { LapDetailSection } from './lapDetailSections.js';

export interface SessionLapDetailsRowProps {
  lapNum: number;
  sections: LapDetailSection[];
  columnCount: number;
}

/** One line of a group, with what comes before its first colon ("Attacking:") in bold. */
const DetailLine: React.FC<{ line: string }> = ({ line }) => {
  const colon = line.indexOf(': ');
  if (colon < 0) return <div>{line}</div>;
  return (
    <div>
      <span className="font-semibold text-white">{line.slice(0, colon + 1)}</span>{line.slice(colon + 1)}
    </div>
  );
};

/** The expanded line under a lap: what happened on it, one labelled group per kind. */
export const SessionLapDetailsRow: React.FC<SessionLapDetailsRowProps> = ({ lapNum, sections, columnCount }) => (
  <tr className="bg-lmu-bg/60" data-testid={`lap-details-${lapNum}`}>
    <td colSpan={columnCount} className="px-3 py-2 pl-10">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-sans text-[11px]">
        {sections.map((section) => (
          <React.Fragment key={section.label}>
            <dt className="text-lmu-muted font-semibold uppercase tracking-wider text-[10px] pt-px">{section.label}</dt>
            <dd className="text-lmu-text space-y-0.5">
              {section.lines.map((line) => <DetailLine key={line} line={line} />)}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </td>
  </tr>
);
