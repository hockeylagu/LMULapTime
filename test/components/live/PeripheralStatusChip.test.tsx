import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeripheralStatusChip, PERIPHERAL_ERROR_POLL_INTERVAL_MS, PERIPHERAL_POLL_INTERVAL_MS } from '../../../src/components/live/PeripheralStatusChip.js';
import { fetchPeripherals } from '../../../src/api/peripheralsApi.js';
import type { PeripheralStatus } from '../../../shared/types/peripherals/peripherals.js';

vi.mock('../../../src/api/peripheralsApi.js', () => ({ fetchPeripherals: vi.fn() }));

const baseStatus: PeripheralStatus = {
  id: 'simagic',
  label: 'Simagic',
  install: 'ready',
  error: null,
  settings: { enabled: true, automatic: true, wheel: { productUuid: 'w1', deviceUuid: 'w1', name: 'GT Neo' } },
  health: { api: 'responsive', process: 'present' },
  observedAt: Date.now(),
  devices: [{ productUuid: 'w1', deviceUuid: 'w1', name: 'GT Neo', role: 'wheel', firmware: null }],
  lastRun: null,
  car: null,
  target: null,
  currentLoad: { key: '', generation: 0, phase: 'idle', skipReason: null },
  busy: false,
  applyBlockedReason: null,
};

describe('PeripheralStatusChip polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('polls at normal interval (30s) when healthy', async () => {
    vi.mocked(fetchPeripherals).mockResolvedValue([baseStatus]);
    render(<PeripheralStatusChip />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchPeripherals).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(PERIPHERAL_ERROR_POLL_INTERVAL_MS); });
    expect(fetchPeripherals).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(PERIPHERAL_POLL_INTERVAL_MS - PERIPHERAL_ERROR_POLL_INTERVAL_MS); });
    expect(fetchPeripherals).toHaveBeenCalledTimes(2);
  });

  it('polls at accelerated interval (5s) when in error or warning', async () => {
    const errorStatus: PeripheralStatus = {
      ...baseStatus,
      health: { api: 'unavailable', process: 'absent' },
    };
    vi.mocked(fetchPeripherals).mockResolvedValue([errorStatus]);
    render(<PeripheralStatusChip />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('SimPro is not running')).toBeInTheDocument();
    expect(fetchPeripherals).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(PERIPHERAL_ERROR_POLL_INTERVAL_MS); });
    expect(fetchPeripherals).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(PERIPHERAL_ERROR_POLL_INTERVAL_MS); });
    expect(fetchPeripherals).toHaveBeenCalledTimes(3);
  });

  it('polls at accelerated interval (5s) when fetch fails', async () => {
    vi.mocked(fetchPeripherals).mockRejectedValue(new Error('Network error'));
    render(<PeripheralStatusChip />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchPeripherals).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(PERIPHERAL_ERROR_POLL_INTERVAL_MS); });
    expect(fetchPeripherals).toHaveBeenCalledTimes(2);
  });
});
