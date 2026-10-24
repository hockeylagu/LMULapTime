import type { LiveConnection } from '../../api/liveStream.js';
import type { LiveSnapshot, LiveWeather } from '../../../shared/types/live.js';
import { CarClassBadge } from '../common/CarClassBadge.js';
import { formatLapTime, UNKNOWN } from './liveFormat.js';
import { liveCarClass, liveTrackName, sessionKindLabel, syncOnReturnToDashboard } from './liveScreens.js';
import { forecastText } from './race/raceAction.js';
import type { ReactNode } from 'react';

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

/**
 * The data status word: LIVE, CONNECTING or DISCONNECTED, or in a session NO REC (the recording stopped:
 * disk, writer), so a missing capture is not found only after the race.
 */
export function liveStatus(snapshot: LiveSnapshot | null, connection: LiveConnection, inSession: boolean): { label: string; className: string } {
  const notRecording = inSession && connection === 'live' && snapshot?.audit?.status === 'unavailable';
  return notRecording ? { label: 'NO REC', className: 'text-lmu-warn' } : STATUS[connection];
}

interface LiveSessionBarProps {
  snapshot: LiveSnapshot | null;
  connection: LiveConnection;
  peripherals?: ReactNode;
}

/** Brand, session, track and class on the left; weather, laps left, PR and the data or pause status on the right. */
export function LiveSessionBar({ snapshot, connection, peripherals }: LiveSessionBarProps) {
  const session = snapshot?.session ?? null;
  const inSession = snapshot !== null && snapshot.lifecycle !== 'offline' && snapshot.lifecycle !== 'menu' && snapshot.lifecycle !== 'loading';
  const showSession = session !== null && inSession && connection !== 'disconnected';
  const identity = snapshot?.identity ?? null;
  const carClass = showSession ? (identity?.carClass ?? liveCarClass(session.vehicleName, session.vehicleClass)) : null;
  const layout = snapshot ? liveTrackName(snapshot) : '';
  const lapsLeft = showSession ? snapshot.lapsLeft : null;
  const personalBest = showSession ? (identity?.personalBestSeconds ?? null) : null;
  const weather = showSession ? snapshot.weather : null;
  const wet = wetWeather(weather);
  const forecast = showSession ? snapshot.strategy?.forecast ?? null : null;
  const status = liveStatus(snapshot, connection, showSession);
  return (
    <header className="flex h-[88px] shrink-0 items-center justify-between whitespace-nowrap border-b border-lmu-border pb-5 text-[48px] font-semibold">
      <div className="flex items-center gap-7">
        {/* A plain hash link: the dashboard page renders without a router of its own (HashRouter follows the hash). */}
        {/* The bar stands on the baseline at the capitals' height (0.71em), so it lines up with the letters. */}
        <a href="#/dashboard" title="Back to the dashboard" onClick={syncOnReturnToDashboard} className="flex items-baseline gap-5 font-black tracking-tight text-lmu-text hover:text-lmu-text-soft">
          <span aria-hidden="true" className="block h-[0.71em] w-1.5 bg-lmu-accent" />
          LMU
        </a>
        {showSession && (
          <>
            <span>{snapshot.lifecycle === 'garage' ? 'GARAGE' : sessionKindLabel(session.kind)}</span>
            {layout && <span className="font-normal text-lmu-muted">{layout}</span>}
            {carClass && (
              // The badge is sized for a dense page; zoom brings it to cockpit scale without a second copy of it.
              <span className="flex shrink-0 items-center" style={{ zoom: 3.5 }}>
                <CarClassBadge carClass={carClass} size="md" />
              </span>
            )}
            {/* The race place follows the class: the race page has no other position line. */}
            {session.kind === 'race' && snapshot.lifecycle !== 'garage' && (
              <span data-testid="live-bar-place" className="inline-block min-w-[3ch] font-mono">
                {session.playerPlace != null ? `P${session.playerPlace}` : UNKNOWN}
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-9">
        {!inSession && peripherals}
        {/* Every slot is held for the whole session, showing the unknown mark until its value arrives, so nothing moves. */}
        {/* One weather slot of fixed width, first on the right so its unused width joins the free space between the groups:
            on a wet track its wetness and whether it is getting wetter or drying, else the forecast change, else the track
            temperature, after DRY when the forecast holds to the end. In a race the plan still shows the forecast. */}
        {showSession && (
          <span className="inline-block w-[520px] text-right">
            {wet ? (
              <span data-testid="live-wetness" className="text-lmu-blue" aria-label={`Track wetness, ${WETNESS_TREND[wet.wetnessTrend]}`}>
                TRACK WET{' '}
                <b className="font-mono font-normal">{Math.round(wet.avgPathWetness * 100)}%</b>{' '}
                <span className="inline-block w-[1ch]">{TREND_ARROW[wet.wetnessTrend]}</span>
              </span>
            ) : forecast && forecast.change !== 'none' ? (
              <span data-testid="live-forecast" className="text-lmu-blue">{forecastText(forecast)}</span>
            ) : (
              <span data-testid="live-track-temp" aria-label={weather ? `Track temperature, ${weather.trackTempTrend}` : 'Track temperature'}>
                {/* Dry to the end of the session: said beside the temperature, so the slot still answers the weather. */}
                {forecast && <><span data-testid="live-forecast">{forecastText(forecast)}</span> · </>}
                <span className="text-lmu-muted">TRACK</span>{' '}
                <b className="inline-block min-w-[3ch] text-right font-mono font-normal text-lmu-text-soft">{weather ? `${weather.trackTempC}°` : UNKNOWN}</b>{' '}
                <span className="inline-block w-[1ch]">{weather ? TREND_ARROW[weather.trackTempTrend] : ''}</span>
              </span>
            )}
          </span>
        )}
        {showSession && session.kind === 'race' && snapshot.lifecycle !== 'garage' && (
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
        {/* NO REC takes the status slot, which is held at its width in a session, so nothing moves. */}
        <span data-testid="live-status" className={`font-mono ${showSession ? 'min-w-[6ch] text-right' : ''} ${status.className}`}>
          {status.label}
        </span>
      </div>
    </header>
  );
}
