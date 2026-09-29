import React, { useEffect } from 'react';
import { X, Sliders, Shield, Fuel, Flame, Snowflake, Wrench, Clock, Flag, Globe, Gamepad2, Disc, Sun, CloudRain, CloudDrizzle, Thermometer } from 'lucide-react';
import { DetailedSession, SessionSettings } from '../../../../shared/types/index.js';

export type SessionConditionsInfo = Pick<NonNullable<DetailedSession['matchingReplayFile']>, 'weatherCondition' | 'maxRainIntensity' | 'ambientTemp' | 'trackTemp'>;

export interface SessionRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings?: SessionSettings;
  conditions?: SessionConditionsInfo;
}

const WEATHER_LABEL = { Dry: 'Dry Track', Wet: 'Wet Track', 'Dynamic Weather': 'Dynamic Weather' } as const;

export const SessionRulesModal: React.FC<SessionRulesModalProps> = ({
  isOpen,
  onClose,
  settings = {},
  conditions,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const weather = conditions?.weatherCondition;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Session Rules & Configuration"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-lmu-card border border-lmu-rule/80 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-lmu-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-lmu-info-strong/10 border border-lmu-info-strong/30 text-lmu-info">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Rules & Server Configuration</h3>
              <p className="text-xs text-lmu-muted">Session multipliers, damage, setup parameters and conditions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-lmu-muted hover:text-white hover:bg-lmu-raised transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {settings.modeSetting && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              <Gamepad2 className="w-4 h-4 text-lmu-info shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Mode Setting</div>
                <div className="text-xs font-bold text-white">{settings.modeSetting}</div>
              </div>
            </div>
          )}

          {settings.serverName && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50 sm:col-span-2">
              <Globe className="w-4 h-4 text-lmu-aqua shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Server Name</div>
                <div className="text-xs font-bold text-lmu-aqua-soft truncate" title={settings.serverName}>
                  {settings.serverName}
                </div>
              </div>
            </div>
          )}

          {settings.damageMultiplier !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              <Shield className="w-4 h-4 text-lmu-warn shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Damage Multiplier</div>
                <div className="text-xs font-bold font-mono text-white">
                  <span className={settings.damageMultiplier > 0 ? 'text-lmu-warn-soft' : 'text-lmu-gain-soft'}>
                    {settings.damageMultiplier}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {settings.fuelMultiplier !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              <Fuel className="w-4 h-4 text-lmu-gain shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Fuel Multiplier</div>
                <div className="text-xs font-bold font-mono text-white">{settings.fuelMultiplier}x</div>
              </div>
            </div>
          )}

          {settings.tireMultiplier !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              <Disc className="w-4 h-4 text-lmu-warn shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Tire Wear Rate</div>
                <div className="text-xs font-bold font-mono text-white">{settings.tireMultiplier}x</div>
              </div>
            </div>
          )}

          {settings.tireWarmers !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              {settings.tireWarmers ? (
                <Flame className="w-4 h-4 text-lmu-orange shrink-0" />
              ) : (
                <Snowflake className="w-4 h-4 text-lmu-info shrink-0" />
              )}
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Tire Blankets</div>
                <div className="text-xs font-bold text-white">
                  {settings.tireWarmers ? 'Warm Tires' : 'Cold Tires (No Warmers)'}
                </div>
              </div>
            </div>
          )}

          {settings.fixedSetups !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              <Wrench className="w-4 h-4 text-lmu-purple shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Car Setups</div>
                <div className="text-xs font-bold text-white">
                  {settings.fixedSetups ? 'Fixed Setup' : 'Open Setup'}
                </div>
              </div>
            </div>
          )}

          {settings.durationMinutes !== undefined && settings.durationMinutes > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              <Clock className="w-4 h-4 text-lmu-info shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Duration</div>
                <div className="text-xs font-bold font-mono text-white">{settings.durationMinutes} min</div>
              </div>
            </div>
          )}

          {settings.raceLaps !== undefined && settings.raceLaps > 0 && settings.raceLaps < 2147483640 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              <Flag className="w-4 h-4 text-lmu-gain shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Lap Count</div>
                <div className="text-xs font-bold font-mono text-white">{settings.raceLaps} Laps</div>
              </div>
            </div>
          )}

          {weather && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              {weather === 'Wet' ? <CloudRain className="w-4 h-4 text-lmu-azure shrink-0" />
                : weather === 'Dynamic Weather' ? <CloudDrizzle className="w-4 h-4 text-lmu-aqua shrink-0" />
                : <Sun className="w-4 h-4 text-lmu-warn shrink-0" />}
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Weather</div>
                <div className="text-xs font-bold text-white">
                  {WEATHER_LABEL[weather]}
                  {conditions?.maxRainIntensity ? <span className="font-mono text-lmu-text-soft"> · max rain {conditions.maxRainIntensity}/25</span> : null}
                </div>
              </div>
            </div>
          )}

          {conditions?.ambientTemp !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              <Thermometer className="w-4 h-4 text-lmu-aqua shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Air Temperature</div>
                <div className="text-xs font-bold font-mono text-white">{conditions.ambientTemp.toFixed(1)}°C</div>
              </div>
            </div>
          )}

          {conditions?.trackTemp !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50">
              <Thermometer className="w-4 h-4 text-lmu-orange shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-lmu-muted">Track Temperature</div>
                <div className="text-xs font-bold font-mono text-white">{conditions.trackTemp.toFixed(1)}°C</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-lmu-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-lmu-raised hover:bg-lmu-rule text-xs font-semibold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
