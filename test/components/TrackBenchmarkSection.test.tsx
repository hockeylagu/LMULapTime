import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackBenchmarkSection } from '../../src/components/track-detail/TrackBenchmarkSection.js';
import { BenchmarkTargetsGrid } from '../../src/components/common/BenchmarkTargetsGrid.js';
import { ReferenceLaptimeEntry } from '../../server/core/types.js';

describe('TrackBenchmarkSection & BenchmarkTargetsGrid components', () => {
  const mockBenchmark: ReferenceLaptimeEntry = {
    key: 'Spa-Francorchamps_LMH',
    trackName: 'Spa-Francorchamps',
    carClass: 'LMH',
    patch: '1.4+',
    target100Sec: 120.0,
    targets: {
      alienSec: 120.0,
      competitiveSec: 121.2,
      goodSec: 122.4,
      goodMidpackSec: 123.6,
      midpackSec: 124.8,
      midpackTailSec: 126.0,
      tailEnderSec: 127.2,
      offlineSec: 130.0,
    },
  };

  it('renders fallback notice when currentBenchmark is null', () => {
    render(<TrackBenchmarkSection currentBenchmark={null} />);
    expect(screen.getByText(/No reference benchmarks found for this track/i)).toBeInTheDocument();
  });

  it('renders benchmark cards in grid format when currentBenchmark is provided', () => {
    render(<TrackBenchmarkSection currentBenchmark={mockBenchmark} />);

    expect(screen.getByText(/Appropriate Reference Lap Times/i)).toBeInTheDocument();
    expect(screen.getByText(/Alien \(~100%\)/i)).toBeInTheDocument();
    expect(screen.getByText('2:00.000')).toBeInTheDocument(); // alienSec 120s
    expect(screen.getByText(/Competitive \(101%\)/i)).toBeInTheDocument();
    expect(screen.getByText('2:01.200')).toBeInTheDocument(); // competitiveSec 121.2s
    expect(screen.getByText(/Good \(102%\)/i)).toBeInTheDocument();
    expect(screen.getByText('2:02.400')).toBeInTheDocument(); // goodSec 122.4s
    expect(screen.getByText(/Midpack \(104%\)/i)).toBeInTheDocument();
    expect(screen.getByText('2:04.800')).toBeInTheDocument(); // midpackSec 124.8s
    expect(screen.getByText(/Tail-ender \(106%\)/i)).toBeInTheDocument();
    expect(screen.getByText('2:07.200')).toBeInTheDocument(); // tailEnderSec 127.2s
    expect(screen.getByText(/Offline \(>107%\)/i)).toBeInTheDocument();
  });

  it('renders benchmark pills when variant is pills', () => {
    render(<BenchmarkTargetsGrid benchmark={mockBenchmark} variant="pills" />);

    expect(screen.getByText(/Alien:/i)).toBeInTheDocument();
    expect(screen.getByText('2:00.000')).toBeInTheDocument();
    expect(screen.getByText(/Competitive:/i)).toBeInTheDocument();
    expect(screen.getByText('2:01.200')).toBeInTheDocument();
    expect(screen.getByText(/Good:/i)).toBeInTheDocument();
    expect(screen.getByText('2:02.400')).toBeInTheDocument();
    expect(screen.getByText(/Midpack:/i)).toBeInTheDocument();
    expect(screen.getByText('2:04.800')).toBeInTheDocument();
    expect(screen.getByText(/Tail-ender:/i)).toBeInTheDocument();
    expect(screen.getByText('2:07.200')).toBeInTheDocument();
  });

  it('BenchmarkTargetsGrid returns null when benchmark is null or undefined', () => {
    const { container: c1 } = render(<BenchmarkTargetsGrid benchmark={null} />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(<BenchmarkTargetsGrid benchmark={undefined} />);
    expect(c2).toBeEmptyDOMElement();
  });
});
