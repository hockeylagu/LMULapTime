import { useEffect, useMemo } from 'react';
import { useLiveStream } from '../../api/liveStream.js';
import { LiveDriving } from './LiveDriving.js';
import { LiveFrame } from './LiveFrame.js';
import { LivePedalTrace } from './LivePedalTrace.js';
import { LiveSessionBar } from './LiveSessionBar.js';
import { LiveStateScreen } from './LiveStateScreen.js';
import { liveScreen, type LiveScreen } from './liveScreens.js';
import { PedalBuffer } from './pedalBuffer.js';

const WAITING: LiveScreen = { title: 'CONNECTING', note: 'WAITING FOR THE SERVER', muted: true, figures: [], showTrace: false };
const LOST: LiveScreen = { title: 'DATA LOST', note: 'RECONNECTING TO THE SERVER', muted: false, figures: [], showTrace: false };

/** The fullscreen live dashboard: session bar, the state of the game, and the pedal trace while on track. */
export function LivePage() {
  const buffer = useMemo(() => new PedalBuffer(), []);
  const { snapshot, connection, timing } = useLiveStream({ onPedals: (batch) => buffer.push(batch.samples) });

  useEffect(() => { document.title = 'LMU Live'; }, []);
  // Stale samples must not reappear after data was lost.
  useEffect(() => { if (connection === 'disconnected') buffer.clear(); }, [connection, buffer]);

  const screen = connection === 'disconnected' ? LOST : snapshot ? liveScreen(snapshot) : WAITING;
  const driving = connection !== 'disconnected' && snapshot?.lifecycle === 'driving' && snapshot.session !== null ? snapshot : null;
  return (
    <LiveFrame>
      <LiveSessionBar snapshot={snapshot} connection={connection} />
      {driving ? <LiveDriving snapshot={driving} store={timing} /> : <LiveStateScreen screen={screen} />}
      {screen.showTrace && (
        <div className="h-[294px] shrink-0 border-t border-lmu-border pt-3">
          <LivePedalTrace buffer={buffer} />
        </div>
      )}
    </LiveFrame>
  );
}
