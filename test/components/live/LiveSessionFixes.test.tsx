import { act, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveTimingStore } from '../../../src/api/liveStream.js';
import { LivePracticeHistory } from '../../../src/components/live/LivePracticeHistory.js';
import { LiveEstimatedLap } from '../../../src/components/live/LiveEstimatedLap.js';
import { liveTiming } from '../../helpers/liveSnapshot.js';

afterEach(() => { vi.useRealTimers(); });

it('ticks smoothly without snapping backward on delayed updates, and bounds run-on before lap rollover', () => {
  vi.useFakeTimers();
  const store = new LiveTimingStore();
  render(<LivePracticeHistory laps={[]} best={null} store={store} />);
  const clock = () => within(screen.getByTestId('live-history-current')).getAllByRole('cell')[0];
  act(() => store.set(liveTiming({ lapNumber: 1, lapElapsedSeconds: 10.09 })));
  expect(clock()).toHaveTextContent('0:10.0');
  act(() => vi.advanceTimersByTime(220));
  expect(clock()).toHaveTextContent('0:10.2');
  act(() => store.set(liveTiming({ lapNumber: 1, lapElapsedSeconds: 10.15 })));
  expect(clock()).toHaveTextContent('0:10.3');
  act(() => vi.advanceTimersByTime(10_000));
  expect(clock()).toHaveTextContent('0:10.4');
  act(() => store.set(liveTiming({ lapNumber: 2, lapElapsedSeconds: 0.05 })));
  expect(clock()).toHaveTextContent('0:00.0');
  act(() => store.set(null));
  expect(clock()).toHaveTextContent('—');
});

it('uses a split projection without a redundant approximation mark until a matching lap delta exists', () => {
  const store = new LiveTimingStore();
  render(<LiveEstimatedLap store={store} bestSeconds={121.406} />);
  const estimate = screen.getByTestId('live-estimated-lap');
  act(() => store.set(liveTiming({ deltaSeconds: null, sectorEstimatedLapSeconds: 133.0757 })));
  expect(estimate).toHaveTextContent('2:13.076');
  expect(estimate).not.toHaveTextContent('~');
  expect(estimate).toHaveAttribute('data-estimate-source', 'sector');
  act(() => store.set(liveTiming({ deltaSeconds: -0.184, sectorEstimatedLapSeconds: 133.0757 })));
  expect(estimate).toHaveTextContent('2:01.222');
  expect(estimate).toHaveAttribute('data-estimate-source', 'session-trace');
  act(() => store.set(liveTiming({ isOutLap: true, sectorEstimatedLapSeconds: 133.0757 })));
  expect(estimate).toHaveTextContent('OUT LAP');
  act(() => store.set(liveTiming({ deltaSeconds: null, sectorEstimatedLapSeconds: -1 })));
  expect(estimate).toHaveTextContent('—');
});

it('retains a computed invalid lap in gray with its provenance and without promoting a best', () => {
  render(<LivePracticeHistory store={new LiveTimingStore()} best={null} laps={[{
    lapNumber: 4, lapSeconds: 133.076, sectors: [37, 50, 46.076], valid: false, timeSource: 'lap-start',
  }]} />);
  expect(screen.getByTestId('live-history-latest')).toHaveClass('text-lmu-muted');
  expect(screen.getByTitle('Computed lap time')).toHaveTextContent('2:13.076');
  expect(screen.getByText('INVALID · COMPUTED TIME')).toBeInTheDocument();
  expect(screen.getByTestId('live-history-best')).toHaveTextContent('BEST————');
});
