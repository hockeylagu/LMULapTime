import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/api/apiClient.js', () => ({ fetchJson: vi.fn() }));

import { fetchJson } from '../../src/api/apiClient.js';
import {
  LOGO_RETRY_COOLDOWN_MS, clearCachedVehicleLogos, fetchVehicleLogos, getCachedVehicleLogos,
} from '../../src/api/vehicleLogosApi.js';

const mocked = vi.mocked(fetchJson);

describe('vehicleLogosApi', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    mocked.mockReset();
    clearCachedVehicleLogos();
  });
  afterEach(() => vi.useRealTimers());

  it('shares one request between concurrent callers and caches the result', async () => {
    mocked.mockResolvedValue({ packageRevision: 'r', logos: { Ferrari: '<svg/>' } });
    const [a, b] = await Promise.all([fetchVehicleLogos(), fetchVehicleLogos()]);
    expect(a).toEqual({ Ferrari: '<svg/>' });
    expect(b).toBe(a);
    await fetchVehicleLogos();
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(getCachedVehicleLogos()).toBe(a);
  });

  it('remembers a failure so later mounts do not refetch, then retries after the cool-down', async () => {
    mocked.mockRejectedValueOnce(new Error('down'));
    expect(await fetchVehicleLogos()).toBeNull();
    for (let i = 0; i < 5; i++) expect(await fetchVehicleLogos()).toBeNull();
    expect(mocked).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(LOGO_RETRY_COOLDOWN_MS + 1);
    mocked.mockResolvedValueOnce({ packageRevision: 'r', logos: { Audi: '<svg/>' } });
    expect(await fetchVehicleLogos()).toEqual({ Audi: '<svg/>' });
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('retries immediately after an explicit clear', async () => {
    mocked.mockRejectedValueOnce(new Error('down'));
    await fetchVehicleLogos();
    clearCachedVehicleLogos();
    mocked.mockResolvedValueOnce({ packageRevision: 'r', logos: {} });
    expect(await fetchVehicleLogos()).toEqual({});
    expect(mocked).toHaveBeenCalledTimes(2);
  });
});
