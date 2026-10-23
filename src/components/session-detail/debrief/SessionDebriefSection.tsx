import { useState } from 'react';
import { ChevronDown, ClipboardList } from 'lucide-react';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { SessionDebriefCard } from './SessionDebriefCard.js';
import { SessionStrategyCard } from './SessionStrategyCard.js';

/**
 * The session's debrief in one collapsed section: opened, the strategy reads at once (the player's own race, from
 * their telemetry recording) and where the time goes waits for its own click (it reads every car's replay).
 */
export function SessionDebriefSection({ session, selectedDriver }: { session: DetailedSession; selectedDriver: DriverData }) {
  const [open, setOpen] = useState(false);
  const strategy = session.sessionType === 'Race' && selectedDriver.driverOrdinal === session.playerDriver?.driverOrdinal;
  const timeLoss = Boolean(session.matchingReplayFile);
  if (!strategy && !timeLoss) return null;
  const parts = [strategy && 'strategy', timeLoss && 'where the time goes'].filter(Boolean).join(' · ');
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
          {strategy && <div className="border-t border-lmu-border/60 pt-4"><SessionStrategyCard sessionId={session.id} /></div>}
          {timeLoss && <div className="border-t border-lmu-border/60 pt-4"><SessionDebriefCard session={session} selectedDriver={selectedDriver} /></div>}
        </div>
      )}
    </div>
  );
}
