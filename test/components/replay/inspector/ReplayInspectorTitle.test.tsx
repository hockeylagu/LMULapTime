import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReplayInspectorTitle } from '../../../../src/components/replay/inspector/ReplayInspectorTitle.js';
import type { ReplayMetadata, ReplayTrajectoryData, ReplayDriverEntry } from '../../../../shared/types/index.js';

vi.mock('../../../../src/components/vehicle/useVehicleLogos.js', () => ({
  useVehicleLogos: () => ({
    logos: { Porsche: '<svg data-testid="porsche-svg"></svg>' },
    getLogoSvg: (car?: string | null) => car?.toLowerCase().includes('porsche') ? { brand: 'Porsche', svg: '<svg></svg>' } : null,
  }),
}));

describe('ReplayInspectorTitle', () => {
  const baseMetadata: ReplayMetadata = {
    filename: 'RoadAtlanta_R1.Vcr',
    filePath: 'C:/UserData/Replays/RoadAtlanta_R1.Vcr',
    fileSizeBytes: 2048000,
    mtimeMs: 1700000000,
    timeSliceCount: 100,
    totalEvents: 10,
    durationSec: 125,
    displayTrack: 'Michelin Raceway Road Atlanta',
    weatherCondition: 'Dry',
    ambientTemp: 18.0,
    drivers: [],
  };

  it('renders track title and track conditions', () => {
    render(
      <ReplayInspectorTitle
        onClose={vi.fn()}
        replayName="RoadAtlanta_R1.Vcr"
        metadata={baseMetadata}
        trajectory={null}
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Michelin Raceway Road Atlanta');
    expect(screen.getByText(/Dry · 18\.0°C air/)).toBeInTheDocument();
  });

  it('renders car logo, car name, and car class badge under title and before dry conditions', () => {
    const selectedDriver: ReplayDriverEntry = {
      slot: 0,
      name: 'Player Driver',
      carModel: 'Porsche 911 GT3 R LMGT3',
      carClass: 'GT3',
      isPlayer: true,
    };

    render(
      <ReplayInspectorTitle
        onClose={vi.fn()}
        replayName="RoadAtlanta_R1.Vcr"
        metadata={baseMetadata}
        trajectory={null}
        selectedDriver={selectedDriver}
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Michelin Raceway Road Atlanta');

    // Car name should be rendered with bright white text styling
    const carNameEl = screen.getByText('Porsche 911 GT3 R LMGT3');
    expect(carNameEl).toBeInTheDocument();
    expect(carNameEl).toHaveClass('text-white');

    // Car logo and car class badge should be rendered
    expect(screen.getByTestId('car-logo')).toBeInTheDocument();
    expect(screen.getByTestId('car-class-badge')).toHaveTextContent('GT3');

    // Weather condition is also present
    expect(screen.getByText(/Dry · 18\.0°C air/)).toBeInTheDocument();
  });

  it('resolves car information from trajectory vehicleIdentity or metadata fallbacks', () => {
    const trajectory = {
      vehicleIdentity: {
        carModel: 'Ferrari 499P',
        carClass: 'HY',
      },
    } as unknown as ReplayTrajectoryData;

    render(
      <ReplayInspectorTitle
        onClose={vi.fn()}
        replayName="LeMans.Vcr"
        metadata={{ ...baseMetadata, displayTrack: 'Circuit de la Sarthe' }}
        trajectory={trajectory}
      />
    );

    expect(screen.getByText('Ferrari 499P')).toBeInTheDocument();
    expect(screen.getByTestId('car-class-badge')).toHaveTextContent('HY');
  });

  it('takes the class from the same car as the name in a multiclass replay', () => {
    const selectedDriver: ReplayDriverEntry = { slot: 3, name: 'GT3 Driver', vehicleId: 'PORSCHE_911_GT3_R', carModel: 'Porsche 911 GT3 R LMGT3' };
    const metadata: ReplayMetadata = {
      ...baseMetadata,
      drivers: [{ slot: 0, name: 'Leader', carModel: 'Ferrari 499P', carClass: 'Hypercar' }, selectedDriver],
    };

    render(<ReplayInspectorTitle onClose={vi.fn()} replayName="Multi.Vcr" metadata={metadata} trajectory={null} selectedDriver={selectedDriver} />);

    expect(screen.getByText('Porsche 911 GT3 R LMGT3')).toBeInTheDocument();
    expect(screen.getByTestId('car-class-badge')).toHaveTextContent('GT3');
  });

  it('renders info button on the same subline and opens replay disclosure', () => {
    render(
      <ReplayInspectorTitle
        onClose={vi.fn()}
        replayName="RoadAtlanta_R1.Vcr"
        metadata={baseMetadata}
        trajectory={null}
      />
    );

    const infoSummary = screen.getByText('Info');
    expect(infoSummary).toBeInTheDocument();
    expect(screen.getByText(/Replay information/)).toBeInTheDocument();
  });

  it('triggers onClose when back button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ReplayInspectorTitle
        onClose={onClose}
        replayName="RoadAtlanta_R1.Vcr"
        metadata={baseMetadata}
        trajectory={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
