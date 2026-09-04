import React from 'react';
import { Sliders } from 'lucide-react';
import { SessionSettings } from '../../../server/types.js';

export interface SessionRulesCardProps {
  settings?: SessionSettings;
}

export const SessionRulesCard: React.FC<SessionRulesCardProps> = ({ settings }) => {
  if (
    !settings ||
    (!settings.modeSetting &&
      !settings.serverName &&
      settings.damageMultiplier === undefined &&
      settings.fuelMultiplier === undefined &&
      settings.tireMultiplier === undefined &&
      settings.tireWarmers === undefined &&
      settings.fixedSetups === undefined &&
      (!settings.durationMinutes || settings.durationMinutes <= 0) &&
      (!settings.raceLaps || settings.raceLaps <= 0 || settings.raceLaps >= 2147483640))
  ) {
    return null;
  }

  return (
    <div className="pt-3 border-t border-lmu-border/50 flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold text-white flex items-center gap-1.5 mr-1">
        <Sliders className="w-3.5 h-3.5 text-lmu-accent" />
        Rules & Config:
      </span>

      {settings.modeSetting && (
        <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-semibold">
          🎮 {settings.modeSetting}
        </span>
      )}

      {settings.serverName && (
        <span
          className="px-2.5 py-1 rounded bg-lmu-card text-lmu-cyan border border-lmu-border text-xs font-semibold truncate max-w-[200px]"
          title={settings.serverName}
        >
          🌐 {settings.serverName}
        </span>
      )}

      {settings.damageMultiplier !== undefined && (
        <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
          🛡️ Damage:{' '}
          <strong className={settings.damageMultiplier > 0 ? 'text-amber-300' : 'text-emerald-300'}>
            {settings.damageMultiplier}%
          </strong>
        </span>
      )}

      {settings.fuelMultiplier !== undefined && (
        <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
          ⛽ Fuel: <strong className="text-white">{settings.fuelMultiplier}x</strong>
        </span>
      )}

      {settings.tireMultiplier !== undefined && (
        <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
          🛞 Tire Wear: <strong className="text-white">{settings.tireMultiplier}x</strong>
        </span>
      )}

      {settings.tireWarmers !== undefined && (
        <span
          className={`px-2.5 py-1 rounded border text-xs font-semibold ${
            settings.tireWarmers
              ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
              : 'bg-sky-950/40 text-sky-300 border-sky-500/30'
          }`}
        >
          🔥 {settings.tireWarmers ? 'Warm Tires' : 'Cold Tires'}
        </span>
      )}

      {settings.fixedSetups !== undefined && (
        <span
          className={`px-2.5 py-1 rounded border text-xs font-semibold ${
            settings.fixedSetups
              ? 'bg-purple-950/40 text-purple-300 border-purple-500/30'
              : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
          }`}
        >
          🔧 {settings.fixedSetups ? 'Fixed Setup' : 'Open Setup'}
        </span>
      )}

      {settings.durationMinutes !== undefined && settings.durationMinutes > 0 && (
        <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
          ⏱️ {settings.durationMinutes} min
        </span>
      )}

      {settings.raceLaps !== undefined && settings.raceLaps > 0 && settings.raceLaps < 2147483640 && (
        <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
          🏁 {settings.raceLaps} Laps
        </span>
      )}
    </div>
  );
};
