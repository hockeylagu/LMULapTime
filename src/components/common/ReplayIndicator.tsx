import React from 'react';
import { Video } from 'lucide-react';

export interface ReplayIndicatorProps {
  replay?: { name: string; path?: string } | null;
  hideIfEmpty?: boolean;
  className?: string;
  onClick?: () => void;
}

export const ReplayIndicator: React.FC<ReplayIndicatorProps> = ({
  replay,
  hideIfEmpty = false,
  className = '',
  onClick,
}) => {
  if (!replay) {
    if (hideIfEmpty) return null;
    return <span className="text-lmu-muted text-xs">-</span>;
  }

  const indicatorClassName = `inline-flex p-1.5 rounded-lg bg-lmu-green/10 text-lmu-green border border-lmu-green/20 shrink-0 ${className}`;
  const title = `Replay VCR: ${replay.name}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onClick();
        }}
        className={`${indicatorClassName} hover:bg-lmu-green/20 transition-colors cursor-pointer`}
        title={`${title} - Open telemetry`}
        aria-label="Open replay telemetry"
      >
        <Video className="w-4 h-4" />
      </button>
    );
  }

  return (
    <span className={indicatorClassName} title={title}>
      <Video className="w-4 h-4" />
    </span>
  );
};
