import { act, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveTimingStore } from '../../../src/api/liveStream.js';
import { LivePracticeHistory } from '../../../src/components/live/LivePracticeHistory.js';
import { LiveEstimatedLap } from '../../../src/components/live/LiveEstimatedLap.js';
import { liveTiming } from '../../helpers/liveSnapshot.js';

afterEach(() => { vi.useRealTimers(); });

it('holds the authoritative lap clock between updates, including delayed updates and lap rollover', () => {
  vi.useFakeTimers();
  const store = new LiveTimingStore();
  render(<LivePracticeHistory laps={[]} best={null} store={store} />);
  const clock = () => within(screen.getByTestId('live-history-current')).getAllByRole('cell')[0];
  act(() => store.set(liveTiming({ lapNumber: 1, lapElapsedSeconds: 10.09 })));
  expect(clock()).toHaveTextContent('0:10.0');
  act(() => vi.advanceTimersByTime(220));
  expect(clock()).toHaveTextContent('0:10.0');
  act(() => store.set(liveTiming({ lapNumber: 1, lapElapsedSeconds: 10.15 })));
  expect(clock()).toHaveTextContent('0:10.1');
  act(() => vi.advanceTimersByTime(10_000));
  expect(clock()).toHaveTextContent('0:10.1');
  act(() => store.set(liveTiming({ lapNumber: 2, lapElapsedSeconds: 0.05 })));
  expect(clock()).toHaveTextContent('0:00.0');
  act(() => store.set(null));
  expect(clock()).toHaveTextContent('—');
});

it('uses a marked game projection until a matched session-best delta exists, and keeps out laps explicit', () => {
  const store = new LiveTimingStore();
  render(<LiveEstimatedLap store={store} bestSeconds={121.406} />);
  const estimate = screen.getByTestId('live-estimated-lap');
  act(() => store.set(liveTiming({ deltaSeconds: null, gameEstimatedLapSeconds: 133.0757 })));
  expect(estimate).toHaveTextContent('~2:13.076');
  expect(estimate).toHaveAttribute('data-estimate-source', 'game');
  act(() => store.set(liveTiming({ deltaSeconds: -0.184, gameEstimatedLapSeconds: 133.0757 })));
  expect(estimate).toHaveTextContent('2:01.222');
  expect(estimate).toHaveAttribute('data-estimate-source', 'session-trace');
  act(() => store.set(liveTiming({ isOutLap: true, gameEstimatedLapSeconds: 133.0757 })));
  expect(estimate).toHaveTextContent('OUT LAP');
  act(() => store.set(liveTiming({ deltaSeconds: null, gameEstimatedLapSeconds: -1 })));
  expect(estimate).toHaveTextContent('—');
});
