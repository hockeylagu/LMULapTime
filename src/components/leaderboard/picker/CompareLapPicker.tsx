import React, { useMemo, useState } from 'react';
import { ListPlus, X } from 'lucide-react';
import type { ComparableLap } from '../../../../shared/types/index.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { SessionTypePills } from '../../common/SessionTypePills.js';
import { getSessionTypeStyle } from '../../common/sessionTypeStyles.js';
import { plainTag } from '../CompareLapCard.js';
import { CompareLapPickerSession, PICKER_ROW_GRID } from './CompareLapPickerSession.js';
import {
  DEFAULT_PICKER_FILTERS,
  groupPickerSessions,
  lapCondition,
  pickerQuickPicks,
  type LapPickerFilters,
  type SessionKind,
} from './lapPickerModel.js';

export interface CompareLapPickerProps {
  /** The player's laps on this layout and class. */
  laps: ComparableLap[];
  /** The lap staying in the comparison; quick picks and "same conditions" are measured from it. */
  anchor: ComparableLap | null;
  /** The compared lap the pick replaces; null fills the empty slot. */
  replacing: ComparableLap | null;
  comparedIds: readonly string[];
  /** The player's personal best on the layout, marked in gold. */
  personalBestId?: string | null;
  onPick: (lap: ComparableLap) => void;
  onClose: () => void;
}

const KIND_BY_PILL: Record<string, SessionKind | 'all'> = { All: 'all', Practice: 'practice', Qualifying: 'quali', Race: 'race' };
const PILL_BY_KIND: Record<SessionKind | 'all', string> = { all: 'All', practice: 'Practice', quali: 'Qualifying', race: 'Race' };

/** A neutral on/off toggle (DESIGN.md: toggles are never red). */
const toggle = (on: boolean) =>
  `inline-flex items-center h-8 px-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${FOCUS_RING} ${
    on ? 'bg-lmu-raised border-lmu-rule text-lmu-text' : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-lmu-text'
  }`;

const lapName = (lap: ComparableLap) => plainTag(lap.tag) || `Lap ${lap.lapNum ?? '-'}`;

/** Picks one of the player's laps, from any session on the layout, for one slot of the comparison. */
export const CompareLapPicker: React.FC<CompareLapPickerProps> = ({ laps, anchor, replacing, comparedIds, personalBestId = null, onPick, onClose }) => {
  const [filters, setFilters] = useState<LapPickerFilters>(DEFAULT_PICKER_FILTERS);
  const sessions = useMemo(() => groupPickerSessions(laps, filters, anchor), [laps, filters, anchor]);
  const quickPicks = useMemo(() => pickerQuickPicks(laps, anchor, filters, comparedIds), [laps, anchor, filters, comparedIds]);
  const lapCount = sessions.reduce((sum, s) => sum + s.laps.length, 0);
  const update = (patch: Partial<LapPickerFilters>) => setFilters((current) => ({ ...current, ...patch }));

  return (
    <section aria-label="Choose a lap" className="rounded-xl border border-lmu-border bg-lmu-bg p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-lmu-text flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-lmu-muted shrink-0" aria-hidden="true" />
            {replacing ? (
              <span>Replace {lapName(replacing)} <span className="font-mono text-lmu-text-soft">{replacing.lapTimeString}</span></span>
            ) : 'Choose a lap to compare'}
          </h4>
          <p className="text-xs text-lmu-muted mt-1">
            Your laps on this layout, newest session first
            {anchor && <>, against {lapName(anchor)} <span className="font-mono">{anchor.lapTimeString}</span></>}.
          </p>
        </div>
        <button type="button" onClick={onClose} className={`p-1.5 rounded-lg text-lmu-muted hover:text-lmu-text hover:bg-lmu-card transition-colors cursor-pointer ${FOCUS_RING}`} aria-label="Close the lap picker" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {quickPicks.length > 0 && (
            <div role="group" aria-label="Quick picks" className="flex flex-wrap gap-2">
              {quickPicks.map((pick) => {
                const dot = getSessionTypeStyle(pick.lap.sessionType, pick.lap.sessionName)?.dot ?? 'bg-lmu-muted';
                return (
                  <button key={pick.key} type="button" onClick={() => onPick(pick.lap)} title={`${pick.lap.sessionName || ''} lap ${pick.lap.lapNum ?? '-'}`.trim()} className={SECONDARY_BUTTON}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} aria-hidden="true" />
                    {pick.label}
                    <span className="font-mono font-bold text-lmu-text">{pick.lap.lapTimeString}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div role="group" aria-label="Filters" className="ml-auto flex flex-wrap items-center gap-2">
            <SessionTypePills size="xs" selectedType={PILL_BY_KIND[filters.kind]} onSelectType={(type) => update({ kind: KIND_BY_PILL[type] ?? 'all' })} />
            {anchor && (
              <button type="button" aria-pressed={filters.condition === 'same'} onClick={() => update({ condition: filters.condition === 'same' ? 'all' : 'same' })} className={toggle(filters.condition === 'same')} title="Only sessions in the same conditions as the lap kept">
                Same conditions ({lapCondition(anchor)})
              </button>
            )}
            <button type="button" aria-pressed={filters.cleanOnly} onClick={() => update({ cleanOnly: !filters.cleanOnly })} className={toggle(filters.cleanOnly)} title="Leave out start, out, pit, invalid and unrepresentative laps">
              Clean laps only
            </button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="py-6 text-center text-xs text-lmu-muted">No lap of yours matches these filters on this layout.</p>
        ) : (
          <div>
            <div className={`${PICKER_ROW_GRID} pt-3 pb-1.5 pr-1 border-b border-lmu-border/60 text-[10px] font-bold uppercase tracking-wider text-lmu-muted`}>
              <span aria-hidden="true">Session</span>
              <span aria-hidden="true">Best{anchor?.lapTime ? ' · gap to kept lap' : ''}</span>
              <span className="flex items-baseline justify-between gap-3">
                <span aria-hidden="true">Laps</span>
                <span className="font-mono font-normal normal-case tracking-normal text-[11px]" aria-live="polite">
                  {lapCount} {lapCount === 1 ? 'lap' : 'laps'} · {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
                </span>
              </span>
            </div>
            <ul aria-label="Sessions" className="max-h-96 overflow-y-auto pr-1 divide-y divide-lmu-border/50">
              {sessions.map((session) => (
                <CompareLapPickerSession
                  key={`${session.sessionId}-${session.laps[0].driverName}`}
                  session={session}
                  comparedIds={comparedIds}
                  personalBestId={personalBestId}
                  anchorLapTime={anchor?.lapTime ?? null}
                  onPick={onPick}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};
