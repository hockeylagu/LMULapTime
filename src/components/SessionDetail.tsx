import React, { useState, useEffect } from 'react';
import { ArrowLeft, Video, Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import { DetailedSession } from '../../server/types.js';
import { formatTime } from '../utils/formatters.js';

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
}

export const SessionDetail: React.FC<SessionDetailProps> = ({ sessionId, onBack }) => {
  const [session, setSession] = useState<DetailedSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDriverName, setSelectedDriverName] = useState<string>('');
  const [copiedReplay, setCopiedReplay] = useState<boolean>(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/session/${sessionId}`)
      .then(res => res.json())
      .then(data => {
        setSession(data);
        if (data.playerDriver) {
          setSelectedDriverName(data.playerDriver.name);
        } else if (data.drivers && data.drivers.length > 0) {
          setSelectedDriverName(data.drivers[0].name);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load session:', err);
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="py-20 text-center text-lmu-muted glass-panel rounded-2xl">
        <div className="inline-block animate-spin w-8 h-8 border-4 border-lmu-accent border-t-transparent rounded-full mb-3" />
        <p className="text-sm font-medium">Loading session telemetry and lap data...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="py-12 text-center text-lmu-muted glass-panel rounded-2xl">
        <p className="text-lg font-bold text-white mb-3">Session Not Found</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-lmu-accent text-white rounded-xl font-medium text-xs uppercase"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const selectedDriver = session.drivers.find(d => d.name === selectedDriverName) || session.drivers[0];

  const handleCopyReplayPath = () => {
    if (session.matchingReplayFile) {
      navigator.clipboard.writeText(session.matchingReplayFile.path);
      setCopiedReplay(true);
      setTimeout(() => setCopiedReplay(false), 2000);
    }
  };

  const handleExportCsv = () => {
    if (!selectedDriver) return;
    const headers = ['Lap', 'LapTime_Seconds', 'LapTime_Formatted', 'S1', 'S2', 'S3', 'TopSpeed_kmh', 'FrontTire', 'RearTire', 'PitStop', 'Valid'];
    const rows = selectedDriver.laps.map(l => [
      l.lapNum,
      l.lapTime || '',
      l.lapTimeString,
      l.s1 || '',
      l.s2 || '',
      l.s3 || '',
      l.topSpeed || '',
      l.fCompound,
      l.rCompound,
      l.isPitStop ? 'Yes' : 'No',
      l.isValid ? 'Yes' : 'No',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${session.trackVenue}_${session.sessionName}_${selectedDriver.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-lmu-muted hover:text-white hover:border-lmu-accent transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sessions
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-white hover:border-lmu-green transition-all"
          >
            <Download className="w-4 h-4 text-lmu-green" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Session Title Card */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${
                session.sessionType === 'Race' ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30' :
                session.sessionType === 'Qualifying' ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30' :
                'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
              }`}>
                {session.sessionName} ({session.sessionType})
              </span>
              <span className="text-xs text-lmu-muted">{session.timeString}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-white mt-1">{session.trackVenue}</h2>
            <p className="text-xs text-lmu-muted mt-0.5">{session.trackCourse} • {session.trackEvent || 'Session'}</p>
          </div>

          {/* Driver Selector */}
          <div className="flex items-center gap-3 bg-lmu-bg p-2 rounded-xl border border-lmu-border">
            <span className="text-xs font-semibold text-lmu-muted uppercase">Driver:</span>
            <select
              value={selectedDriverName}
              onChange={(e) => setSelectedDriverName(e.target.value)}
              className="bg-lmu-card border border-lmu-border rounded-lg px-3 py-1.5 text-sm text-white font-medium focus:outline-none focus:border-lmu-accent"
            >
              {session.drivers.map(d => (
                <option key={d.name} value={d.name}>
                  {d.isPlayer ? '⭐ ' : ''}{d.name} ({d.carType})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Replay file banner if matched */}
        {session.matchingReplayFile && (
          <div className="p-3 rounded-xl bg-lmu-green/10 border border-lmu-green/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-lmu-green font-medium truncate">
              <Video className="w-4 h-4 shrink-0" />
              <span>Matching Replay (.VCR): <strong className="text-white">{session.matchingReplayFile.name}</strong></span>
            </div>
            <button
              onClick={handleCopyReplayPath}
              className="px-3 py-1 rounded bg-lmu-green/20 hover:bg-lmu-green/30 text-lmu-green font-semibold text-xs transition-all shrink-0"
            >
              {copiedReplay ? 'Path Copied!' : 'Copy Path'}
            </button>
          </div>
        )}
      </div>

      {/* Selected Driver Summary Cards */}
      {selectedDriver && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-panel p-4 rounded-xl">
            <p className="text-xs text-lmu-muted uppercase font-semibold">Best Lap Time</p>
            <h4 className="text-2xl font-extrabold text-lmu-gold font-mono mt-1">
              {selectedDriver.bestLapTimeString}
            </h4>
          </div>

          <div className="glass-panel p-4 rounded-xl">
            <p className="text-xs text-lmu-muted uppercase font-semibold">Theoretical Best</p>
            <h4 className="text-2xl font-extrabold text-lmu-green font-mono mt-1">
              {selectedDriver.theoreticalBestString}
            </h4>
          </div>

          <div className="glass-panel p-4 rounded-xl">
            <p className="text-xs text-lmu-muted uppercase font-semibold">Best Sectors (S1 / S2 / S3)</p>
            <p className="text-xs font-mono text-white mt-1">
              S1: <span className="text-lmu-gold font-bold">{formatTime(selectedDriver.bestS1)}</span>
            </p>
            <p className="text-xs font-mono text-white">
              S2: <span className="text-lmu-blue font-bold">{formatTime(selectedDriver.bestS2)}</span>
            </p>
            <p className="text-xs font-mono text-white">
              S3: <span className="text-lmu-green font-bold">{formatTime(selectedDriver.bestS3)}</span>
            </p>
          </div>

          <div className="glass-panel p-4 rounded-xl">
            <p className="text-xs text-lmu-muted uppercase font-semibold">Car & Class</p>
            <h4 className="text-sm font-bold text-white mt-1 truncate">{selectedDriver.carType}</h4>
            <p className="text-xs text-lmu-muted mt-0.5">{selectedDriver.carClass} • Car #{selectedDriver.carNumber}</p>
          </div>
        </div>
      )}

      {/* Detailed Lap Table */}
      <div className="glass-panel p-5 rounded-2xl">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center justify-between">
          <span>Lap Telemetry Table ({selectedDriver?.laps.length || 0} Laps)</span>
          <span className="text-xs font-normal text-lmu-muted">Deltas compared to driver's session best</span>
        </h3>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs text-lmu-muted">
            <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
              <tr>
                <th className="px-3 py-3">Lap</th>
                <th className="px-3 py-3">Pos</th>
                <th className="px-3 py-3 text-right">Lap Time</th>
                <th className="px-3 py-3 text-right">Delta</th>
                <th className="px-3 py-3 text-right">Sector 1</th>
                <th className="px-3 py-3 text-right">Sector 2</th>
                <th className="px-3 py-3 text-right">Sector 3</th>
                <th className="px-3 py-3 text-right">Top Speed</th>
                <th className="px-3 py-3 text-center">Tire Compound</th>
                <th className="px-3 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lmu-border/50 font-mono">
              {selectedDriver?.laps.map(l => {
                const isBest = l.lapTime === selectedDriver.bestLapTime;
                let deltaStr = '--';
                if (l.lapTime && selectedDriver.bestLapTime) {
                  const delta = l.lapTime - selectedDriver.bestLapTime;
                  deltaStr = delta === 0 ? 'PERSONAL BEST' : `+${delta.toFixed(3)}s`;
                }

                const isS1Best = l.s1 === selectedDriver.bestS1;
                const isS2Best = l.s2 === selectedDriver.bestS2;
                const isS3Best = l.s3 === selectedDriver.bestS3;

                return (
                  <tr
                    key={l.lapNum}
                    className={`hover:bg-lmu-card/50 transition-colors ${
                      isBest ? 'bg-lmu-gold/10' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-bold text-white">{l.lapNum}</td>
                    <td className="px-3 py-2.5 text-lmu-muted">{l.position || '-'}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${
                      isBest ? 'text-lmu-gold' : 'text-white'
                    }`}>
                      {l.lapTimeString}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold text-xs ${
                      isBest ? 'text-lmu-gold' : 'text-lmu-muted'
                    }`}>
                      {deltaStr}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${
                      isS1Best ? 'text-lmu-gold font-bold' : ''
                    }`}>
                      {formatTime(l.s1)}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${
                      isS2Best ? 'text-lmu-blue font-bold' : ''
                    }`}>
                      {formatTime(l.s2)}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${
                      isS3Best ? 'text-lmu-green font-bold' : ''
                    }`}>
                      {formatTime(l.s3)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-white">
                      {l.topSpeed ? `${l.topSpeed.toFixed(1)} km/h` : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-sans text-xs">
                      {l.fCompound || l.rCompound ? (
                        <span className="px-2 py-0.5 rounded bg-lmu-border text-white">
                          {l.fCompound || l.rCompound}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-sans">
                      {l.isPitStop ? (
                        <span className="px-2 py-0.5 rounded bg-lmu-accent/20 text-lmu-accent text-xs font-semibold">
                          PIT STOP
                        </span>
                      ) : l.isValid ? (
                        <span className="inline-flex items-center gap-1 text-lmu-green text-xs font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Valid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-lmu-gold text-xs font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Incomplete
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
