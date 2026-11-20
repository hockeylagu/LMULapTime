import { useState } from 'react';
import { ChevronDown, ClipboardList } from 'lucide-react';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { resolveVehicle } from '../../../../shared/domain/vehicleMapping.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { SessionStrategyCard } from './SessionStrategyCard.js';
import { WatchNextSessionCard } from './WatchNextSessionCard.js';

/**
 * The player's debrief in one collapsed section, read when opened: what to watch next session (the corner analysis of
 * the replay's passes) and, for a race, the strategy (from their telemetry recording).
 */
export function SessionDebriefSection({ session, selectedDriver }: { session: DetailedSession; selectedDriver: DriverData }) {
  const [open, setOpen] = useState(false);
  const player = selectedDriver.driverOrdinal === session.playerDriver?.driverOrdinal;
  const strategy = player && session.sessionType === 'Race';
  const watch = player && Boolean(session.matchingReplayFile);
  if (!strategy && !watch) return null;
  const parts = [watch && 'watch next session', strategy && 'strategy'].filter(Boolean).join(' · ');
  const ownCar = resolveVehicle(selectedDriver.carType)?.model ?? selectedDriver.carType;
  return (
    <div className="bg-lmu-card rounded-2xl border border-lmu-border" data-testid="session-debrief-section">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={`w-full flex items-center justify-between gap-2 p-5 rounded-2xl text-left ${FOCUS_RING}`}
      >
        <span className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-lmu-warn" />
          <span className="text-sm font-bold text-white uppercase tracking-wider">Debrief</span>
          <span className="text-xs text-lmu-muted">{parts}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-lmu-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {watch && <div className="border-t border-lmu-border/60 pt-4"><WatchNextSessionCard session={session} driverName={selectedDriver.name} ownCar={ownCar} /></div>}
          {strategy && <div className="border-t border-lmu-border/60 pt-4"><SessionStrategyCard sessionId={session.id} /></div>}
        </div>
      )}
    </div>
  );
}
