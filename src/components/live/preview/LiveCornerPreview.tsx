import { useEffect, useMemo } from 'react';
import type { LiveSnapshot, LiveTiming } from '../../../../shared/types/live.js';
import { LiveTimingStore } from '../../../api/liveStream.js';
import { LiveFrame } from '../LiveFrame.js';
import { LivePracticeView } from '../LivePracticeView.js';
import { LiveSessionBar } from '../LiveSessionBar.js';
import { LivePedalTrace } from '../LivePedalTrace.js';
import { PedalBuffer } from '../pedalBuffer.js';
import { lastLap, UNKNOWN } from '../liveFormat.js';
import { useLiveDashboardSettings } from '../../../api/useLiveDashboardSettings.js';

// Illustrative data only. This preview never opens the live stream or computes coaching.
const SNAPSHOT: LiveSnapshot = {
  sequence: 0, receivedAt: 0, lifecycle: 'driving', paused: false,
  session: {
    kind: 'practice', sessionCode: 1, gamePhase: 5, inRealtime: true,
    trackName: 'Bahrain', vehicleName: 'Ligier JS P325', vehicleClass: 'LMP3',
    elapsedSeconds: 750, endSeconds: 3600, playerLapsCompleted: 6, playerPlace: 1,
  },
  identity: { layoutKey: null, layoutName: 'Bahrain GP', carClass: 'LMP3', personalBestSeconds: 123.46 },
  lapsLeft: null, loadingProgress: null, strategy: null,
  weather: { trackTempC: 32, trackTempTrend: 'steady', raining: 0, avgPathWetness: 0, wetnessTrend: 'steady' },
  recentLaps: [
    { lapNumber: 5, lapSeconds: 124.182, sectors: [39.9, 45.7, 38.582], valid: true },
    { lapNumber: 6, lapSeconds: 123.46, sectors: [39.65, 45.23, 38.58], valid: true },
  ],
  sessionBest: { lapSeconds: 123.46, lapSectors: [39.65, 45.23, 38.58], bestSectors: [39.65, 45.23, 38.58], bestPossibleSeconds: 123.46 },
};

/** The last corner against the reference lap; null before a corner has been compared. */
export interface CornerSample { turn: string; lossSeconds: number; minKmh: number; refKmh: number }

const CORNER: CornerSample = { turn: 'T4', lossSeconds: 0.24, minKmh: 84, refKmh: 92 };

/**
 * Two fixed columns on one grid: the corner over MIN, the loss over REF, each label directly above its value and
 * everything left-aligned on the column edge. The columns are sized in the value font (3 ch for T19 or 299; the
 * rest for +9.99 s), so a new corner, a bigger loss, a 3-digit speed or a missing value never moves anything.
 */
const LABEL = 'self-end font-sans text-[32px] font-normal leading-none text-lmu-text-soft';

/** A reviewable cockpit-scale mockup, opened explicitly with #/live?preview=corners. */
export default function LiveCornerPreview({ embedded = false, corner = CORNER, pedalBuffer, snapshot = SNAPSHOT, timing }: {
  embedded?: boolean; corner?: CornerSample | null; pedalBuffer?: PedalBuffer; snapshot?: LiveSnapshot; timing?: LiveTiming;
}) {
  const settings = useLiveDashboardSettings(!embedded);
  const { store, buffer } = useMemo(() => {
    const store = new LiveTimingStore();
    store.set(timing ?? { lapNumber: 7, sector: 2, lapElapsedSeconds: 57.24, sectors: [39.77, null, null], deltaSeconds: 0.36, sectorDeltas: [0.12, null, null] });
    const buffer = new PedalBuffer(settings.pedalTraceSeconds);
    buffer.push(Array.from({ length: settings.pedalTraceSeconds * 50 + 1 }, (_, index) => {
      const t = index / 50;
      const phase = t % 10;
      return {
        t,
        brake: phase < 1.1 ? phase / 1.1 * 0.92 : phase < 3.4 ? 0.92 * (1 - (phase - 1.1) / 2.3) ** 2 : 0,
        throttle: phase < 3.6 ? 0 : Math.min(1, (phase - 3.6) / 2.2),
      };
    }));
    return { store, buffer };
  }, [timing, settings.pedalTraceSeconds]);

  useEffect(() => {
    if (embedded) return;
    const previous = document.title;
    document.title = 'LMU Live · Corner cue preview';
    return () => { document.title = previous; };
  }, [embedded]);

  const content = <>
      <LiveSessionBar snapshot={snapshot} connection="live" />
      <LivePracticeView snapshot={snapshot} store={store} />
      <section aria-label={`Pedal trace and last corner comparison against lap ${lastLap(snapshot.recentLaps)?.lapNumber ?? 'unknown'}`} className="grid h-[294px] shrink-0 grid-cols-[440px_1fr] grid-rows-[minmax(0,1fr)] gap-4 border-t border-lmu-border pt-2">
        <div className="grid grid-flow-col grid-cols-[3ch_1fr] grid-rows-[auto_auto_auto] content-center gap-x-8 gap-y-3 whitespace-nowrap border-r border-lmu-border pr-4 font-mono text-[80px] font-bold leading-none tabular-nums">
          <h2>{corner?.turn ?? UNKNOWN}</h2>
          <span className={LABEL}>MIN</span>
          <b aria-label={corner ? `Minimum speed ${Math.round(corner.minKmh)} kilometres per hour` : 'Minimum speed unknown'} className="font-semibold">{corner ? Math.round(corner.minKmh) : UNKNOWN}</b>
          <span className="text-lmu-loss" aria-label={corner ? `Lost ${corner.lossSeconds.toFixed(2)} seconds` : 'Loss unknown'}>
            <span className="inline-block w-[5ch]">{corner ? `+${Math.min(corner.lossSeconds, 9.99).toFixed(2)}` : UNKNOWN}</span><span className="ml-3 font-sans text-[48px] font-normal">s</span>
          </span>
          <span className={LABEL}>REF</span>
          <b aria-label={corner ? `Reference speed ${Math.round(corner.refKmh)} kilometres per hour` : 'Reference speed unknown'} className="font-semibold">{corner ? Math.round(corner.refKmh) : UNKNOWN}</b>
        </div>
        <div className="min-h-0 min-w-0 overflow-hidden"><LivePedalTrace buffer={pedalBuffer ?? buffer} /></div>
      </section>
  </>;
  if (embedded) return content;
  return <LiveFrame>
    <div className="flex shrink-0 items-center justify-between text-[28px] text-lmu-warn">
      <span>DESIGN PREVIEW · SAMPLE DATA</span>
      <a href="#/live" className="text-lmu-text-soft underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-lmu-accent-text">Return to live dashboard</a>
    </div>
    {content}
  </LiveFrame>;
}
