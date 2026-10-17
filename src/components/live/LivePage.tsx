import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useLiveStream } from '../../api/liveStream.js';
import { LiveFrame } from './LiveFrame.js';
import { LiveDashboardView } from './display/LiveDashboardView.js';
import { PedalBuffer } from './pedalBuffer.js';
import { useLiveDashboardSettings } from '../../api/useLiveDashboardSettings.js';
const LiveDemoPage = lazy(() => import('./demo/LiveDemoPage.js'));

/** The fullscreen live dashboard: session bar, the state of the game, and the pedal trace while on track. */
export function LivePage() {
  const [params] = useSearchParams();
  if (params.has('demo') && params.get('demo') !== 'false' && params.get('demo') !== '0') {
    return <Suspense fallback={null}><LiveDemoPage /></Suspense>;
  }
  return <LiveConnectedPage />;
}

function LiveConnectedPage() {
  const settings = useLiveDashboardSettings();
  const buffer = useMemo(() => new PedalBuffer(settings.pedalTraceSeconds), [settings.pedalTraceSeconds]);
  const { snapshot, connection, timing } = useLiveStream({ onPedals: (batch) => buffer.push(batch.samples) });

  // The app's title comes back when the LMU link leads back to the dashboard.
  useEffect(() => {
    const appTitle = document.title;
    document.title = 'LMU Live';
    return () => { document.title = appTitle; };
  }, []);
  // Stale samples must not reappear after data was lost.
  useEffect(() => { if (connection === 'disconnected') buffer.clear(); }, [connection, buffer]);

  return (
    <LiveFrame>
      <LiveDashboardView snapshot={snapshot} connection={connection} timing={timing} buffer={buffer} />
    </LiveFrame>
  );
}
