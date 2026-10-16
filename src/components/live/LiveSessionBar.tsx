import type { LiveConnection } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { CarClassBadge } from '../common/CarClassBadge.js';
import { liveCarClass, sessionKindLabel } from './liveScreens.js';

const STATUS: Record<LiveConnection, { label: string; className: string }> = {
  live: { label: 'LIVE', className: 'text-lmu-gain' },
  connecting: { label: 'CONNECTING', className: 'text-lmu-warn' },
  disconnected: { label: 'DISCONNECTED', className: 'text-lmu-loss' },
};

interface LiveSessionBarProps {
  snapshot: LiveSnapshot | null;
  connection: LiveConnection;
}

/** Brand, session, track and class on the left; pause and data status on the right. */
export function LiveSessionBar({ snapshot, connection }: LiveSessionBarProps) {
  const session = snapshot?.session ?? null;
  const inSession = snapshot !== null && snapshot.lifecycle !== 'offline' && snapshot.lifecycle !== 'menu';
  const showSession = session !== null && inSession && connection !== 'disconnected';
  const carClass = showSession ? liveCarClass(session.vehicleName, session.vehicleClass) : null;
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
            {session.trackName && <span className="font-normal text-lmu-muted">{session.trackName}</span>}
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
        {snapshot?.paused && connection !== 'disconnected' && (
          <span className="rounded border border-lmu-warn px-3 py-1 text-lmu-warn">PAUSED</span>
        )}
        <span data-testid="live-status" className={`font-mono ${status.className}`}>{status.label}</span>
      </div>
    </header>
  );
}
