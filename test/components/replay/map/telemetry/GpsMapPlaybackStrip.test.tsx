import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GpsMapPlaybackStrip } from '../../../../../src/components/replay/map/telemetry/GpsMapPlaybackStrip.js';
import { ReplayFullscreenControlsContext, type ReplayFullscreenControls } from '../../../../../src/components/replay/inspector/replayFullscreenControls.js';

const controls = (onChangeSpeed = vi.fn()): ReplayFullscreenControls => ({
  primary: { laps: [], lapNumber: 1, onSelect: vi.fn(), isLoading: false, onRetry: vi.fn() },
  onOpenBaselinePicker: vi.fn(),
  playback: { speed: 1, speeds: [0.5, 1, 2], onChangeSpeed },
});

describe('fullscreen playback strip', () => {
  it('plays, changes the shared speed and shows the cursor lap time and distance', () => {
    const onTogglePlay = vi.fn();
    const onChangeSpeed = vi.fn();
    const { rerender } = render(<ReplayFullscreenControlsContext.Provider value={controls(onChangeSpeed)}>
      <GpsMapPlaybackStrip onTogglePlay={onTogglePlay} elapsedSec={42.3154} distanceM={1234.4} />
    </ReplayFullscreenControlsContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), { target: { value: '2' } });
    expect(onChangeSpeed).toHaveBeenCalledWith(2);
    expect(screen.getByText('0:42.315')).toBeInTheDocument();
    expect(screen.getByText('1,234 m')).toBeInTheDocument();
    rerender(<ReplayFullscreenControlsContext.Provider value={controls()}>
      <GpsMapPlaybackStrip isPlaying onTogglePlay={onTogglePlay} elapsedSec={0} distanceM={-2} />
    </ReplayFullscreenControlsContext.Provider>);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByText('0:00.000')).toBeInTheDocument();
    expect(screen.getByText('0 m')).toBeInTheDocument();
  });

  it('omits the speed control outside the inspector', () => {
    render(<GpsMapPlaybackStrip elapsedSec={1} distanceM={10} />);
    expect(screen.queryByRole('combobox', { name: 'Playback speed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
  });
});
