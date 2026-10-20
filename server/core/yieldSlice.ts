/** Longest run of main-thread work before HTTP, SSE and timer callbacks get a turn. */
const YIELD_SLICE_MS = 5;

/**
 * Starts a time slice for a loop of synchronous work. The returned check is true once the slice is
 * used up, and a new slice starts then; the caller awaits `setImmediate` to give the event loop a turn.
 * Turning per slice instead of per item keeps cheap items fast while other callbacks wait at most a slice.
 */
export function startYieldSlice(): () => boolean {
  let start = performance.now();
  return () => {
    const now = performance.now();
    if (now - start < YIELD_SLICE_MS) return false;
    start = now;
    return true;
  };
}
