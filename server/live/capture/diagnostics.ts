import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { randomUUID } from 'node:crypto';

export interface DiagnosticEvent { kind: string; at: number; data: unknown }
export type DiagnosticSink = (event: DiagnosticEvent) => void;
const MAX_BUFFER_BYTES = 256 * 1024;
const CHECKPOINT_MS = 60_000;

/**
 * Disposable JSONL alongside the recording. Async writes; compression only after the post-session tail.
 * `enabled` is the live setting: a change applies from the next session.
 */
export class LiveDiagnostics {
  private readonly files = new Set<DiagnosticFile>();
  private current: DiagnosticFile | null = null;
  public constructor(private readonly directory: string, public enabled = true) {}

  public begin(filename: string, recordingId: string): void {
    this.end();
    if (this.current) this.current.requestEndAt = Date.now();
    if (!this.enabled) {
      this.current = null;
      return;
    }
    const file = new DiagnosticFile(path.join(this.directory,
      `${filename.replace(/\.live\.duckdb$/, '')}.${randomUUID()}.diagnostics.jsonl`));
    this.files.add(file);
    this.current = file;
    file.write({ kind: 'diagnostics-start', at: Date.now(), data: { schemaVersion: 1, recordingId, recordingFilename: filename } });
  }

  /** Bind a request to its original recording, even if it finishes after a session change. */
  public sink(): DiagnosticSink | undefined {
    const file = this.current;
    return file ? event => file.write(event) : undefined;
  }

  public record(event: DiagnosticEvent): void {
    const data = typeof event.data === 'object' && event.data !== null ? event.data as Record<string, unknown> : null;
    const startedAt = data?.startedAt;
    const file = typeof startedAt === 'number' ? [...this.files].find(candidate =>
      candidate.startedAt <= startedAt && startedAt < candidate.requestEndAt) : this.current;
    file?.write(event);
  }

  public end(): void {
    const file = this.current;
    if (!file || file.ending) return;
    file.ending = true;
    file.write({ kind: 'diagnostics-tail', at: Date.now(), data: { milliseconds: 120_000 } });
    const closeWhenIdle = (): void => {
      if (this.current && !this.current.ending) {
        file.timer = setTimeout(closeWhenIdle, 30_000);
        file.timer.unref();
        return;
      }
      if (this.current === file) this.current = null;
      void file.close().finally(() => this.files.delete(file));
    };
    file.timer = setTimeout(closeWhenIdle, 120_000);
    file.timer.unref();
  }

  public async stop(): Promise<void> {
    this.current = null;
    await Promise.all([...this.files].map(file => file.close()));
    this.files.clear();
  }
}

class DiagnosticFile {
  public readonly startedAt = Date.now();
  public requestEndAt = Infinity;
  public ending = false;
  public timer: NodeJS.Timeout | null = null;
  private stream: ReturnType<typeof createWriteStream> | null = null;
  private queue: string[] = [];
  private queuedBytes = 0;
  private dropped = 0;
  private closed = false;
  private failed = false;
  private closing: Promise<void> | null = null;
  private readonly ready: Promise<void>;
  private readonly previous = new Map<string, { key: string; at: number; suppressed: number }>();

  public constructor(private readonly filename: string) {
    this.ready = mkdir(path.dirname(filename), { recursive: true }).then(() => {
      this.stream = createWriteStream(filename, { flags: 'wx' });
      this.stream.on('error', error => this.fail(error));
      this.stream.on('drain', () => this.flush());
      this.flush();
    }).catch(error => this.fail(error));
  }

  private fail(error: unknown): void {
    this.failed = true;
    this.queue = [];
    this.queuedBytes = 0;
    console.error('[Live] Diagnostic sidecar failed:', error instanceof Error ? error.message : String(error));
  }

  public write(event: DiagnosticEvent): void {
    if (this.closed || this.failed) return;
    const data = JSON.stringify(event.data);
    // Response timing changes every request; deduplicate payload/outcome, not timestamps/duration.
    const value = (event.kind === 'rest' || event.kind === 'reader-rest') && typeof event.data === 'object' && event.data !== null
      ? event.data as Record<string, unknown> : null;
    const key = `${event.kind}:${typeof value?.path === 'string' ? value.path : ''}`;
    const content = value ? JSON.stringify({ ...value, startedAt: undefined, finishedAt: undefined, durationMs: undefined }) : data;
    const previous = this.previous.get(key);
    const failure = value && (value.outcome !== 'ok' || value.parser !== 'accepted'
      || value.disposition === 'stale-discarded' || value.disposition === 'ignored');
    if (!failure && previous?.key === content && event.at - previous.at < CHECKPOINT_MS) {
      previous.suppressed++;
      return;
    }
    const line = JSON.stringify({ ...event, suppressed: previous?.suppressed ?? 0, droppedBefore: this.dropped }) + '\n';
    const bytes = Buffer.byteLength(line);
    if (bytes + this.queuedBytes + (this.stream?.writableLength ?? 0) > MAX_BUFFER_BYTES) { this.dropped++; return; }
    this.previous.set(key, { key: content, at: event.at, suppressed: 0 });
    this.dropped = 0;
    this.queue.push(line);
    this.queuedBytes += bytes;
    this.flush();
  }

  private flush(): void {
    if (!this.stream || this.stream.writableNeedDrain || this.failed) return;
    while (this.queue.length) {
      const line = this.queue.shift()!;
      this.queuedBytes -= Buffer.byteLength(line);
      if (!this.stream.write(line)) break;
    }
  }

  public close(): Promise<void> {
    if (this.closing) return this.closing;
    if (this.timer) clearTimeout(this.timer);
    this.closed = true;
    this.closing = this.finish().catch(error => this.fail(error));
    return this.closing;
  }

  private async finish(): Promise<void> {
    await this.ready;
    const stream = this.stream;
    if (!stream || this.failed) return;
    await new Promise<void>(resolve => {
      stream.once('error', () => resolve());
      stream.once('finish', resolve);
      // Closing is off the capture path; end() safely drains the remaining bounded queue.
      for (const line of this.queue) stream.write(line);
      this.queue = [];
      this.queuedBytes = 0;
      stream.end(JSON.stringify({ kind: 'diagnostics-end', at: Date.now(), data: {
        droppedRecords: this.dropped,
        suppressedAtClose: Object.fromEntries([...this.previous].filter(([, value]) => value.suppressed > 0)
          .map(([key, value]) => [key, value.suppressed])),
      } }) + '\n');
    });
    if (this.failed) return;
    const temporary = `${this.filename}.gz.tmp`;
    try {
      await pipeline(createReadStream(this.filename), createGzip(), createWriteStream(temporary, { flags: 'wx' }));
      await rename(temporary, `${this.filename}.gz`);
      await unlink(this.filename);
    } catch (error) { this.fail(error); } // Keep the uncompressed original on failure.
  }
}
