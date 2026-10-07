import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ChevronRight, Sliders } from 'lucide-react';
import { DetailedSession, DriverData, ReferenceLaptimeEntry } from '../../../../shared/types/index.js';
import { getDisplayTrackName } from '../../../../shared/domain/formatters.js';
import { normalizeCarClass } from '../../../../shared/domain/paceCategory.js';
import { SessionRulesModal } from '../standings/SessionRulesModal.js';
import { getSessionTypeStyle } from '../../common/sessionTypeStyles.js';
import { ReplayLaunchButton } from '../../common/ReplayLaunchButton.js';
import { BenchmarkLadder } from '../../common/BenchmarkLadder.js';
import { WeekendSessionLink, WeekendSessionType } from '../sessionDetailHelpers.js';
import { TrackCircuitLayout } from '../../track-detail/TrackCircuitLayout.js';
import { SessionConditions, hasSessionConditions } from './SessionConditions.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { linkClickHandler } from '../../../utils/linkClick.js';
import { sessionTelemetryPath } from '../sessionDetailHelpers.js';

/** The neutral jump buttons of the header: the icon carries the only color. */
const JUMP_BUTTON =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-lmu-border bg-lmu-card text-xs font-semibold text-lmu-text-soft hover:text-white hover:border-lmu-rule transition-colors cursor-pointer';

/** Style key, button word and fallback session name of each weekend jump button. */
const WEEKEND_BUTTONS: Record<WeekendSessionType, { style: string; word: string; fallbackName: string }> = {
  practice: { style: 'Practice', word: 'practice', fallbackName: 'P1' },
  qualifying: { style: 'Qualifying', word: 'qualifying', fallbackName: 'Q1' },
  race: { style: 'Race', word: 'race', fallbackName: 'R1' },
};

export interface SessionDetailHeaderProps {
  session: DetailedSession;
  selectedDriver?: DriverData;
  selectedDriverName: string;
  setSelectedDriverName: (name: string) => void;
  onBack: () => void;
  /** The other sessions of the weekend: a jump button each. */
  relatedSessions?: WeekendSessionLink[];
  handleNavigateToSession: (id: string) => void;
  /** Benchmark targets of the layout and class: the circuit's ladder under its name. */
  refEntry?: ReferenceLaptimeEntry | null;
}

