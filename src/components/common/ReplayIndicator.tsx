import React from 'react';
import { Video } from 'lucide-react';

export interface ReplayIndicatorProps {
  replay?: { name: string; path?: string } | null;
  hideIfEmpty?: boolean;
  className?: string;
}

export const ReplayIndicator: React.FC<ReplayIndicatorProps> = ({
  replay,
  hideIfEmpty = false,
  className = '',
}) => {
  if (!replay) {
    if (hideIfEmpty) return null;
    return <span className="text-lmu-muted text-xs">-</span>;
  }

  return (
    <span
      className={`inline-flex p-1.5 rounded-lg bg-lmu-green/10 text-lmu-green border border-lmu-green/20 shrink-0 ${className}`}
      title={`Replay VCR: ${replay.name}`}
    >
      <Video className="w-4 h-4" />
    </span>
  );
};
