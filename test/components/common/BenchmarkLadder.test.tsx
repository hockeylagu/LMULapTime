import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BenchmarkLadder } from '../../../src/components/common/BenchmarkLadder.js';
import { ReferenceLaptimeEntry } from '../../../shared/types/index.js';

const benchmark: ReferenceLaptimeEntry = {
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
    offlineSec: 128.4,
  },
};

describe('BenchmarkLadder', () => {
  it('lists every band from alien to offline with its time', () => {
    render(<BenchmarkLadder benchmark={benchmark} />);
    const rungs = screen.getAllByRole('listitem');
    expect(rungs.map((r) => r.textContent)).toEqual([
      'Alien2:00.000100%',
      'Competitive2:01.200101%',
      'Good2:02.400102%',
      'Midpack2:04.800104%',
      'Tail-ender2:07.200106%',
      'Offline2:08.400107%+',
    ]);
  });

  it('marks the band of the current lap', () => {
    render(<BenchmarkLadder benchmark={benchmark} current="Good" />);
    const current = screen.getAllByRole('listitem').filter((r) => r.getAttribute('aria-current'));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Good');
  });

  it('renders nothing without a benchmark', () => {
    expect(render(<BenchmarkLadder benchmark={null} />).container).toBeEmptyDOMElement();
    expect(render(<BenchmarkLadder benchmark={undefined} />).container).toBeEmptyDOMElement();
  });
});
