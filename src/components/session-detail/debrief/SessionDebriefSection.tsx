import { ClipboardList } from 'lucide-react';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { fetchSessionStrategy } from '../../../api/sessionStrategyApi.js';
import { useRequest } from '../../../api/useRequest.js';
import { SessionStrategyCard } from './SessionStrategyCard.js';
import { OneOffMistake, DrivingHabitsCard } from './DrivingHabitsCard.js';
import { useDrivingHabits } from './useDrivingHabits.js';

function PlayerDebrief({ session, driverName }: { session: DetailedSession; driverName: string }) {
  const race = session.sessionType === 'Race';
  const hasReplay = Boolean(session.matchingReplayFile);
  const { state, retry, unpin } = useDrivingHabits(session, driverName, hasReplay);
  // A race's strategy needs its telemetry recording: without one (online races) the side pane leaves it out.
  const strategy = useRequest(race ? session.id : null, fetchSessionStrategy);
  const hasStrategy = strategy.data !== null || strategy.error !== null;
  const mistake = state.status === 'ready' ? state.habits.mistake : null;
  const hasSidePane = hasStrategy || mistake !== null;

  return (
    <section
      aria-labelledby="session-debrief-title"
      className="bg-lmu-card rounded-2xl border border-lmu-border"
      data-testid="session-debrief-section"
    >
      <header className="flex items-center gap-2 border-b border-lmu-border/60 px-5 pt-5 pb-3">
        <ClipboardList aria-hidden="true" className="size-4 text-lmu-accent-text" />
        <h2 id="session-debrief-title" className="text-sm font-bold text-white uppercase tracking-wider">Session Debrief</h2>
      </header>
      <div className={hasSidePane ? 'grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : undefined}>
        <DrivingHabitsCard state={state} retry={retry} onUnpin={unpin} />
        {hasSidePane && (
          <aside aria-label="Race and lap details" className="min-w-0 rounded-b-2xl border-t border-lmu-border bg-lmu-bg/45 px-5 pt-4 pb-5 lg:rounded-bl-none lg:border-t-0 lg:border-l">
            {hasStrategy && <SessionStrategyCard state={strategy} />}
            {mistake && <div className={hasStrategy ? 'mt-4 border-t border-lmu-border/60 pt-4' : undefined}><OneOffMistake mistake={mistake} /></div>}
          </aside>
        )}
      </div>
    </section>
  );
}

export function SessionDebriefSection({ session, selectedDriver }: { session: DetailedSession; selectedDriver: DriverData }) {
  if (selectedDriver.driverOrdinal !== session.playerDriver?.driverOrdinal) return null;
  if (!session.matchingReplayFile && session.sessionType !== 'Race') return null;
  return <PlayerDebrief key={session.id} session={session} driverName={selectedDriver.name} />;
}
