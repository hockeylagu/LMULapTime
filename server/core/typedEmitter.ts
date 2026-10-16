/** A minimal typed event emitter: `Events` maps each event name to its argument list. */
export class TypedEmitter<Events extends { [K in keyof Events]: unknown[] }> {
  private readonly listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  /** Returns the function that removes the listener. */
  public on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): () => void {
    const stored = listener as unknown as (...args: unknown[]) => void;
    const set = this.listeners.get(event) ?? new Set();
    set.add(stored);
    this.listeners.set(event, set);
    return () => { set.delete(stored); };
  }

  public emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        listener(...args);
      } catch (error: unknown) {
        console.warn(`[Events] A listener of "${String(event)}" failed:`, error);
      }
    }
  }
}
