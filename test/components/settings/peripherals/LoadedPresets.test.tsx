import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadedPresets } from '../../../../src/components/settings/peripherals/LoadedPresets.js';
import { fetchLoadedPresets } from '../../../../src/api/peripheralsApi.js';

vi.mock('../../../../src/api/peripheralsApi.js', () => ({ fetchLoadedPresets: vi.fn() }));
afterEach(cleanup);

describe('loaded presets in settings', () => {
  it('shows actual device profiles without any live-session placeholders and refreshes external changes', async () => {
    const device = { role: 'base' as const, name: 'Alpha', productUuid: '1', deviceUuid: '2', firmware: null };
    vi.mocked(fetchLoadedPresets).mockResolvedValue({ observedAt: 0, devices: [
      { device, preset: { presetUuid: 'base', name: 'Everyday base profile' }, error: null },
      { device: { ...device, role: 'wheel', name: 'GT NEO', deviceUuid: '3' }, preset: { presetUuid: 'wheel', name: 'GT3 wheel profile' }, error: null },
    ] });
    render(<LoadedPresets busy={false} />);
    expect(await screen.findByText('Everyday base profile')).toBeVisible();
    expect(screen.getByText('GT3 wheel profile')).toBeVisible();
    expect(screen.queryByText(/No live session|Waiting for car/)).not.toBeInTheDocument();
    vi.mocked(fetchLoadedPresets).mockResolvedValue({ observedAt: 1, devices: [{ device, preset: { presetUuid: 'new', name: 'Changed in SimPro' }, error: null }] });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh loaded presets' }));
    expect(await screen.findByText('Changed in SimPro')).toBeVisible();
    expect(screen.queryByText('Everyday base profile')).not.toBeInTheDocument();
  });
  it('clears old profiles after a failed refresh instead of presenting them as current', async () => {
    vi.mocked(fetchLoadedPresets).mockResolvedValue({ observedAt: 0, devices: [] });
    render(<LoadedPresets busy={false} />);
    expect(await screen.findByText('No connected wheelbase or wheel found in SimPro Manager.')).toBeVisible();
    vi.mocked(fetchLoadedPresets).mockRejectedValue(new Error('SimPro unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh loaded presets' }));
    expect(await screen.findByText('SimPro unavailable')).toBeVisible();
    expect(screen.queryByText('No connected wheelbase or wheel found in SimPro Manager.')).not.toBeInTheDocument();
  });
});
