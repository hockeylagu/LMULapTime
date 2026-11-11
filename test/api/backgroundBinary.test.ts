import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

/** A Worker double answering each request through `reply`. */
function stubWorkers(reply: (url: string) => {bytes?: ArrayBuffer; error?: string}) {
  const created: string[] = [];
  vi.stubGlobal('location', {href: 'http://localhost:5173/'});
  vi.stubGlobal('Worker', class {
    onmessage: ((event: {data: unknown}) => void) | null = null;
    constructor(url: URL) { created.push(String(url)); }
    postMessage({id, url, end}: {id: number; url: string; end?: number}) { queueMicrotask(() => this.onmessage?.({data: {id, ...reply(end === undefined ? url : `${url}#${end}`)}})); }
  });
  return created;
}

it('reads files on two workers and resolves each request with its own bytes', async () => {
  const created = stubWorkers(url => ({bytes: new TextEncoder().encode(url).buffer}));
  const {fetchBinaryInBackground} = await import('../../src/api/backgroundBinary.js');
  const read = await Promise.all(['/api/a', '/api/b', '/api/c'].map(async path => new TextDecoder().decode(await fetchBinaryInBackground(path))));
  expect(read.map(url => new URL(url).pathname)).toEqual(['/api/a', '/api/b', '/api/c']);
  expect(created).toHaveLength(2);
});

it('rejects with the message the worker reports', async () => {
  stubWorkers(() => ({error: 'Request failed (404): /api/missing'}));
  const {fetchBinaryInBackground} = await import('../../src/api/backgroundBinary.js');
  await expect(fetchBinaryInBackground('/api/missing')).rejects.toThrow('Request failed (404)');
});

it('reads on the main thread where workers do not exist', async () => {
  vi.stubGlobal('Worker', undefined);
  const bytes = new ArrayBuffer(4);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ok: true, arrayBuffer: () => Promise.resolve(bytes)})));
  const {fetchBinaryInBackground} = await import('../../src/api/backgroundBinary.js');
  expect(await fetchBinaryInBackground('/api/a')).toBe(bytes);
});
