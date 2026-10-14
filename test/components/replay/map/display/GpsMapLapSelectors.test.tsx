import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GpsMapLapSelectors } from '../../../../../src/components/replay/map/display/GpsMapLapSelectors.js';
import { ReplayFullscreenControlsContext } from '../../../../../src/components/replay/inspector/replayFullscreenControls.js';

const playback = { speed: 1, speeds: [0.5, 1, 2], onChangeSpeed: vi.fn() };

describe('fullscreen lap selector load states', () => {
  it('keeps times out of closed controls, restores focus on Escape, and opens the shared baseline picker', () => {
    const onOpenBaselinePicker = vi.fn();
    const primary = { laps: [{ lapNumber: 3, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
      lapNumber: 3, onSelect: vi.fn(), isLoading: false, onRetry: vi.fn() };
    render(<ReplayFullscreenControlsContext.Provider value={{ primary, baseline: primary, onOpenBaselinePicker, playback }}><GpsMapLapSelectors /></ReplayFullscreenControlsContext.Provider>);
    expect(screen.queryByText('1:30.000')).not.toBeInTheDocument();
    const trigger = screen.getByRole('combobox', { name: 'Change primary lap' });
    trigger.focus();
    fireEvent.click(trigger);
    const option = screen.getByRole('option', { name: /Lap 3/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(trigger).toHaveAttribute('aria-activedescendant', option.id);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Change baseline lap' }));
    expect(onOpenBaselinePicker).toHaveBeenCalledOnce();
  });

  it('disables the pending lap, preserves the other selector and provides a failed-load retry', () => {
    const retry = vi.fn();
    const primary = { laps: [{ lapNumber: 3, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
      lapNumber: 3, onSelect: vi.fn(), isLoading: false, onRetry: vi.fn() };
    const baseline = { ...primary, isLoading: true, onRetry: retry };
    const { rerender } = render(<ReplayFullscreenControlsContext.Provider value={{ primary, baseline, onOpenBaselinePicker: vi.fn(), playback }}><GpsMapLapSelectors /></ReplayFullscreenControlsContext.Provider>);
    expect(screen.getByRole('combobox', { name: 'Change primary lap' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Change baseline lap' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Loading baseline lap');
    rerender(<ReplayFullscreenControlsContext.Provider value={{ primary, playback, onOpenBaselinePicker: vi.fn(), baseline: { ...baseline, isLoading: false, error: 'Could not load comparison lap' } }}><GpsMapLapSelectors /></ReplayFullscreenControlsContext.Provider>);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load comparison lap');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('clears the comparison from fullscreen and keeps focus on the baseline selector', () => {
    const onRemoveBaseline = vi.fn();
    const primary = { laps: [], lapNumber: 3, onSelect: vi.fn(), isLoading: false, onRetry: vi.fn() };
    render(<ReplayFullscreenControlsContext.Provider value={{ primary: { ...primary, laps: [{ lapNumber: 3, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }] },
      baseline: primary, onRemoveBaseline, onOpenBaselinePicker: vi.fn(), playback }}><GpsMapLapSelectors /></ReplayFullscreenControlsContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Remove comparison lap' }));
    expect(onRemoveBaseline).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Change baseline lap' })).toHaveFocus();
  });
});
