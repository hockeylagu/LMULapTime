import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SectorsMetricBox } from '../../../src/components/session-detail/overview/SectorsMetricBox.js';
import type { DriverData } from '../../../shared/types/index.js';

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
const averages = { s1: 25.3, s2: 42.3, s3: 28.8, lap: 96.3 };

describe('SectorsMetricBox', () => {
  it('puts each best and average sector next to the fastest same car and highlights the biggest gap', () => {
    render(<SectorsMetricBox selectedDriver={me} drivers={[me, malynych]} averages={averages} />);

    const box = screen.getByTestId('sectors-metric');
    expect(within(box).getByText('Same car')).toHaveAttribute('title', 'Fastest other Peugeot 9x8');
    expect(within(box).getByText('+0.393')).toBeInTheDocument();
    expect(within(box).getByText('-0.332')).toBeInTheDocument();
    expect(within(box).getByText('0:28.255')).toHaveAttribute('title', 'Alexandr Malynych');
    expect(within(box).getByText('+0.393').parentElement).toHaveClass('bg-amber-500/10');
    expect(box).not.toHaveTextContent('Biggest gap');
  });

  it('keeps the best and average sectors without a rival in the class', () => {
    render(<SectorsMetricBox selectedDriver={me} drivers={[me]} averages={averages} />);

    const box = screen.getByTestId('sectors-metric');
    expect(within(box).getByText('0:28.648')).toBeInTheDocument();
    expect(within(box).getByText('0:28.800')).toBeInTheDocument();
    expect(within(box).queryByText('Gap')).not.toBeInTheDocument();
    expect(within(box).queryByText('Lap')).not.toBeInTheDocument();
  });
});
