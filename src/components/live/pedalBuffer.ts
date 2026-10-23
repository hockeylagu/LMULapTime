import type { LivePedalSample } from '../../../shared/types/live.js';
import { DEFAULT_LIVE_SETTINGS, PEDAL_TRACE_SECONDS_CHOICES } from '../../../shared/types/live.js';

/**
 * The last seconds of pedal samples, outside React: the stream pushes into it 20-30 times a second and the trace
 * redraws from it. Time is the session clock; a clock that jumps back (new session) starts the buffer over.
 */
export class PedalBuffer {
  public readonly windowSeconds: number;
  public constructor(windowSeconds = DEFAULT_LIVE_SETTINGS.pedalTraceSeconds) {
    this.windowSeconds = (PEDAL_TRACE_SECONDS_CHOICES as readonly number[]).includes(windowSeconds) ? windowSeconds : DEFAULT_LIVE_SETTINGS.pedalTraceSeconds;
  }
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
      const from = newest - this.windowSeconds - 1;
      let drop = 0;
      while (drop < this.samples.length - 1 && this.samples[drop].t < from) drop += 1;
      const maxSamples = this.windowSeconds * 100 + 600;
      drop = Math.max(drop, this.samples.length - maxSamples);
      // Shifted in place: splice would allocate an array of the dropped samples on every batch.
      if (drop > 0) {
        this.samples.copyWithin(0, drop);
        this.samples.length -= drop;
      }
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
