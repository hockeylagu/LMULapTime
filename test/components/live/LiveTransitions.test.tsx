import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LivePage } from '../../../src/components/live/LivePage.js';
import { deriveLiveState } from '../../../shared/domain/live/liveLifecycle.js';
import type { LiveGameScreen, LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import { LiveSessionTracker } from '../../../shared/domain/live/liveSessionTracker.js';
import { LiveResultTracker } from '../../../shared/domain/live/liveResults.js';
import type { LiveLifecycle } from '../../../shared/types/live.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';
import { liveSnapshot } from '../../helpers/liveSnapshot.js';
import { FakeEventSource } from '../../helpers/fakeEventSource.js';

beforeEach(() => {
  FakeEventSource.install();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('renders the whole weekend without controls or stale results between stages', () => {
  render(<LivePage />);
  const timing = new LiveSessionTracker();
  const results = new LiveResultTracker();
  let previous: LiveLifecycle = 'offline';
  let sequence = 0;
  const send = (reading: LiveScoringReading | null, navigation: LiveGameScreen = 'session') => {
    const state = deriveLiveState(reading, previous, navigation);
    previous = state.lifecycle;
    const details = timing.apply(reading, state);
    const result = results.update(reading, state, details.recentLaps[details.recentLaps.length - 1] ?? null, details.sessionBest, null, null);
    act(() => FakeEventSource.byUrl('/api/live/stream').emit('snapshot', liveSnapshot({
      ...state, ...details, ...result, sequence: ++sequence, identity: null, strategy: null,
    })));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  };
  const frame = (sessionCode: number, overrides: Partial<LiveScoringReading> = {}) => scoringReading({
    sessionCode, currentEt: 0, endEt: 300, inRealtime: false, gamePhase: 0,
    player: vehicleReading({ totalLaps: 0 }), ...overrides,
  });
  const title = (text: string) => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(text);
  send(null, 'menu'); title('IN MENU');
  send(null, 'loading'); title('LOADING');
  send(frame(1)); title('PRACTICE');
  send(frame(1, { inRealtime: true, gamePhase: 5 }));
  expect(screen.getByTestId('pedal-trace')).toBeInTheDocument();
  send(frame(5)); title('QUALIFYING');
  expect(screen.queryByTestId('pedal-trace')).not.toBeInTheDocument();
  send(frame(5, { inRealtime: true, gamePhase: 5 }));
  expect(screen.getByTestId('pedal-trace')).toBeInTheDocument();
  const finished = frame(5, { currentEt: 301, gamePhase: 8, allDriversFinished: false,
    player: vehicleReading({ finishStatus: 1 }) });
  send(finished); title('QUALIFYING · WAITING');
  send({ ...finished, allDriversFinished: true }); title('QUALIFYING COMPLETE');
  expect(screen.queryByText('PROVISIONAL RESULT')).not.toBeInTheDocument();
  send(finished, 'loading'); title('LOADING');
  expect(screen.queryByTestId('live-session-review')).not.toBeInTheDocument();
  send(frame(10)); title('RACE');
  expect(screen.queryByTestId('live-session-review')).not.toBeInTheDocument();
  send(frame(10, { inRealtime: true, gamePhase: 3 })); title('RACE STARTING');
  expect(screen.getByText('FORMATION LAP')).toBeInTheDocument();
  send(frame(10, { inRealtime: true, gamePhase: 4 }));
  expect(screen.getByText('COUNTDOWN')).toBeInTheDocument();
  send(frame(10, { inRealtime: true, gamePhase: 5 }));
  expect(screen.getByTestId('live-race-position')).toBeInTheDocument();
  send(frame(10, { inRealtime: true, gamePhase: 8, player: vehicleReading({ finishStatus: 0 }) }));
  expect(screen.queryByTestId('live-session-review')).not.toBeInTheDocument();
  send(frame(10, { inRealtime: true, gamePhase: 8, player: vehicleReading({ finishStatus: 1 }) })); title('RACE COMPLETE');
  expect(screen.queryByTestId('pedal-trace')).not.toBeInTheDocument();
  send(null, 'menu'); title('IN MENU');
  send(frame(10)); title('RACE');
  expect(screen.queryByTestId('live-session-review')).not.toBeInTheDocument();
});
