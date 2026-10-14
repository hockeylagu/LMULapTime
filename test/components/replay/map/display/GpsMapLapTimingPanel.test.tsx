import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GpsMapLapTimingPanel } from '../../../../../src/components/replay/map/display/GpsMapLapTimingPanel.js';
import type { ReplayLapSummary } from '../../../../../shared/types/index.js';

const lap: ReplayLapSummary = { lapNumber: 8, lapTimeSec: 90, s1Sec: 30, s2Sec: 31, s3Sec: 29 };

describe('fullscreen lap timing panel', () => {
  beforeEach(() => localStorage.clear());

  it('uses recorded individual sectors and compares them with the chosen baseline', () => {
    render(<GpsMapLapTimingPanel primaryLapSummary={lap}
      baselineLapSummary={{ ...lap, lapNumber: 4, lapTimeSec: 89, s1Sec: 29, s2Sec: 32, s3Sec: 28 }} />);
    const panel = within(screen.getByRole('complementary', { name: 'Lap and sector timing' }));
    expect(panel.getByText('1:30.000')).toBeInTheDocument();
    expect(panel.getByText('1:29.000')).toBeInTheDocument();
    expect(panel.getByText('31.000s')).toBeInTheDocument();
    expect(panel.getByText('-1.000s')).toHaveClass('text-right', 'text-lmu-gain');
    expect(panel.getByText('-1.000s').parentElement).toHaveClass('grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_68px]');
    expect(panel.getAllByText('+1.000s')).toHaveLength(3);
    expect(panel.getByText('Baseline · L4')).toBeInTheDocument();
  });

  it('does not treat missing or invalid timing as zero', () => {
    const { rerender } = render(<GpsMapLapTimingPanel />);
    expect(screen.getByText('Lap timing unavailable.')).toBeInTheDocument();
    rerender(<GpsMapLapTimingPanel primaryLapSummary={{ ...lap, s1Sec: NaN, s2Sec: 0, s3Sec: Infinity }} />);
    expect(screen.getAllByText('--')).toHaveLength(3);
    expect(screen.queryByText('0.000s')).not.toBeInTheDocument();
  });

  it('highlights the cursor sector and shows its live change only against a baseline', () => {
    const { container, rerender } = render(<GpsMapLapTimingPanel primaryLapSummary={lap} liveSplit={{ sector: 2, deltaSec: -0.123 }} />);
    expect(container.querySelector('[data-current-sector]')).toHaveTextContent('S2');
    // Without a baseline the rows keep the selectors' primary/compare columns.
    expect(container.querySelector('[data-current-sector]')).toHaveClass('grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)]');
    expect(screen.queryByText('S2 so far')).not.toBeInTheDocument();
    rerender(<GpsMapLapTimingPanel primaryLapSummary={lap} baselineLapSummary={{ ...lap, lapNumber: 4 }} liveSplit={{ sector: 2, deltaSec: -0.123 }} />);
    expect(screen.getByText('S2 so far')).toBeInTheDocument();
    expect(screen.getByText('-0.123s')).toHaveClass('text-lmu-gain');
    rerender(<GpsMapLapTimingPanel primaryLapSummary={lap} baselineLapSummary={{ ...lap, lapNumber: 4 }} liveSplit={{ sector: 3, deltaSec: null }} />);
    expect(container.querySelector('[data-current-sector]')).toHaveTextContent('S3');
    expect(screen.getByText('S3 so far').nextSibling).toHaveTextContent('--');
  });

  it('remembers collapsing the panel', () => {
    const first = render(<GpsMapLapTimingPanel primaryLapSummary={lap} />);
    fireEvent.click(screen.getByRole('button', { name: 'Timing' }));
    first.unmount();
    render(<GpsMapLapTimingPanel primaryLapSummary={lap} />);
    const toggle = screen.getByRole('button', { name: 'Timing' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).not.toBeVisible();
    expect(screen.getByText('1:30.000')).not.toBeVisible();
  });
});
