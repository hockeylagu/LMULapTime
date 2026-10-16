import type { LiveConnection } from '../../api/liveStream.js';
import type { LiveSnapshot, LiveWeather } from '../../../shared/types/live.js';
import { CarClassBadge } from '../common/CarClassBadge.js';
import { formatLapTime, UNKNOWN } from './liveFormat.js';
import { liveCarClass, sessionKindLabel } from './liveScreens.js';

const STATUS: Record<LiveConnection, { label: string; className: string }> = {
  live: { label: 'LIVE', className: 'text-lmu-gain' },
  connecting: { label: 'CONNECTING', className: 'text-lmu-warn' },
  disconnected: { label: 'DISCONNECTED', className: 'text-lmu-loss' },
};

const TREND_ARROW: Record<LiveWeather['trackTempTrend'], string> = { rising: '↑', falling: '↓', steady: '→' };

interface LiveSessionBarProps {
  snapshot: LiveSnapshot | null;
  connection: LiveConnection;
}

/** Brand, session, track and class on the left; pause and data status on the right. */
export function LiveSessionBar({ snapshot, connection }: LiveSessionBarProps) {
  const session = snapshot?.session ?? null;
  const inSession = snapshot !== null && snapshot.lifecycle !== 'offline' && snapshot.lifecycle !== 'menu';
  const showSession = session !== null && inSession && connection !== 'disconnected';
  const identity = snapshot?.identity ?? null;
  const carClass = showSession ? (identity?.carClass ?? liveCarClass(session.vehicleName, session.vehicleClass)) : null;
  const layout = identity?.layoutName || session?.trackName;
  const lapsLeft = showSession ? snapshot.lapsLeft : null;
  const personalBest = showSession ? (identity?.personalBestSeconds ?? null) : null;
  const weather = showSession ? snapshot.weather : null;
  const status = STATUS[connection];
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
              <span className="inline-block" style={{ zoom: 4 }}>
                <CarClassBadge carClass={carClass} size="md" />
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-9">
        {/* Every slot is held for the whole session, showing the unknown mark until its value arrives, so nothing moves. */}
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
        {showSession && (
          <span data-testid="live-track-temp" aria-label={weather ? `Track temperature, ${weather.trackTempTrend}` : 'Track temperature'}>
            <span className="text-lmu-muted">TRACK</span>{' '}
            <b className="inline-block min-w-[3ch] text-right font-mono font-normal text-lmu-text-soft">{weather ? `${weather.trackTempC}°` : UNKNOWN}</b>{' '}
            <span className="inline-block w-[1ch]">{weather ? TREND_ARROW[weather.trackTempTrend] : ''}</span>
          </span>
        )}
        {/* Held while in a session so pausing does not shift the other items; hidden, not removed. */}
        {showSession && (
          <span data-testid="live-paused" aria-hidden={!snapshot.paused} className={`rounded border border-lmu-warn px-3 py-1 text-lmu-warn ${snapshot.paused ? '' : 'invisible'}`}>PAUSED</span>
        )}
        <span data-testid="live-status" className={`font-mono ${status.className}`}>{status.label}</span>
      </div>
    </header>
  );
}
