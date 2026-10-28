import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRequest, type RequestOptions } from '../../src/api/useRequest.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useRequest', () => {
  it('answers only for the current request and drops the previous answer', async () => {
    const answers = new Map([['a', deferred<string>()], ['b', deferred<string>()]]);
    const load = vi.fn((request: string) => answers.get(request)!.promise);
    const { result, rerender } = renderHook(({ request }) => useRequest(request, load), { initialProps: { request: 'a' } });
    expect(result.current).toMatchObject({ data: null, loading: true, error: null });
    await act(async () => { answers.get('a')!.resolve('A'); });
    expect(result.current).toMatchObject({ data: 'A', loading: false });

    rerender({ request: 'b' });
    expect(result.current).toMatchObject({ data: null, loading: true });
    await act(async () => { answers.get('b')!.resolve('B'); });
    expect(result.current).toMatchObject({ data: 'B', loading: false });
  });

  it('ignores an answer that arrives after the request changed, and aborts it', async () => {
    const first = deferred<string>();
    const signals: AbortSignal[] = [];
    const load = vi.fn((request: string, signal: AbortSignal) => {
      signals.push(signal);
      return request === 'a' ? first.promise : Promise.resolve('B');
    });
    const { result, rerender } = renderHook(({ request }) => useRequest(request, load), { initialProps: { request: 'a' } });
    rerender({ request: 'b' });
    await waitFor(() => expect(result.current.data).toBe('B'));
    expect(signals[0].aborted).toBe(true);
    await act(async () => { first.resolve('A'); });
    expect(result.current.data).toBe('B');
  });

  it('loads a request again when it comes back, without showing its earlier answer', async () => {
    const load = vi.fn(async (request: string) => request.toUpperCase());
    const { result, rerender } = renderHook(({ request }) => useRequest(request, load), { initialProps: { request: 'a' } });
    await waitFor(() => expect(result.current.data).toBe('A'));
    rerender({ request: 'b' });
    rerender({ request: 'a' });
    expect(result.current).toMatchObject({ data: null, loading: true });
    await waitFor(() => expect(result.current.data).toBe('A'));
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('compares requests by value, so an equal new object does not reload', async () => {
    const load = vi.fn(async (request: { id: number }) => request.id);
    const { result, rerender } = renderHook(({ id }) => useRequest({ id }, load), { initialProps: { id: 1 } });
    await waitFor(() => expect(result.current.data).toBe(1));
    rerender({ id: 1 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it('loads nothing for a null request', () => {
    const load = vi.fn(async () => 'x');
    const { result } = renderHook(() => useRequest(null, load));
    expect(result.current).toMatchObject({ data: null, loading: false, error: null });
    expect(load).not.toHaveBeenCalled();
  });

  it('reports a failure for its request and clears it when the request is sent again', async () => {
    let fail = true;
    const load = vi.fn(async () => { if (fail) throw new Error('down'); return 'ok'; });
    const { result } = renderHook(() => useRequest('a', load));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.loading).toBe(false);
    fail = false;
    act(() => result.current.reload());
    expect(result.current).toMatchObject({ error: null, loading: true });
    await waitFor(() => expect(result.current.data).toBe('ok'));
  });

  it('keeps the answer on screen while a refresh or, with keepPrevious, another request loads', async () => {
    const answers: Array<ReturnType<typeof deferred<string>>> = [];
    const load = vi.fn(() => { const next = deferred<string>(); answers.push(next); return next.promise; });
    const initialProps: { request: string; options: RequestOptions } = { request: 'a', options: { refresh: 1 } };
    const { result, rerender } = renderHook(
      ({ request, options }: { request: string; options: RequestOptions }) => useRequest(request, load, options),
      { initialProps });
    await act(async () => { answers[0].resolve('A1'); });

    rerender({ request: 'a', options: { refresh: 2 } });
    expect(result.current).toMatchObject({ data: 'A1', loading: true });
    await act(async () => { answers[1].resolve('A2'); });
    expect(result.current).toMatchObject({ data: 'A2', loading: false });

    rerender({ request: 'b', options: { refresh: 2, keepPrevious: true } });
    expect(result.current).toMatchObject({ data: 'A2', loading: true });
  });
});
