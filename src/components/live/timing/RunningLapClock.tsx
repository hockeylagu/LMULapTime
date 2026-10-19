import { useEffect, useState } from 'react';
import { formatRunningTime } from '../liveFormat.js';
import { LapDisplayClock } from './lapDisplayClock.js';

/** Tick in tenths between game updates, keeping the same-lap display monotonic and bounded on lost data. */
export function RunningLapClock({ lapNumber, seconds, paused = false }: {
  lapNumber: number; seconds: number | null | undefined; paused?: boolean;
}) {
  const [clock] = useState(() => new LapDisplayClock());
  const [shown, setShown] = useState<number | null>(() => seconds != null && Number.isFinite(seconds) && seconds >= 0 ? seconds : null);
  useEffect(() => {
    const publish = (now: number) => {
      const value = clock.read(now);
      setShown(previous => previous !== null && value !== null && Math.floor(previous * 10) === Math.floor(value * 10) ? previous : value);
    };
    const now = performance.now();
    clock.update(lapNumber, seconds, now, !paused);
    publish(now);
    if (paused || !clock.advancing(now) || typeof requestAnimationFrame !== 'function') return undefined;
    let frame = requestAnimationFrame(function tick(at) {
      publish(at);
      if (clock.advancing(at)) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [clock, lapNumber, seconds, paused]);
  return <>{formatRunningTime(shown)}</>;
}
