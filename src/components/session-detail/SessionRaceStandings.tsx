import React from 'react';
import { Trophy, ShieldCheck } from 'lucide-react';
import { DetailedSession } from '../../../server/types.js';
import { formatElapsedSeconds } from '../../utils/formatters.js';

export interface SessionRaceStandingsProps {
  session: DetailedSession;
  selectedDriverName: string;
  setSelectedDriverName: (name: string) => void;
  isMultiClass: boolean;
}

export const SessionRaceStandings: React.FC<SessionRaceStandingsProps> = ({
  session,
  selectedDriverName,
  setSelectedDriverName,
  isMultiClass,
}) => {
  if (!session.drivers || session.drivers.length <= 1) {
    return null;
  }

  return (
    <div className="glass-panel p-5 rounded-2xl relative space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4 text-lmu-gold" />
            <span>Session Classification & Driver Standings ({session.drivers.length} Drivers)</span>
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Full race results, grid starting positions, position gains, and best lap times. Click a driver to inspect their lap telemetry.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs text-lmu-muted">
          <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
            <tr>
              <th className="px-3.5 py-3 text-center">Pos</th>
              {isMultiClass && <th className="px-3.5 py-3 text-center">Class Pos</th>}
              <th className="px-3.5 py-3">Driver</th>
              <th className="px-3.5 py-3">Car & Class</th>
              <th className="px-3.5 py-3 text-center">Grid</th>
              <th className="px-3.5 py-3 text-center">Gain</th>
              <th className="px-3.5 py-3 text-right">Best Lap</th>
              <th className="px-3.5 py-3 text-center">Laps</th>
              <th className="px-3.5 py-3 text-center">Pit Stops</th>
              <th className="px-3.5 py-3 text-center">Safety</th>
              <th className="px-3.5 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lmu-border/50">
            {session.drivers.map((d) => {
              const isPlayer = Boolean(d.isPlayer || (session.playerDriver && d.name === session.playerDriver.name));
              const isSelected = d.name === selectedDriverName;

              return (
                <tr
                  key={d.name}
                  onClick={() => setSelectedDriverName(d.name)}
                  className={`hover:bg-lmu-card/60 transition-colors cursor-pointer ${
                    isSelected ? 'bg-lmu-accent/15 border-l-2 border-lmu-accent' : isPlayer ? 'bg-lmu-gold/10' : ''
                  }`}
                >
                  <td className="px-3.5 py-2.5 text-center font-bold text-white font-mono">
                    P{d.position || '-'}
                  </td>
                  {isMultiClass && (
                    <td className="px-3.5 py-2.5 text-center font-bold text-lmu-cyan font-mono">
                      {d.classPosition ? `P${d.classPosition}` : '-'}
                    </td>
                  )}
                  <td className="px-3.5 py-2.5 font-medium text-white">
                    <div className="flex items-center gap-1.5">
                      {isPlayer && <span className="text-lmu-gold">⭐</span>}
                      <span
                        className={
                          isPlayer ? 'font-bold text-lmu-gold' : isSelected ? 'font-bold text-white' : 'text-white'
                        }
                      >
                        {d.name} {isPlayer ? '(You)' : ''}
                      </span>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="text-white font-medium">{d.carType}</span>
                    <span className="text-lmu-muted ml-1.5 text-[11px]">({d.carClass || 'General'})</span>
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-mono text-white">
                    {d.gridPosition ? `P${d.gridPosition}` : '-'}
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-mono font-bold">
                    {d.positionGain !== null && d.positionGain !== undefined ? (
                      <span
                        className={
                          d.positionGain > 0
                            ? 'text-lmu-green'
                            : d.positionGain < 0
                            ? 'text-rose-400'
                            : 'text-slate-300'
                        }
                      >
                        {d.positionGain > 0 ? `+${d.positionGain}` : d.positionGain}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono font-bold text-lmu-gold">
                    {d.bestLapTimeString}
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-mono text-white">{d.lapsCount}</td>
                  <td className="px-3.5 py-2.5 text-center font-mono text-amber-300">
                    {d.pitStopsCount ?? 0}
                  </td>
                  <td className="px-3.5 py-2.5 text-center">
                    {(() => {
                      const incCount = d.totalIncidents ?? d.incidents?.length ?? 0;
                      const tlCount = d.totalTrackLimits ?? d.trackLimits?.length ?? 0;
                      const penCount = d.totalPenalties ?? d.penalties?.length ?? 0;

                      const tooltip = [
                        `Driver: ${d.name}`,
                        `• Contacts / Incidents: ${incCount}x`,
                        `• Track Limits Warnings: ${tlCount}`,
                        `• Penalties: ${penCount}`,
                        ...(d.penalties && d.penalties.length > 0
                          ? [
                              '',
                              'Penalties:',
                              ...d.penalties.map((p) => {
                                const lapLabel = p.lapNum
                                  ? `Lap ${p.lapNum}`
                                  : p.elapsedSeconds
                                  ? formatElapsedSeconds(p.elapsedSeconds)
                                  : '';
                                return `  - ${lapLabel ? `${lapLabel}: ` : ''}${p.penalty} (${p.reason})`;
                              }),
                            ]
                          : []),
                        ...(d.incidents && d.incidents.length > 0
                          ? [
                              '',
                              'Incidents:',
                              ...d.incidents.slice(0, 8).map((inc) => {
                                const lapLabel = inc.lapNum
                                  ? `Lap ${inc.lapNum}`
                                  : inc.elapsedSeconds
                                  ? formatElapsedSeconds(inc.elapsedSeconds)
                                  : 'Lap ?';
                                const desc =
                                  inc.description ||
                                  (inc.otherVehicle
                                    ? `Contact with ${inc.otherVehicle}`
                                    : inc.type === 'contact'
                                    ? 'Contact with barrier'
                                    : inc.type || 'Incident');
                                return `  - ${lapLabel}: ${desc}`;
                              }),
                              ...(d.incidents.length > 8 ? [`  ...and ${d.incidents.length - 8} more`] : []),
                            ]
                          : []),
                        ...(d.trackLimits && d.trackLimits.length > 0
                          ? [
                              '',
                              'Track Limits:',
                              ...d.trackLimits.slice(0, 6).map((tl) => {
                                const lapLabel = tl.lapNum
                                  ? `Lap ${tl.lapNum}`
                                  : tl.elapsedSeconds
                                  ? formatElapsedSeconds(tl.elapsedSeconds)
                                  : 'Warning';
                                return `  - ${lapLabel}: ${tl.description}`;
                              }),
                              ...(d.trackLimits.length > 6 ? [`  ...and ${d.trackLimits.length - 6} more`] : []),
                            ]
                          : []),
                      ].join('\n');

                      if (incCount === 0 && penCount === 0 && tlCount === 0) {
                        return (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 cursor-help"
                            title={tooltip}
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span>Clean</span>
                          </span>
                        );
                      }

                      if (penCount > 0) {
                        return (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950/70 text-rose-300 border border-rose-500/40 cursor-help"
                            title={tooltip}
                          >
                            <span>🛑 {penCount} Pen</span>
                            {incCount > 0 && (
                              <span className="text-[10px] text-rose-200/70 font-mono">({incCount}x)</span>
                            )}
                          </span>
                        );
                      }

                      if (incCount > 0) {
                        return (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-950/60 text-orange-300 border border-orange-500/30 cursor-help"
                            title={tooltip}
                          >
                            <span>💥 {incCount}x</span>
                            {tlCount > 0 && (
                              <span className="text-[10px] text-amber-300/70 font-mono">({tlCount} TL)</span>
                            )}
                          </span>
                        );
                      }

                      return (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/50 text-amber-300 border border-amber-500/30 cursor-help"
                          title={tooltip}
                        >
                          <span>⚠️ {tlCount} TL</span>
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3.5 py-2.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        (d.finishStatus || '').toLowerCase().includes('dnf')
                          ? 'bg-rose-950/50 text-rose-300'
                          : 'bg-emerald-950/50 text-emerald-300'
                      }`}
                    >
                      {d.finishStatus || (d.position > 0 ? 'Finished' : '-')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
