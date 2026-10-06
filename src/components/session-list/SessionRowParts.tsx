import React from 'react';
import { AlertCircle } from 'lucide-react';
import { SessionListItem } from './sessionListTypes.js';
import { getSessionTypeStyle } from '../common/sessionTypeStyles.js';

/**
 * Session name (R1, Q1, P2) in its session type's hue (`SESSION_TYPE_STYLES`), at a fixed minimum
 * width so the names line up down the column. Other types (warm-up) stay neutral.
 */
export const SessionTypeChip: React.FC<{ session: Pick<SessionListItem, 'sessionType' | 'sessionName'>; className?: string }> = ({ session, className = '' }) => {
  const style = getSessionTypeStyle(session.sessionType, session.sessionName);
  return (
    <span
      className={`inline-flex justify-center min-w-[34px] px-1.5 py-0.5 font-mono text-[11px] font-bold rounded border uppercase tracking-wider ${
        style ? style.chip : 'bg-lmu-raised text-lmu-text-soft border-lmu-rule'
      } ${className}`}
      title={session.sessionType}
    >
      {session.sessionName || session.sessionType}
    </span>
  );
};

const isQualifying = (s: SessionListItem) => s.sessionType === 'Qualifying' || Boolean(s.sessionName?.toLowerCase().includes('quali'));

/** Race finish (with places gained or lost) or qualifying position; P1 in gold, the one best there is. */
export const FinishPosition: React.FC<{ session: SessionListItem; label?: boolean }> = ({ session: s, label = false }) => {
  const p = s.playerDriver;
  if (!p?.position) return null;
  const isRace = s.sessionType === 'Race';
  if (!isRace && !isQualifying(s)) return null;

  const gain = isRace ? p.positionGain : null;
  const title = isRace
    ? p.gridPosition ? `Started P${p.gridPosition}, finished P${p.position}` : `Finished P${p.position}`
    : `Qualified P${p.position}`;

  return (
    <span className="inline-flex items-baseline gap-1 font-mono text-xs" title={title}>
      {label && <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-lmu-muted">{isRace ? 'Finish' : 'Qual'}</span>}
      <span className={`font-bold ${p.position === 1 ? 'text-lmu-gold' : 'text-white'}`}>P{p.position}</span>
      {gain !== null && gain !== undefined && (
        <span className={`text-[11px] font-semibold ${gain > 0 ? 'text-lmu-gain' : gain < 0 ? 'text-lmu-loss' : 'text-lmu-muted'}`}>
          {gain > 0 ? `+${gain}` : gain === 0 ? '±0' : gain}
        </span>
      )}
    </span>
  );
};

/** A session with no timed laps: amber text on a rim, no fill, so it reads as a note rather than an alarm. */
export const EmptyChip: React.FC = () => (
  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider text-lmu-warn border border-lmu-warn-strong/40 inline-flex items-center gap-1">
    <AlertCircle className="w-3 h-3" /> Empty
  </span>
);
