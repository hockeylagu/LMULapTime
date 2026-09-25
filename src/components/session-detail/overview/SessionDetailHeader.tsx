import React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Video, Timer, Trophy, Download, ChevronRight, Sliders, Zap } from 'lucide-react';
import { DetailedSession, DriverData, ReferenceLaptimeEntry } from '../../../../server/core/types';
import { getDisplayTrackName } from '../../../utils/formatters.js';
import { normalizeCarClass } from '../../../utils/paceCategory.js';
import { SessionRulesModal } from '../standings/SessionRulesModal.js';
import { SessionReferenceAndSafety } from '../standings/SessionReferenceAndSafety.js';
import { CandidateRelatedSession } from '../sessionDetailHelpers.js';
import { TrackCircuitLayout } from '../../track-detail/TrackCircuitLayout.js';

export interface SessionDetailHeaderProps {
  session: DetailedSession;
  selectedDriver?: DriverData;
  selectedDriverName: string;
  setSelectedDriverName: (name: string) => void;
  onBack: () => void;
  copiedReplay: boolean;
  handleCopyReplayPath: () => void;
  relatedSession: { type: 'qualifying' | 'race'; target: CandidateRelatedSession } | null;
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleOpenReplay = (targetLap?: number) => {
    const telemetryParams = new URLSearchParams(searchParams);
    telemetryParams.set('replayName', session.matchingReplayFile?.name || '');
    telemetryParams.set('lap', String(targetLap || selectedDriver?.bestLapNum || 1));
    navigate(`/telemetry?${telemetryParams.toString()}`);
  };

  const [showRulesModal, setShowRulesModal] = React.useState(false);
  const settings = session.settings;
  const hasSettings = Boolean(
    settings && (
      settings.modeSetting || settings.serverName ||
      settings.damageMultiplier !== undefined || settings.fuelMultiplier !== undefined ||
      settings.tireMultiplier !== undefined || settings.tireWarmers !== undefined ||
      settings.fixedSetups !== undefined || (settings.durationMinutes && settings.durationMinutes > 0) ||
      (settings.raceLaps && settings.raceLaps > 0 && settings.raceLaps < 2147483640)
    )
  );
  const modeLabel = settings?.modeSetting || (settings?.serverName ? 'Multiplayer' : 'Race Weekend');
  const durationLabel = settings?.durationMinutes && settings.durationMinutes > 0
    ? `${settings.durationMinutes} min`
    : settings?.raceLaps && settings.raceLaps > 0 && settings.raceLaps < 2147483640 ? `${settings.raceLaps} Laps` : undefined;

  const hasDuckDb = Boolean(session.hasDuckDbTelemetry || session.matchingReplayFile?.hasDuckDbTelemetry);
  const duckFilename = session.duckdbFilename || session.matchingReplayFile?.duckdbFilename;

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
            <>
              <button
                onClick={() => handleOpenReplay()}
                title={`Matching Replay: ${session.matchingReplayFile.name}${
                  hasDuckDb ? `\n⚡ Native 100 Hz DuckDB Telemetry: ${duckFilename || 'active'}` : ''
                }\nClick to inspect trajectory and telemetry`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm cursor-pointer ${
                  hasDuckDb
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                    : 'border-lmu-green/20 bg-lmu-green/10 text-lmu-green hover:bg-lmu-green/20'
                }`}
              >
                {hasDuckDb ? (
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                ) : (
                  <Video className="w-4 h-4 text-lmu-green" />
                )}
                <span>{hasDuckDb ? 'Open Telemetry' : 'Open Replay'}</span>
                {hasDuckDb && <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">100Hz</span>}
              </button>

              <button
                onClick={handleCopyReplayPath}
                title={`Matching Replay: ${session.matchingReplayFile.name}\nPath: ${session.matchingReplayFile.path}\nClick to copy path`}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
                  copiedReplay
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-lmu-card text-lmu-muted border-lmu-border hover:text-white hover:border-lmu-accent'
                }`}
              >
                {copiedReplay ? 'Path Copied!' : 'Copy Replay'}
              </button>

            </>
          )}

          {relatedSession && (
            <button
              onClick={() => {
                const targetId = relatedSession.target.id || relatedSession.target.sessionId;
                if (targetId) {
                  handleNavigateToSession(targetId);
                }
              }}
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
      <div className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-6 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-4">
              <TrackCircuitLayout trackName={session.trackVenue} trackCourse={session.trackCourse} size="session" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={`px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${
                      session.sessionType === 'Race' ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30'
                      : session.sessionType === 'Qualifying' ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30'
                      : 'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
                    }`}
                  >
                    {session.sessionName} ({session.sessionType})
                  </span>
                  <span className="text-xs text-lmu-muted">{session.timeString}</span>
                </div>
                <h2
                  onClick={() => {
                    const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
                    const carClass = normalizeCarClass(session.playerDriver?.carClass, session.playerDriver?.carType);
                    const suffix = carClass ? `?carClass=${encodeURIComponent(carClass)}` : '';
                    navigate(`/track/${encodeURIComponent(trackName)}${suffix}`);
                  }}
                  className="text-2xl font-extrabold text-white cursor-pointer hover:text-lmu-gold transition-colors inline-flex items-center gap-2 group max-w-full min-w-0"
                  title={`View ${getDisplayTrackName(session.trackVenue, session.trackCourse)} Track Details`}
                >
                  <span className="truncate">{getDisplayTrackName(session.trackVenue, session.trackCourse)}</span>
                  <ChevronRight className="w-5 h-5 text-lmu-muted group-hover:text-lmu-gold group-hover:translate-x-0.5 transition-all shrink-0" />
                </h2>
                <p className="text-xs text-lmu-muted mt-0.5 truncate">
                  {session.trackCourse} • {session.trackEvent || 'Session'}
                </p>
              </div>
            </div>
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

        {/* Lap Reference & Rules Row */}
        {(refEntry || hasSettings) && (
          <div className="pt-3 border-t border-lmu-border/50 flex flex-wrap items-center justify-between gap-3 text-xs">
            <SessionReferenceAndSafety refEntry={refEntry} selectedDriver={selectedDriver} />
            {hasSettings && (
              <button
                type="button"
                onClick={() => setShowRulesModal(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-lmu-card/80 hover:bg-lmu-card border border-lmu-border hover:border-lmu-accent text-xs font-semibold text-white transition-all shadow-sm cursor-pointer group shrink-0 ml-auto md:ml-0"
                title="View Rules & Server Configuration"
              >
                <Sliders className="w-3.5 h-3.5 text-lmu-accent group-hover:rotate-12 transition-transform shrink-0" />
                <span className="text-slate-300">Rules & Config:</span>
                {modeLabel && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-semibold text-[11px] border border-slate-700/60">
                    {modeLabel}
                  </span>
                )}
                {durationLabel && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-semibold text-[11px] border border-slate-700/60">
                    {durationLabel}
                  </span>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      <SessionRulesModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        settings={session.settings}
      />
    </>
  );
};
