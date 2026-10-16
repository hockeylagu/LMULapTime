import type { LiveConnection } from '../../api/liveStream.js';
import type { LiveSnapshot, LiveWeather } from '../../../shared/types/live.js';
import { CarClassBadge } from '../common/CarClassBadge.js';
import { formatLapTime, UNKNOWN } from './liveFormat.js';
import { liveCarClass, liveTrackName, sessionKindLabel } from './liveScreens.js';
import { forecastText } from './race/raceAction.js';

const STATUS: Record<LiveConnection, { label: string; className: string }> = {
  live: { label: 'LIVE', className: 'text-lmu-gain' },
  connecting: { label: 'CONNECTING', className: 'text-lmu-warn' },
  disconnected: { label: 'DISCONNECTED', className: 'text-lmu-loss' },
};

const TREND_ARROW: Record<LiveWeather['trackTempTrend'], string> = { rising: '↑', falling: '↓', steady: '→' };
const WETNESS_TREND: Record<LiveWeather['wetnessTrend'], string> = { rising: 'getting wetter', falling: 'drying', steady: 'steady' };

/** Any rain falling or water on the racing line (in the 0.05 steps the server sends) makes the slot about the wet. */
const wetWeather = (weather: LiveWeather | null): LiveWeather | null =>
  weather !== null && (weather.raining > 0 || weather.avgPathWetness > 0) ? weather : null;

interface LiveSessionBarProps {
  snapshot: LiveSnapshot | null;
  connection: LiveConnection;
}

/** Brand, session, track and class on the left; weather, laps left, PR and the data or pause status on the right. */
export function LiveSessionBar({ snapshot, connection }: LiveSessionBarProps) {
  const session = snapshot?.session ?? null;
  const inSession = snapshot !== null && snapshot.lifecycle !== 'offline' && snapshot.lifecycle !== 'menu';
  const showSession = session !== null && inSession && connection !== 'disconnected';
  const identity = snapshot?.identity ?? null;
  const carClass = showSession ? (identity?.carClass ?? liveCarClass(session.vehicleName, session.vehicleClass)) : null;
  const layout = snapshot ? liveTrackName(snapshot) : '';
  const lapsLeft = showSession ? snapshot.lapsLeft : null;
  const personalBest = showSession ? (identity?.personalBestSeconds ?? null) : null;
  const weather = showSession ? snapshot.weather : null;
  const wet = wetWeather(weather);
  const forecast = showSession ? snapshot.strategy?.forecast ?? null : null;
  const status = STATUS[connection];
  const paused = showSession && connection === 'live' && snapshot.paused;
  return (
    <header className="flex h-[88px] shrink-0 items-center justify-between whitespace-nowrap border-b border-lmu-border pb-5 text-[48px] font-semibold">
      <div className="flex items-center gap-7">
        <div className="flex items-center gap-5 font-black tracking-tight">
          <span aria-hidden="true" className="block h-7 w-1 bg-lmu-accent" />
          LMU
        </div>
        {showSession && (
          <>
            <span>{snapshot.lifecycle === 'garage' ? 'GARAGE' : sessionKindLabel(session.kind)}</span>
            {layout && <span className="font-normal text-lmu-muted">{layout}</span>}
            {carClass && (
              // The badge is sized for a dense page; zoom brings it to cockpit scale without a second copy of it.
              <span className="flex shrink-0 items-center" style={{ zoom: 4 }}>
                <CarClassBadge carClass={carClass} size="md" />
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-9">
        {/* Every slot is held for the whole session, showing the unknown mark until its value arrives, so nothing moves. */}
        {/* One weather slot of fixed width, first on the right so its unused width joins the free space between the groups:
            on a wet track its wetness and whether it is getting wetter or drying, else the forecast change, else the track
            temperature. In a race the plan still shows the forecast. */}
        {showSession && (
          <span className="inline-block w-[520px] text-right">
            {wet ? (
              <span data-testid="live-wetness" className="text-lmu-blue" aria-label={`Track wetness, ${WETNESS_TREND[wet.wetnessTrend]}`}>
                TRACK WET{' '}
                <b className="font-mono font-normal">{Math.round(wet.avgPathWetness * 100)}%</b>{' '}
                <span className="inline-block w-[1ch]">{TREND_ARROW[wet.wetnessTrend]}</span>
              </span>
            ) : forecast ? (
              <span data-testid="live-forecast" className="text-lmu-blue">{forecastText(forecast)}</span>
            ) : (
              <span data-testid="live-track-temp" aria-label={weather ? `Track temperature, ${weather.trackTempTrend}` : 'Track temperature'}>
                <span className="text-lmu-muted">TRACK</span>{' '}
                <b className="inline-block min-w-[3ch] text-right font-mono font-normal text-lmu-text-soft">{weather ? `${weather.trackTempC}°` : UNKNOWN}</b>{' '}
                <span className="inline-block w-[1ch]">{weather ? TREND_ARROW[weather.trackTempTrend] : ''}</span>
              </span>
            )}
          </span>
        )}
        {showSession && session.kind === 'race' && (
          <span data-testid="live-laps-left">
            <span className="text-lmu-muted">LAPS LEFT</span>{' '}
            <b className="inline-block min-w-[3ch] text-right font-mono font-semibold">{lapsLeft ? `${lapsLeft.estimated ? '~' : ''}${lapsLeft.laps}` : UNKNOWN}</b>
          </span>
        )}
        {showSession && (
          <span data-testid="live-personal-best" aria-label="Personal record for this circuit layout and class">
            <span className="text-lmu-muted">PR</span> <b className="inline-block min-w-[8ch] text-right font-mono font-normal text-lmu-text-soft">{formatLapTime(personalBest)}</b>
          </span>
        )}
        {/* PAUSED takes the status slot, which is as wide as PAUSED in a session, so pausing moves nothing. */}
        <span data-testid="live-status" className={`font-mono ${showSession ? 'min-w-[6ch] text-right' : ''} ${paused ? 'text-lmu-warn' : status.className}`}>
          {paused ? 'PAUSED' : status.label}
        </span>
      </div>
    </header>
  );
}
