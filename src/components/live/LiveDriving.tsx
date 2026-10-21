import type { LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { LivePracticeView } from './LivePracticeView.js';
import { LiveRaceView } from './LiveRaceView.js';

/** The driving content by session kind; qualifying, warmup and unknown sessions use the practice layout. */
export function LiveDriving({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  switch (snapshot.session?.kind) {
    case 'race': return <LiveRaceView snapshot={snapshot} store={store} />;
    default: return <LivePracticeView snapshot={snapshot} store={store} />;
  }
}
