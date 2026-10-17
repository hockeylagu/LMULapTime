import { createRoot } from 'react-dom/client';
import { LivePage } from '../../../src/components/live/LivePage.js';
import '../../../src/index.css';

interface Metrics {
  events: Record<string, number>;
  deliveryMs: number[];
  drawAgeMs: number[];
  drawMs: number[];
  longTasks: number[];
}
declare global { interface Window { livePerf: Metrics } }
window.livePerf = { events: {}, deliveryMs: [], drawAgeMs: [], drawMs: [], longTasks: [] };
let newestAt = 0;
// Observe the same stream as the hook; adds one JSON parse per pedal event, deliberately reported as observer overhead.
const NativeEventSource = window.EventSource;
window.EventSource = class extends NativeEventSource {
  constructor(url: string | URL, init?: EventSourceInit) {
    super(url, init);
    for (const type of ['snapshot', 'timing', 'pedals', 'heartbeat']) {
      this.addEventListener(type, event => {
        window.livePerf.events[type] = (window.livePerf.events[type] ?? 0) + 1;
        if (type !== 'pedals') return;
        const batch = JSON.parse((event as MessageEvent<string>).data) as { samples: { t: number }[] };
        newestAt = batch.samples[batch.samples.length - 1].t * 1000;
        window.livePerf.deliveryMs.push(Date.now() - newestAt);
      });
    }
  }
};
let drawStart = 0;
const clear = CanvasRenderingContext2D.prototype.clearRect;
CanvasRenderingContext2D.prototype.clearRect = function (...args: Parameters<typeof clear>) {
  drawStart = performance.now();
  return clear.apply(this, args);
};
const stroke = CanvasRenderingContext2D.prototype.stroke as (this: CanvasRenderingContext2D, path?: Path2D) => void;
let strokes = 0;
CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
  if (path) stroke.call(this, path); else stroke.call(this);
  if (++strokes % 3 === 0 && newestAt) {
    window.livePerf.drawAgeMs.push(Date.now() - newestAt);
    window.livePerf.drawMs.push(performance.now() - drawStart);
  }
};
new PerformanceObserver(list => {
  for (const entry of list.getEntries()) window.livePerf.longTasks.push(entry.duration);
}).observe({ type: 'longtask', buffered: true });
createRoot(document.getElementById('root')!).render(<LivePage />);
