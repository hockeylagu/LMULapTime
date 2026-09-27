import React from 'react';
import { Video, Zap, CloudRain } from 'lucide-react';

export interface ReplayIndicatorProps {
  replay?: {
    name: string;
    path?: string;
    hasDuckDbTelemetry?: boolean;
    duckdbFilename?: string;
    hasRain?: boolean;
    maxRainIntensity?: number;
    weatherCondition?: 'Dry' | 'Wet' | 'Dynamic Weather';
  } | null;
  hasDuckDbTelemetry?: boolean;
  duckdbFilename?: string;
  hideIfEmpty?: boolean;
  className?: string;
  onClick?: () => void;
}

export const ReplayIndicator: React.FC<ReplayIndicatorProps> = ({
  replay,
  hasDuckDbTelemetry = false,
  duckdbFilename,
  hideIfEmpty = false,
  className = '',
  onClick,
}) => {
  if (!replay) {
    if (hideIfEmpty) return null;
    return <span className="text-lmu-muted text-xs">-</span>;
  }

  const isDuckDb = Boolean(hasDuckDbTelemetry || replay.hasDuckDbTelemetry);
  const activeDuckFilename = duckdbFilename || replay.duckdbFilename;
  const isWet = Boolean(replay.hasRain || replay.weatherCondition === 'Wet' || replay.weatherCondition === 'Dynamic Weather');

  const indicatorClassName = isDuckDb
    ? `inline-flex items-center gap-1 p-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/40 shrink-0 ${className}`
    : isWet
    ? `inline-flex items-center gap-1 p-1.5 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/40 shrink-0 ${className}`
    : `inline-flex p-1.5 rounded-lg bg-lmu-green/10 text-lmu-green border border-lmu-green/20 shrink-0 ${className}`;

  const rainSuffix = isWet
    ? ` | 🌧️ ${replay.weatherCondition || 'Wet'} (Rain: ${replay.maxRainIntensity ?? 'Yes'})`
    : '';

  const title = isDuckDb
    ? `⚡ 100Hz DuckDB Telemetry & Replay: ${replay.name}${activeDuckFilename ? ` (${activeDuckFilename})` : ''}${rainSuffix}`
    : `Replay VCR: ${replay.name}${rainSuffix}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className={`${indicatorClassName} ${isDuckDb ? 'hover:bg-amber-500/25' : isWet ? 'hover:bg-blue-500/25' : 'hover:bg-lmu-green/20'} transition-colors cursor-pointer`}
        title={`${title} - Open telemetry`}
        aria-label="Open replay telemetry"
      >
        {isDuckDb ? (
          <>
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider hidden sm:inline">100Hz</span>
          </>
        ) : (
          <Video className="w-4 h-4" />
        )}
        {isWet && <CloudRain className="w-3.5 h-3.5 text-blue-400" />}
      </button>
    );
  }

  return (
    <span className={indicatorClassName} title={title}>
      {isDuckDb ? (
        <>
          <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider hidden sm:inline">100Hz</span>
        </>
      ) : (
        <Video className="w-4 h-4" />
      )}
      {isWet && <CloudRain className="w-3.5 h-3.5 text-blue-400" />}
    </span>
  );
};
