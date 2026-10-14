import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReplayInspectorHeader, type ReplayInspectorHeaderProps } from '../../../../src/components/replay/inspector/ReplayInspectorHeader.js';
import { TELEMETRY_COLORS } from '../../../../src/utils/themeColors.js';
import { DEFAULT_COMPARE_CONTROLS } from '../../../../src/components/replay/inspector/compare/compareLapControls.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { openSelect, selectedValue } from '../../../helpers/selectControl.js';

vi.mock('../../../../src/components/replay/inspector/ReplayInspectorTitle.js', () => ({ ReplayInspectorTitle: () => null }));

const props: ReplayInspectorHeaderProps = {
  onClose: vi.fn(), sessionId: 'spa-session', metadata: null, trajectory: null,
  onSelectLap: vi.fn(), drivers: [{ slot: 14, name: 'Driver with a very long name '.repeat(5), carNumber: '14', isPlayer: true }],
  selectedDriverSlot: 14, onSelectDriver: vi.fn(), isCompareMode: true, onToggleCompare: vi.fn(),
  onRemoveCompare: vi.fn(), baselineSessionId: 'spa-session', baselineLapNumber: 3,
  baselineDriverName: 'Compared Driver', isComparePickerOpen: false, onCloseComparePicker: vi.fn(),
  availableCompareLaps: [], compareLapFilter: 'player', compareControls: DEFAULT_COMPARE_CONTROLS, compareCarTypes: [], onChangeCompareControls: vi.fn(), isCompareLapsLoading: false,
  onChangeCompareLapFilter: vi.fn(), onSelectCompareLap: vi.fn(), isBaselineLoading: false,
  isTrajLoading: false, isPlaying: false, onTogglePlay: vi.fn(),
  onRewind: vi.fn(), playbackSpeed: 1, onSelectPlaybackSpeed: vi.fn(), formatLapTime: sec => String(sec),
};

describe('ReplayInspectorHeader', () => {
  it('navigates the available lap numbers rather than assuming consecutive laps', () => {
    const onSelectLap = vi.fn();
    const trajectory: ReplayTrajectoryData = { replayName: 'test.Vcr', pointsCount: 0,
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
      currentLap: 4, points: [], laps: [
        { lapNumber: 1, lapTimeSec: 96, s1Sec: 30, s2Sec: 36, s3Sec: 30 },
        { lapNumber: 4, lapTimeSec: 101, s1Sec: 31, s2Sec: 39, s3Sec: 31, isValid: false },
        { lapNumber: 7, lapTimeSec: 99, s1Sec: 31, s2Sec: 37, s3Sec: 31 },
      ] };
    const { rerender } = render(<ReplayInspectorHeader {...props} trajectory={trajectory} onSelectLap={onSelectLap} />);
    fireEvent.click(screen.getByTitle('Previous Lap'));
    expect(onSelectLap).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByTitle('Next Lap'));
    expect(onSelectLap).toHaveBeenLastCalledWith(7);
    openSelect(screen.getByRole('combobox', { name: 'Select Lap' }));
    expect(screen.getByRole('option', { name: /^Lap 4 ?101$/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Select Lap' }), { key: 'Escape' });
    rerender(<ReplayInspectorHeader {...props} trajectory={{ ...trajectory, currentLap: 7 }} onSelectLap={onSelectLap} />);
    expect(screen.getByTitle('Next Lap')).toBeDisabled();
    rerender(<ReplayInspectorHeader {...props} trajectory={{ ...trajectory, currentLap: 1 }} onSelectLap={onSelectLap} />);
    expect(screen.getByTitle('Previous Lap')).toBeDisabled();
  });

  it('keeps long driver names available and matches the baseline trace color', () => {
    render(<ReplayInspectorHeader {...props} />);
    const select = screen.getByRole('combobox', { name: 'Select Driver' });
    expect(selectedValue(select)).toBe('14');
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
