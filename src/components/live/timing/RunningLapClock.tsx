import { useEffect, useRef, useState } from 'react';
import { formatRunningTime } from '../liveFormat.js';
import { LapDisplayClock } from './lapDisplayClock.js';

/** Tick in tenths between game updates, keeping the same-lap display monotonic and bounded on lost data. */
export function RunningLapClock({ lapNumber, seconds }: { lapNumber: number; seconds: number | null | undefined }) {
  const [clock] = useState(() => new LapDisplayClock());
  const [shown, setShown] = useState<number | null>(() => seconds != null && Number.isFinite(seconds) && seconds >= 0 ? seconds : null);
  const published = useRef(shown);
  useEffect(() => {
    const publish = (now: number) => {
      const value = clock.read(now);
      const previous = published.current;
      if (previous === value || (previous !== null && value !== null && Math.floor(previous * 10) === Math.floor(value * 10))) return;
      published.current = value;
      setShown(value);
    };
    const now = performance.now();
    clock.update(lapNumber, seconds, now);
    publish(now);
    if (!clock.advancing(now) || typeof requestAnimationFrame !== 'function') return undefined;
    let frame = requestAnimationFrame(function tick(at) {
      publish(at);
      if (clock.advancing(at)) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [clock, lapNumber, seconds]);
  return <>{formatRunningTime(shown)}</>;
}
