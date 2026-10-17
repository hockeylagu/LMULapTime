import { useEffect, useMemo } from 'react';
import { useLiveStream } from '../../api/liveStream.js';
import { LiveDriving } from './LiveDriving.js';
import { LiveFrame } from './LiveFrame.js';
import { LivePedalTrace } from './LivePedalTrace.js';
import { LiveSessionBar } from './LiveSessionBar.js';
import { LiveStateScreen } from './LiveStateScreen.js';
import { liveScreen, type LiveScreen } from './liveScreens.js';
import { PedalBuffer } from './pedalBuffer.js';
import { LiveSessionReview } from './summary/LiveSessionReview.js';

const WAITING: LiveScreen = { title: 'CONNECTING', note: 'WAITING FOR THE DASHBOARD STREAM', muted: true, checks: [], showTrace: false };
const LOST: LiveScreen = { title: 'DATA LOST', note: 'RECONNECTING TO THE SERVER', muted: false, checks: [], showTrace: false };

/** The fullscreen live dashboard: session bar, the state of the game, and the pedal trace while on track. */
export function LivePage() {
  const buffer = useMemo(() => new PedalBuffer(), []);
  const { snapshot, connection, timing } = useLiveStream({ onPedals: (batch) => buffer.push(batch.samples) });

  useEffect(() => { document.title = 'LMU Live'; }, []);
  // Stale samples must not reappear after data was lost.
  useEffect(() => { if (connection === 'disconnected') buffer.clear(); }, [connection, buffer]);

  const screen = connection === 'disconnected' ? LOST : snapshot ? liveScreen(snapshot) : WAITING;
  const driving = connection !== 'disconnected' && snapshot?.lifecycle === 'driving' && snapshot.session !== null ? snapshot : null;
  const review = connection !== 'disconnected' && snapshot?.result && (snapshot.result.kind === 'race' || snapshot.result.kind === 'qualifying') && (snapshot.lifecycle === 'finished' || snapshot.lifecycle === 'garage') ? snapshot.result : null;
  return (
    <LiveFrame>
      <LiveSessionBar snapshot={snapshot} connection={connection} />
      {review && snapshot ? <LiveSessionReview snapshot={snapshot} result={review} /> : driving ? <LiveDriving snapshot={driving} store={timing} /> : <LiveStateScreen screen={screen} />}
      {screen.showTrace && (
        <div className="h-[294px] shrink-0 border-t border-lmu-border pt-3">
          <LivePedalTrace buffer={buffer} />
        </div>
      )}
    </LiveFrame>
  );
}
