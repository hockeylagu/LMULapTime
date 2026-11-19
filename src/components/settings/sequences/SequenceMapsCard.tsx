import React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { VEHICLE_CLASS_OPTIONS } from '../../../../shared/domain/vehicleMapping.js';
import type { SequenceMapSummary } from '../../../../shared/types/corners/sequenceMaps.js';
import { SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { FeedbackMessage, SettingsPanel } from '../SettingsPanel.js';
import { formatDateTime, pluralize } from '../settingsFormat.js';
import { useSequenceMaps } from './useSequenceMaps.js';

const MAP_LAPS = 10;
const HEAD = 'sticky top-0 z-10 bg-lmu-card border-b border-lmu-border text-[11px] font-semibold uppercase tracking-wider text-lmu-muted px-3 py-2';

const classLabel = (carClass: string) => VEHICLE_CLASS_OPTIONS.find((option) => option.id === carClass)?.label ?? carClass;

/** The driver's own fastest laps against the map: how many sequences they group alike, and starts more than 10 m away. */
const OwnCheck: React.FC<{ map: SequenceMapSummary }> = ({ map }) => {
  const { checked, same, startOff } = map.ownCheck;
  if (checked === 0) {
    return <span className="text-lmu-faint" title="Fewer than 3 of your laps, or the map is your own laps">—</span>;
  }
  return (
    <span className="font-mono text-lmu-text-soft" title="Your 5 fastest laps against the map: sequences grouped alike, and starts more than 10 m from the map's">
      {same}/{checked} alike{startOff > 0 && <span className="text-lmu-muted"> · {startOff} start{startOff === 1 ? '' : 's'} &gt;10 m</span>}
    </span>
  );
};

const LastCheck: React.FC<{ map: SequenceMapSummary }> = ({ map }) => {
  if (!map.check) {
    return <span className="text-lmu-muted" title="Checked once 3 new laps make the class's fastest">Not yet</span>;
  }
  const date = <span className="text-lmu-muted font-mono"> · {formatDateTime(map.check.checkedAt)}</span>;
  if (map.check.agrees) return <span><span className="font-semibold text-lmu-gain">Agrees</span>{date}</span>;
  return (
    <span className="block">
      <span className="inline-flex items-center gap-1 font-semibold text-lmu-warn">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Differs
      </span>
      {date}
      <span className="mt-0.5 block text-[11px] text-lmu-text-soft break-words">{map.check.detail}</span>
    </span>
  );
};

interface RowProps {
  map: SequenceMapSummary;
  regenerating: string | null;
  onRegenerate: (layoutKey: string, carClass: string) => void;
}

const SequenceMapRow: React.FC<RowProps> = ({ map, regenerating, onRegenerate }) => {
  const spec = getCircuitSpecification(null, null, null, null, map.layoutKey);
  const key = `${map.layoutKey}|${map.carClass}`;
  const busy = regenerating === key;
  return (
    <tr className="border-b border-lmu-border/50 align-top hover:bg-lmu-card-hover/60" data-testid="sequence-map-row">
      <td className="px-3 py-2 min-w-64">
        <span className="block text-lmu-text font-medium">{spec.officialName}</span>
        <span className="block text-[11px] text-lmu-muted">{spec.layoutName}</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-lmu-text">{classLabel(map.carClass)}</td>
      <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-text" title="Laps the map is built from: it grows to 10, then stays">
        {map.lapCount < MAP_LAPS ? `${map.lapCount} of ${MAP_LAPS}` : map.lapCount}
      </td>
      <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-text">{map.sequenceCount}</td>
      <td className="px-3 py-2 whitespace-nowrap"><OwnCheck map={map} /></td>
      <td className="px-3 py-2 w-full max-w-0"><LastCheck map={map} /></td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => onRegenerate(map.layoutKey, map.carClass)}
          disabled={regenerating !== null}
          aria-label={`Regenerate the ${classLabel(map.carClass)} map of ${spec.officialName} ${spec.layoutName}`}
          className={`${SECONDARY_BUTTON} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          {busy ? 'Regenerating…' : 'Regenerate'}
        </button>
      </td>
    </tr>
  );
};

/**
 * Settings: each layout and class's corner sequence map, how the driver's laps and the latest fastest laps agree with
 * it, and a button that rebuilds it from the fastest laps now. A flagged map stays as it is until regenerated.
 */
export const SequenceMapsCard: React.FC = () => {
  const { data, error, loading, regenerating, regenerate, feedback } = useSequenceMaps();
  const maps = data?.maps ?? [];
  const flagged = maps.filter((map) => map.check && !map.check.agrees).length;
  const aside = data && (
    <span className={`text-xs font-semibold ${flagged ? 'text-lmu-warn' : 'text-lmu-muted'}`}>
      {flagged ? `${pluralize(flagged, 'map')} flagged` : pluralize(maps.length, 'map')}
    </span>
  );
  return (
    <SettingsPanel sectionId="corner-sequences" aside={aside}>
      <p className="text-xs text-lmu-muted">
        Corners are grouped into sequences per track and class, from the class&apos;s 10 fastest laps. After 3 new fast laps
        a map is checked against the fastest laps of the day: one that no longer agrees is flagged here and stays as it is
        until you regenerate it. Regenerating rebuilds the map and the sequence times of every replay on its track.
      </p>
      <FeedbackMessage feedback={feedback} />
      {error !== null && !data ? (
        <FeedbackMessage feedback={{ tone: 'error', text: error instanceof Error ? error.message : 'Could not load the sequence maps' }} />
      ) : loading && !data ? (
        <p className="text-xs text-lmu-muted">Loading sequence maps…</p>
      ) : maps.length === 0 ? (
        <p className="text-xs text-lmu-muted">No maps yet: a track and class gets one once 3 of its laps are stored from replays.</p>
      ) : (
        <div role="region" aria-label="Corner sequence maps" className="max-h-[32rem] overflow-auto border-y border-lmu-border">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th scope="col" className={`${HEAD} text-left`}>Track</th>
                <th scope="col" className={`${HEAD} text-left`}>Class</th>
                <th scope="col" className={`${HEAD} text-right`}>Laps</th>
                <th scope="col" className={`${HEAD} text-right`}>Sequences</th>
                <th scope="col" className={`${HEAD} text-left`}>Your laps</th>
                <th scope="col" className={`${HEAD} text-left`}>Last check</th>
                <th scope="col" className={HEAD}><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {maps.map((map) => (
                <SequenceMapRow
                  key={`${map.layoutKey}|${map.carClass}`}
                  map={map}
                  regenerating={regenerating}
                  onRegenerate={(layoutKey, carClass) => { void regenerate(layoutKey, carClass); }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsPanel>
  );
};
