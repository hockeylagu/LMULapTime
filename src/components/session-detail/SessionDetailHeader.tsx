import React from 'react';
import { ArrowLeft, Video, Timer, Trophy, Download, ChevronRight } from 'lucide-react';
import { DetailedSession, DriverData, ReferenceLaptimeEntry } from '../../../server/types.js';
import { getDisplayTrackName } from '../../utils/formatters.js';
import { SessionRulesCard } from './SessionRulesCard.js';
import { SessionReferenceAndSafety } from './SessionReferenceAndSafety.js';

export interface SessionDetailHeaderProps {
  session: DetailedSession;
  selectedDriver?: DriverData;
  selectedDriverName: string;
  setSelectedDriverName: (name: string) => void;
  onBack: () => void;
  copiedReplay: boolean;
  handleCopyReplayPath: () => void;
  relatedSession: { type: 'qualifying' | 'race'; target: any } | null;
  handleNavigateToSession: (id: string) => void;
  handleExportCsv: () => void;
  refEntry: ReferenceLaptimeEntry | null;
}

export const SessionDetailHeader: React.FC<SessionDetailHeaderProps> = ({
  session,
  selectedDriver,
  selectedDriverName,
  setSelectedDriverName,
  onBack,
  copiedReplay,
  handleCopyReplayPath,
  relatedSession,
  handleNavigateToSession,
  handleExportCsv,
  refEntry,
}) => {
  return (
    <>
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-lmu-muted hover:text-white hover:border-lmu-accent transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sessions
        </button>

        <div className="flex items-center gap-3">
          {session.matchingReplayFile && (
            <button
              onClick={handleCopyReplayPath}
              title={`Matching Replay: ${session.matchingReplayFile.name}\nPath: ${session.matchingReplayFile.path}\nClick to copy path`}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
                copiedReplay
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-lmu-card text-emerald-400 border-lmu-border hover:border-emerald-500/40 hover:bg-emerald-500/10'
              }`}
            >
              <Video className="w-4 h-4 text-emerald-400" />
              {copiedReplay ? 'Path Copied!' : 'Copy Replay (.VCR)'}
            </button>
          )}

          {relatedSession && (
            <button
              onClick={() => handleNavigateToSession(relatedSession.target.id || relatedSession.target.sessionId)}
              title={
                relatedSession.type === 'qualifying'
                  ? `View Qualifying session: ${relatedSession.target.sessionName || 'Q1'} (${relatedSession.target.trackVenue})`
                  : `View Race session: ${relatedSession.target.sessionName || 'R1'} (${relatedSession.target.trackVenue})`
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer ${
                relatedSession.type === 'qualifying'
                  ? 'bg-lmu-gold/10 text-lmu-gold border-lmu-gold/30 hover:bg-lmu-gold/20 hover:border-lmu-gold'
                  : 'bg-lmu-accent/10 text-lmu-accent border-lmu-accent/30 hover:bg-lmu-accent/20 hover:border-lmu-accent'
              }`}
            >
              {relatedSession.type === 'qualifying' ? (
                <>
                  <Timer className="w-4 h-4 text-lmu-gold" />
                  <span>Go to Quali ({relatedSession.target.sessionName || 'Q1'})</span>
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4 text-lmu-accent" />
                  <span>Go to Race ({relatedSession.target.sessionName || 'R1'})</span>
                </>
              )}
            </button>
          )}

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
              <span
                className={`px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${
                  session.sessionType === 'Race'
                    ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30'
                    : session.sessionType === 'Qualifying'
                    ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30'
                    : 'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
                }`}
              >
                {session.sessionName} ({session.sessionType})
              </span>
              <span className="text-xs text-lmu-muted">{session.timeString}</span>
              {(session.weatherInfo || (session as any).weather?.weatherString) && (
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-lmu-bg border border-lmu-border text-white flex items-center gap-1">
                  {session.weatherInfo || (session as any).weather?.weatherString}
                </span>
              )}
            </div>
            <h2
              onClick={() => {
                const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
                window.location.hash = `#track/${encodeURIComponent(trackName)}`;
              }}
              className="text-2xl font-extrabold text-white mt-1 cursor-pointer hover:text-lmu-gold transition-colors inline-flex items-center gap-2 group max-w-full min-w-0"
              title={`View ${getDisplayTrackName(session.trackVenue, session.trackCourse)} Track Details`}
            >
              <span className="truncate">{getDisplayTrackName(session.trackVenue, session.trackCourse)}</span>
              <ChevronRight className="w-5 h-5 text-lmu-muted group-hover:text-lmu-gold group-hover:translate-x-0.5 transition-all shrink-0" />
            </h2>
            <p className="text-xs text-lmu-muted mt-0.5">
              {session.trackCourse} • {session.trackEvent || 'Session'}
            </p>
          </div>

          {/* Driver Selector */}
          <div className="flex items-center gap-3 bg-lmu-bg p-2 rounded-xl border border-lmu-border">
            <span className="text-xs font-semibold text-lmu-muted uppercase">Driver:</span>
            <select
              value={selectedDriverName}
              onChange={(e) => setSelectedDriverName(e.target.value)}
              className="bg-lmu-card border border-lmu-border rounded-lg px-3 py-1.5 text-sm text-white font-medium focus:outline-none focus:border-lmu-accent"
            >
              {(session.drivers || []).map((d) => (
                <option key={d.name} value={d.name}>
                  {d.isPlayer ? '⭐ ' : ''}
                  {d.name} ({d.carType})
                </option>
              ))}
            </select>
          </div>
        </div>

        <SessionRulesCard settings={session.settings} />
        <SessionReferenceAndSafety refEntry={refEntry} selectedDriver={selectedDriver} />
      </div>
    </>
  );
};
