import type { LivePedalSample } from '../../../shared/types/live.js';

/** The trace shows this many seconds. */
export const PEDAL_WINDOW_SECONDS = 20;
/** A hard cap on stored samples (about 100 Hz for the window plus slack), so a bad clock cannot grow it. */
const MAX_SAMPLES = 2600;

/**
 * The last seconds of pedal samples, outside React: the stream pushes into it 20-30 times a second and the trace
 * redraws from it. Time is the session clock; a clock that jumps back (new session) starts the buffer over.
 */
export class PedalBuffer {
  private samples: LivePedalSample[] = [];
  private listeners = new Set<() => void>();

  public get latest(): number | null {
    return this.samples.length ? this.samples[this.samples.length - 1].t : null;
  }

  /** The samples kept (the window plus a second), oldest first. */
  public get visible(): readonly LivePedalSample[] {
    return this.samples;
  }

  public push(batch: readonly LivePedalSample[]): void {
    if (batch.length === 0) return;
    const last = this.latest;
    if (last !== null && batch[0].t < last - 1) this.samples = [];
    for (const sample of batch) {
      const previous = this.latest;
      if (previous !== null && sample.t <= previous) continue;
      this.samples.push(sample);
    }
    const newest = this.latest;
    if (newest !== null) {
      const from = newest - PEDAL_WINDOW_SECONDS - 1;
      let drop = 0;
      while (drop < this.samples.length - 1 && this.samples[drop].t < from) drop += 1;
      if (drop > 0) this.samples.splice(0, drop);
      if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
    this.listeners.forEach((listener) => listener());
  }

  public clear(): void {
    this.samples = [];
    this.listeners.forEach((listener) => listener());
  }

  /** Calls `listener` after every change; returns the unsubscribe function. */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}
