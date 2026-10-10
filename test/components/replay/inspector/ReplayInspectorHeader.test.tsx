import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReplayInspectorHeader, type ReplayInspectorHeaderProps } from '../../../../src/components/replay/inspector/ReplayInspectorHeader.js';
import { TELEMETRY_COLORS } from '../../../../src/utils/themeColors.js';

vi.mock('../../../../src/components/replay/inspector/ReplayInspectorTitle.js', () => ({ ReplayInspectorTitle: () => null }));

const props: ReplayInspectorHeaderProps = {
  onClose: vi.fn(), sessionId: 'spa-session', metadata: null, trajectory: null,
  onSelectLap: vi.fn(), drivers: [{ slot: 14, name: 'Driver with a very long name '.repeat(5), carNumber: '14', isPlayer: true }],
  selectedDriverSlot: 14, onSelectDriver: vi.fn(), isCompareMode: true, onToggleCompare: vi.fn(),
  onRemoveCompare: vi.fn(), baselineSessionId: 'spa-session', baselineLapNumber: 3,
  baselineDriverName: 'Compared Driver', isComparePickerOpen: false, onCloseComparePicker: vi.fn(),
  availableCompareLaps: [], compareLapFilter: 'player', isCompareLapsLoading: false,
  onChangeCompareLapFilter: vi.fn(), onSelectCompareLap: vi.fn(), isBaselineLoading: false,
  isTrajLoading: false, isPlaying: false, onTogglePlay: vi.fn(),
  onRewind: vi.fn(), playbackSpeed: 1, onSelectPlaybackSpeed: vi.fn(), formatLapTime: sec => String(sec),
};

describe('ReplayInspectorHeader', () => {
  it('keeps long driver names available and matches the baseline trace color', () => {
    render(<ReplayInspectorHeader {...props} />);
    const select = screen.getByRole('combobox', { name: 'Select Driver' });
    expect(select).toHaveValue('14');
    expect(select).toHaveAttribute('title', `#14 ${props.drivers[0].name} (You)`);
    expect(screen.getByRole('button', { name: /vs\s*Compared Driver L3/ })).toHaveStyle({ color: TELEMETRY_COLORS.baseline });
  });

  it('shows baseline loading without a lap time and prevents swapping or playback', () => {
    render(<ReplayInspectorHeader {...props} isTrajLoading isBaselineLoading />);
    expect(screen.getByRole('combobox', { name: 'Select Driver' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Swap comparison laps' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /vs\s*Compared Driver L3\s*Loading/ })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('allows retrying a baseline failure while keeping its driver visible', () => {
    const onRetryBaseline = vi.fn();
    render(<ReplayInspectorHeader {...props} baselineError="Telemetry file unavailable" onRetryBaseline={onRetryBaseline} />);
    expect(screen.getByRole('button', { name: /vs\s*Compared Driver L3.*unavailable/ })).toHaveAttribute('title', expect.stringContaining('Telemetry file unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry comparison lap' }));
    expect(onRetryBaseline).toHaveBeenCalledOnce();
  });

  it('shows candidate errors with recovery instead of an empty result', () => {
    const onRetryCompareLaps = vi.fn();
    render(<ReplayInspectorHeader {...props} isComparePickerOpen compareLapsError="Comparison cache unavailable" onRetryCompareLaps={onRetryCompareLaps} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Comparison cache unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryCompareLaps).toHaveBeenCalledOnce();
    expect(screen.queryByText(/No player replay-backed laps/)).not.toBeInTheDocument();
  });
});