export const SessionDetailHeader: React.FC<SessionDetailHeaderProps> = ({
  session,
  selectedDriver,
  selectedDriverName,
  setSelectedDriverName,
  onBack,
  relatedSessions = [],
  handleNavigateToSession,
  refEntry,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleOpenReplay = (targetLap?: number) => {
    navigate(telemetryPath(targetLap));
  };
  const telemetryPath = (targetLap?: number): string => sessionTelemetryPath(
    searchParams, session.matchingReplayFile?.name || '', selectedDriver?.name, targetLap || selectedDriver?.bestLapNum || 1
  );

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

  const hasConditions = hasSessionConditions(session.matchingReplayFile);
  const hasDuckDb = Boolean(session.hasDuckDbTelemetry || session.matchingReplayFile?.hasDuckDbTelemetry);
  const duckFilename = session.duckdbFilename || session.matchingReplayFile?.duckdbFilename;

  // The course and event lines often just repeat the display name; keep only what adds to it.
  const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
  const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const subtitle = [...new Set([session.trackCourse, session.trackEvent].filter((t): t is string => Boolean(t)))]
    .filter((part) => !squash(trackName).includes(squash(part)))
    .join(' • ');

  return (
    <>
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <Link
          to="/dashboard"
          onClick={linkClickHandler(() => onBack())}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-lmu-muted hover:text-white hover:border-lmu-rule transition-colors ${FOCUS_RING}`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sessions
        </Link>

        <div className="flex items-center gap-3">
          {session.matchingReplayFile && (
            <ReplayLaunchButton
              hasDuckDb={hasDuckDb}
              replayName={session.matchingReplayFile.name}
              to={telemetryPath()}
              onClick={() => handleOpenReplay()}
              title={`Matching Replay: ${session.matchingReplayFile.name}${
                hasDuckDb ? `
⚡ Native 100 Hz DuckDB Telemetry: ${duckFilename || 'active'}` : ''
              }
Click to inspect trajectory and telemetry`}
            />
          )}

          {relatedSessions.map((rel) => {
            const targetId = rel.target.id || rel.target.sessionId;
            if (!targetId) return null;
            const button = WEEKEND_BUTTONS[rel.type];
            const name = rel.target.sessionName || button.fallbackName;
            return (
              <Link
                key={targetId}
                to={`/session/${encodeURIComponent(targetId)}`}
                onClick={linkClickHandler(() => handleNavigateToSession(targetId))}
                title={`View ${button.style} session: ${name} (${rel.target.trackVenue})`}
                className={`${JUMP_BUTTON} ${FOCUS_RING}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${getSessionTypeStyle(button.style)?.dot ?? ''}`}
                  aria-hidden="true"
                />
                <span>{`Go to ${button.word} (${name})`}</span>
                <ChevronRight className="w-3.5 h-3.5 text-lmu-muted" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Session Title Card */}
      <div className="bg-lmu-card border border-lmu-border p-6 rounded-2xl grid grid-cols-[160px_minmax(0,1fr)] items-stretch gap-6">
        <TrackCircuitLayout trackName={session.trackVenue} trackCourse={session.trackCourse} size="header" />
        <div className="min-w-0 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap text-xs text-lmu-muted">
                <span
                  className={`px-2 py-0.5 font-bold rounded border uppercase tracking-wider shrink-0 ${
                    getSessionTypeStyle(session.sessionType, session.sessionName)?.chip ?? 'bg-lmu-raised text-lmu-text-soft border-lmu-rule'
                  }`}
                >
                  {session.sessionName} ({session.sessionType})
                </span>
                <span className="font-mono shrink-0">{session.timeString}</span>
                {hasSettings && modeLabel && <><span aria-hidden="true">·</span><span className="text-lmu-text-soft shrink-0">{modeLabel}</span></>}
                {durationLabel && <><span aria-hidden="true">·</span><span className="font-mono text-lmu-text-soft shrink-0">{durationLabel}</span></>}
                {hasConditions && session.matchingReplayFile && (
                  <><span aria-hidden="true">·</span><SessionConditions replay={session.matchingReplayFile} /></>
                )}
              </div>
              <h2 className="mt-1.5 text-2xl font-extrabold text-white max-w-full min-w-0">
                <Link to={`/track/${encodeURIComponent(trackName)}${normalizeCarClass(session.playerDriver?.carClass, session.playerDriver?.carType) ? `?carClass=${encodeURIComponent(normalizeCarClass(session.playerDriver?.carClass, session.playerDriver?.carType))}` : ''}`}
                  className="inline-flex items-center gap-2 group max-w-full min-w-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent"
                  title={`View ${trackName} Track Details`}>
                  <span className="truncate">{trackName}</span>
                  <ChevronRight className="w-5 h-5 text-lmu-muted group-hover:text-white transition-colors shrink-0" />
                </Link>
              </h2>
              {subtitle && <p className="text-xs text-lmu-muted mt-0.5 truncate">{subtitle}</p>}
            </div>

            {/* The rules of the session and whose laps the page shows, one row of 32px controls */}
            <div className="flex items-center gap-2 shrink-0">
              {(hasSettings || hasConditions) && (
                <button
                  type="button"
                  onClick={() => setShowRulesModal(true)}
                  className={`${JUMP_BUTTON} ${FOCUS_RING}`}
                  title="View Rules, Server Configuration & Conditions"
                >
                  <Sliders className="w-3.5 h-3.5 text-lmu-muted shrink-0" aria-hidden="true" />
                  Rules & Config
                </button>
              )}
              <label className="inline-flex items-center gap-2 h-8 pl-3 pr-1 rounded-lg bg-lmu-bg border border-lmu-border hover:border-lmu-rule focus-within:border-lmu-accent transition-colors shrink-0 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-lmu-accent-text">
                <span className="text-[10px] font-semibold text-lmu-muted uppercase tracking-wider shrink-0">Driver</span>
                <select
                  value={selectedDriverName}
                  onChange={(e) => setSelectedDriverName(e.target.value)}
                  className="h-full bg-transparent pr-1 text-sm text-white font-semibold outline-none cursor-pointer"
                >
                  {(session.drivers || []).map((d) => (
                    <option key={d.name} value={d.name} className="bg-lmu-card text-white">
                      {d.isPlayer ? '⭐ ' : ''}
                      {d.name} ({d.carType})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* The circuit's benchmark, under its name as on the track page; the best lap's band is marked */}
          <div className="pt-3 border-t border-lmu-border/50">
            {refEntry ? (
              <BenchmarkLadder benchmark={refEntry} current={selectedDriver?.bestLapPaceCategory} />
            ) : (
              <p className="text-xs text-lmu-muted">No benchmark for this layout and class yet. Update the benchmarks in Settings.</p>
            )}
          </div>
        </div>
      </div>

      <SessionRulesModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        settings={session.settings}
        conditions={session.matchingReplayFile}
      />
    </>
  );
};
