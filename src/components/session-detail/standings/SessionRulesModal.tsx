import React, { useEffect } from 'react';
import { X, Sliders, Shield, Fuel, Flame, Wrench, Clock, Flag, Globe, Gamepad2, Disc } from 'lucide-react';
import { SessionSettings } from '../../../../server/types.js';

export interface SessionRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings?: SessionSettings;
}

export const SessionRulesModal: React.FC<SessionRulesModalProps> = ({
  isOpen,
  onClose,
  settings,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !settings) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Session Rules & Configuration"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Rules & Server Configuration</h3>
              <p className="text-xs text-slate-400">Session multipliers, damage, and setup parameters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {settings.modeSetting && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <Gamepad2 className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Mode Setting</div>
                <div className="text-xs font-bold text-white">{settings.modeSetting}</div>
              </div>
            </div>
          )}

          {settings.serverName && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 sm:col-span-2">
              <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-semibold text-slate-400">Server Name</div>
                <div className="text-xs font-bold text-cyan-300 truncate" title={settings.serverName}>
                  {settings.serverName}
                </div>
              </div>
            </div>
          )}

          {settings.damageMultiplier !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Damage Multiplier</div>
                <div className="text-xs font-bold font-mono text-white">
                  <span className={settings.damageMultiplier > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                    {settings.damageMultiplier}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {settings.fuelMultiplier !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <Fuel className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Fuel Multiplier</div>
                <div className="text-xs font-bold font-mono text-white">{settings.fuelMultiplier}x</div>
              </div>
            </div>
          )}

          {settings.tireMultiplier !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <Disc className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Tire Wear Rate</div>
                <div className="text-xs font-bold font-mono text-white">{settings.tireMultiplier}x</div>
              </div>
            </div>
          )}

          {settings.tireWarmers !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <Flame className="w-4 h-4 text-orange-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Tire Blankets</div>
                <div className="text-xs font-bold text-white">
                  {settings.tireWarmers ? 'Warm Tires' : 'Cold Tires'}
                </div>
              </div>
            </div>
          )}

          {settings.fixedSetups !== undefined && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <Wrench className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Car Setups</div>
                <div className="text-xs font-bold text-white">
                  {settings.fixedSetups ? 'Fixed Setup' : 'Open Setup'}
                </div>
              </div>
            </div>
          )}

          {settings.durationMinutes !== undefined && settings.durationMinutes > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <Clock className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Duration</div>
                <div className="text-xs font-bold font-mono text-white">{settings.durationMinutes} min</div>
              </div>
            </div>
          )}

          {settings.raceLaps !== undefined && settings.raceLaps > 0 && settings.raceLaps < 2147483640 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <Flag className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Lap Count</div>
                <div className="text-xs font-bold font-mono text-white">{settings.raceLaps} Laps</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
