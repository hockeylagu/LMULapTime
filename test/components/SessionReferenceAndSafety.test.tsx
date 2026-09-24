import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionReferenceAndSafety } from '../../src/components/session-detail/standings/SessionReferenceAndSafety';
import { ReferenceLaptimeEntry } from '../../server/core/types';

describe('SessionReferenceAndSafety', () => {
  it('renders null when refEntry is null', () => {
    const { container } = render(
      <SessionReferenceAndSafety refEntry={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders all reference targets when refEntry is provided', () => {
    const mockRef: ReferenceLaptimeEntry = {
      key: 'Spa-Francorchamps_Hypercar',
      trackName: 'Spa-Francorchamps',
      carClass: 'Hypercar',
      patch: '1.4+',
      target100Sec: 120.0,
      targets: {
        alienSec: 120.0,
        competitiveSec: 121.2,
        goodSec: 122.5,
        goodMidpackSec: 123.2,
        midpackSec: 124.0,
        midpackTailSec: 125.0,
        tailEnderSec: 126.0,
        offlineSec: 128.0,
      },
    };

    render(<SessionReferenceAndSafety refEntry={mockRef} />);

    expect(screen.getByText('👾 Alien:')).toBeInTheDocument();
    expect(screen.getByText('2:00.000')).toBeInTheDocument();
    expect(screen.getByText('🏆 Competitive:')).toBeInTheDocument();
    expect(screen.getByText('2:01.200')).toBeInTheDocument();
    expect(screen.getByText('⭐ Good:')).toBeInTheDocument();
    expect(screen.getByText('2:02.500')).toBeInTheDocument();
    expect(screen.getByText('🏎️ Midpack:')).toBeInTheDocument();
    expect(screen.getByText('2:04.000')).toBeInTheDocument();
    expect(screen.getByText('🐢 Tail-ender:')).toBeInTheDocument();
    expect(screen.getByText('2:06.000')).toBeInTheDocument();
  });
});
