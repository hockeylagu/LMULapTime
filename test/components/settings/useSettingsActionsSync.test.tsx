import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettingsActions } from '../../../src/components/settings/useSettingsActions.js';
import type { AppStatus } from '../../../shared/types/index.js';

const status: AppStatus = {
  resultsDir: 'C:\LMU\Results',
  resultsExist: true,
  replaysDir: 'C:\LMU\Replays',
  replaysExist: true,
  telemetryDir: 'C:\LMU\Telemetry',
  telemetryExist: true,
  playerName: 'Player1',
  sessionsCount: 1,
  tracksCount: 1,
};

function setup(initial: AppStatus | null) {
  return renderHook(({ s }) => useSettingsActions({ status: s, onUpdatePaths: vi.fn() }), { initialProps: { s: initial } });
}

describe('useSettingsActions input sync', () => {
  it('fills the inputs when the first status arrives after mount', () => {
    const { result, rerender } = setup(null);
    expect(result.current.resultsDirInput).toBe('');
    rerender({ s: status });
    expect(result.current.resultsDirInput).toBe('C:\LMU\Results');
    expect(result.current.playerNameInput).toBe('Player1');
  });

  it('keeps a cleared field empty when status refreshes with the same saved values', () => {
    const { result, rerender } = setup(status);
    act(() => {
      result.current.setResultsDirInput('');
      result.current.setPlayerNameInput('');
    });
    rerender({ s: { ...status, sessionsCount: 2 } });
    expect(result.current.resultsDirInput).toBe('');
    expect(result.current.playerNameInput).toBe('');
  });

  it('updates an unedited field when its saved value changes, but not an edited one', () => {
    const { result, rerender } = setup(status);
    act(() => result.current.setReplaysDirInput('D:\Typing'));
    rerender({ s: { ...status, resultsDir: 'E:\New', replaysDir: 'E:\NewReplays' } });
    expect(result.current.resultsDirInput).toBe('E:\New');
    expect(result.current.replaysDirInput).toBe('D:\Typing');
  });
});
