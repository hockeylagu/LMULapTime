import { vi } from 'vitest';

type Listener = (event: Event) => void;

/** A stand-in for the browser's EventSource that tests drive by hand. */
export class FakeEventSource {
  public static instances: FakeEventSource[] = [];
  public closed = false;
  private listeners = new Map<string, Listener[]>();

  public constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  public addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  public close(): void {
    this.closed = true;
  }

  /** Delivers a named server event; `data` is sent as JSON. */
  public emit(name: string, data?: unknown): void {
    const event = Object.assign(new Event(name), { data: JSON.stringify(data ?? {}) });
    this.listeners.get(name)?.forEach((listener) => listener(event));
  }

  public static install(): void {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  }

  public static byUrl(url: string): FakeEventSource {
    const found = [...FakeEventSource.instances].reverse().find((source) => source.url === url);
    if (!found) throw new Error(`No EventSource opened for ${url}`);
    return found;
  }
}
