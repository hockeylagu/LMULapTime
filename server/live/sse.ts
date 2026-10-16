/** The part of an Express response a server-sent event stream writes to. */
export interface SseSink {
  write(chunk: string): boolean;
  once(event: 'drain', listener: () => void): unknown;
}

/** One SSE message. Returns false when the sink's buffer is full (the caller should stop writing until 'drain'). */
export function writeSseEvent(sink: SseSink, event: string, data: unknown): boolean {
  return sink.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** The headers of an SSE response; `X-Accel-Buffering: no` keeps a reverse proxy from buffering the stream. */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;
