import React from 'react';
import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import type { LeaderboardLayout } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { CarClassBadge } from '../../common/CarClassBadge.js';
import { carClassLabel, formatDrivenAgo } from '../board/leaderboardFormat.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { linkClickHandler } from '../../../utils/linkClick.js';
import { getTrackOutlineUrl } from '../../../api/trackGeometryApi.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';

export interface TrackRibbonCardProps {
  layout: LeaderboardLayout;
  selected: boolean;
  onSelect: (layout: LeaderboardLayout) => void;
}

/** One layout of the ribbon: its outline, when it was driven last, and where the player stands. */
export const TrackRibbonCard: React.FC<TrackRibbonCardProps> = ({ layout, selected, onSelect }) => {
  const latest = layout.classes.find((c) => c.carClass === layout.lastCarClass) ?? layout.classes[0];
  const carClass = layout.lastCarClass || latest?.carClass || 'LMGT3';
  const targetUrl = `/leaderboard?track=${encodeURIComponent(layout.trackName)}&carClass=${encodeURIComponent(carClass)}`;
  const spec = getCircuitSpecification(layout.trackName, null, null, null, layout.layoutKey);
  const [failedOutline, setFailedOutline] = React.useState<string | null>(null);
  const showOutline = spec.layoutKey !== 'unknown' && failedOutline !== spec.layoutKey;

  return (
    <Link
      to={targetUrl}
      onClick={linkClickHandler(() => onSelect(layout))}
      aria-current={selected ? 'true' : undefined}
      title={`${layout.trackName} — ${layout.layoutName}`}
      className={`snap-start shrink-0 w-56 rounded-xl border p-3 text-left transition-all cursor-pointer ${
        selected
          ? 'border-lmu-rule-strong bg-lmu-raised/50'
          : 'border-lmu-border bg-lmu-bg/60 hover:border-lmu-rule-strong hover:bg-lmu-card'
      } ${FOCUS_RING}`}
    >
      <div className="flex items-start justify-between gap-2">
        {showOutline ? (
          <img
            src={getTrackOutlineUrl(spec.layoutKey)}
            alt=""
            className="w-14 h-14 shrink-0 object-contain"
            onError={() => setFailedOutline(spec.layoutKey)}
          />
        ) : (
          <div className="w-14 h-14 shrink-0 rounded-lg bg-lmu-card border border-lmu-border flex items-center justify-center text-2xl" aria-hidden="true">
            {layout.flagEmoji || <MapPin className="w-5 h-5 text-lmu-muted" />}
          </div>
        )}
        <div className="text-right min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-lmu-muted">{formatDrivenAgo(layout.lastDriven)}</div>
          {latest?.playerRank ? (
            <div className="text-lg font-extrabold font-mono text-white leading-tight">
              P{latest.playerRank}
              <span className="text-xs font-bold text-lmu-muted">/{latest.fieldSize}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 text-xs font-bold text-white truncate">{layout.circuitName}</div>
      <div className="text-[11px] text-lmu-muted truncate">{layout.layoutName}</div>
      {latest && (
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <CarClassBadge carClass={latest.carClass} size="xs" title={carClassLabel(latest.carClass)} />
          <span className="font-mono text-white">{formatTime(latest.playerBest)}</span>
        </div>
      )}
    </Link>
  );
};
