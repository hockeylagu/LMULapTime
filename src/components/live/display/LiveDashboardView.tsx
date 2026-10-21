import type { LiveStreamState } from '../../../api/liveStream.js';
import type { PedalBuffer } from '../pedalBuffer.js';
import { LiveDriving } from '../LiveDriving.js';
import { LivePedalTrace } from '../LivePedalTrace.js';
import { LiveSessionBar, liveStatus } from '../LiveSessionBar.js';
import { LiveDamageRow } from '../race/LiveDamageRow.js';
import { LiveStateScreen } from '../LiveStateScreen.js';
import { liveScreen, type LiveScreen } from '../liveScreens.js';
import { LiveSessionReview } from '../summary/LiveSessionReview.js';

const WAITING: LiveScreen = { title: 'CONNECTING', note: 'WAITING FOR THE DASHBOARD STREAM', muted: true, checks: [], showTrace: false };
const LOST: LiveScreen = { title: 'DATA LOST', note: 'RECONNECTING TO THE SERVER', muted: false, checks: [], showTrace: false };

/** The production dashboard content, shared by the live stream and offline demo. */
export function LiveDashboardView({ snapshot, connection, timing, buffer }: LiveStreamState & { buffer: PedalBuffer }) {
  const screen = connection === 'disconnected' ? LOST : snapshot ? liveScreen(snapshot) : WAITING;
  const driving = connection !== 'disconnected' && snapshot?.lifecycle === 'driving' && snapshot.session !== null ? snapshot : null;
  const review = connection !== 'disconnected' && snapshot?.result && (snapshot.result.kind === 'race' || snapshot.result.kind === 'qualifying') && (snapshot.lifecycle === 'finished' || snapshot.lifecycle === 'garage') ? snapshot.result : null;
  // Damage that matters in a race takes the bar's place, keeping its data status.
  const damage = driving?.session?.kind === 'race' && driving.strategy?.damage?.significant ? driving.strategy.damage : null;
  return <>
    {damage && driving
      ? <LiveDamageRow damage={damage} lapsLeft={driving.lapsLeft?.laps ?? null} status={liveStatus(driving, connection, true)} />
      : <LiveSessionBar snapshot={snapshot} connection={connection} />}
    {review && snapshot ? <LiveSessionReview snapshot={snapshot} result={review} /> : driving ? <LiveDriving snapshot={driving} store={timing} /> : <LiveStateScreen screen={screen} />}
    {screen.showTrace && <div className="h-[294px] shrink-0 border-t border-lmu-border pt-3"><LivePedalTrace buffer={buffer} /></div>}
  </>;
}
