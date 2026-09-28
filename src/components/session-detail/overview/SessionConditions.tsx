import React from 'react';
import { CloudRain, CloudDrizzle, Sun, Thermometer } from 'lucide-react';
import { DetailedSession } from '../../../../shared/types/index.js';

type Replay = NonNullable<DetailedSession['matchingReplayFile']>;

const PILL = 'inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 font-semibold text-[11px] border border-slate-700/60';

export function hasSessionConditions(replay: DetailedSession['matchingReplayFile']): boolean {
  return Boolean(replay?.weatherCondition || replay?.ambientTemp !== undefined);
}

/** The weather and temperatures of the session, read from its linked replay, as compact pills. */
export const SessionConditions: React.FC<{ replay: Replay }> = ({ replay }) => {
  const rain = replay.maxRainIntensity ? ` ${replay.maxRainIntensity}` : '';
  const air = replay.ambientTemp;
  const track = replay.trackTemp;
  return (
    <>
      {replay.weatherCondition && (
        <span
          className={`${PILL} ${
            replay.weatherCondition === 'Wet' ? 'text-blue-400'
            : replay.weatherCondition === 'Dynamic Weather' ? 'text-cyan-400'
            : 'text-amber-400'
          }`}
          title={replay.maxRainIntensity ? `${replay.weatherCondition} · Max Rain: ${replay.maxRainIntensity}/25` : `${replay.weatherCondition} track`}
        >
          {replay.weatherCondition === 'Wet' ? (
            <><CloudRain className="w-3 h-3" />Wet{rain}</>
          ) : replay.weatherCondition === 'Dynamic Weather' ? (
            <><CloudDrizzle className="w-3 h-3" />Rain{rain}</>
          ) : (
            <><Sun className="w-3 h-3" />Dry</>
          )}
        </span>
      )}
      {air !== undefined && (
        <span
          className={`${PILL} font-mono text-cyan-300`}
          title={`Air ${air.toFixed(1)}°C${track !== undefined ? ` · Track ${track.toFixed(1)}°C` : ''}`}
        >
          <Thermometer className="w-3 h-3 text-cyan-400" />
          {Math.round(air)}°C{track !== undefined && ` / ${Math.round(track)}°C`}
        </span>
      )}
    </>
  );
};
