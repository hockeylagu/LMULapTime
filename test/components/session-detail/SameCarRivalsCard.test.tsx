import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SameCarRivalsCard } from '../../../src/components/session-detail/overview/SameCarRivalsCard.js';
import type { DetailedSession, DriverData } from '../../../shared/types/index.js';

function driver(name: string, carType: string, s1: number, s2: number, s3: number, lap: number): DriverData {
  return {
    name,
    carType,
    carClass: 'Hyper',
    bestLapTime: lap,
    bestS1: s1,
    bestS2: s2,
    bestS3: s3,
    laps: [],
  } as unknown as DriverData;
}

const me = driver('Samuel Lague', 'Peugeot 9x8', 25.184, 42.062, 28.648, 95.894);
const malynych = driver('Alexandr Malynych', 'Peugeot 9x8', 25.098, 42.394, 28.255, 95.746);

describe('SameCarRivalsCard', () => {
  it('shows each sector against the fastest same car and calls out the biggest gap', () => {
    const session = { drivers: [me, malynych] } as unknown as DetailedSession;

    render(<SameCarRivalsCard session={session} selectedDriver={me} />);

    expect(screen.getByText('Best Sectors vs Same Car')).toBeInTheDocument();
    expect(screen.getByText('Fastest other Peugeot 9x8')).toBeInTheDocument();
    expect(screen.getByText('S3 +0.393s')).toBeInTheDocument();
    expect(screen.getByText('-0.332s')).toBeInTheDocument();
  });

  it('renders nothing without a rival in the class', () => {
    const session = { drivers: [me] } as unknown as DetailedSession;

    const { container } = render(<SameCarRivalsCard session={session} selectedDriver={me} />);

    expect(container).toBeEmptyDOMElement();
  });
});
