import { createContext } from 'react';
import type { ReplayLapSummary } from '../../../../shared/types/index.js';

export interface ReplayFullscreenControls {
  primary: ReplayLapChoice;
  baseline?: Omit<ReplayLapChoice, 'laps' | 'onSelect'>;
  onOpenBaselinePicker: () => void;
  onRemoveBaseline?: () => void;
  playback: { speed: number; speeds: readonly number[]; onChangeSpeed: (speed: number) => void; isPlaying?: boolean; onTogglePlay?: () => void };
}

/**
 * A moment of a lap on the replay clock, with the lap's start on it: a lap whose samples run on the lap clock
 * (`timeReference` 'lap') lands at `replaySec - lapStartSec`, one on the replay clock at `replaySec`.
 */
export interface LapLanding {
  replaySec: number;
  lapStartSec: number;
}

export interface ReplayLapChoice {
  laps: ReplayLapSummary[];
  lapNumber: number | null;
  /** `landAt`: where the cursor lands on the new lap (else its start). */
  onSelect: (lapNumber: number, landAt?: LapLanding) => void;
  isLoading: boolean;
  error?: string | null;
  onRetry: () => void;
}

/** Inspector playback rates, shared by the telemetry toolbar and the fullscreen playback strip. */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2] as const;

/** `,` / `<` slows playback one step, `.` / `>` speeds it up; null for any other key or past either end. */
export function steppedPlaybackSpeed(key: string, speed: number): number | null {
  const direction = key === ',' || key === '<' ? -1 : key === '.' || key === '>' ? 1 : 0;
  if (!direction) return null;
  const at = PLAYBACK_SPEEDS.findIndex(option => option === speed);
  return PLAYBACK_SPEEDS[(at < 0 ? PLAYBACK_SPEEDS.indexOf(1) : at) + direction] ?? null;
}

/** The lap view's controls outside the header (telemetry toolbar, fullscreen map): session locators, load state and playback. */
export const ReplayFullscreenControlsContext = createContext<ReplayFullscreenControls | null>(null);
