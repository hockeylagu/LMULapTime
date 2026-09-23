import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CircuitInfoModal } from '../../src/components/track-detail/CircuitInfoModal.js';

describe('CircuitInfoModal', () => {
  const mockGeometry = {
    layoutKey: 'spa_gp',
    circuitId: 'spa',
    layoutId: 'gp',
    trackVenue: 'Circuit de Spa-Francorchamps',
    trackCourse: 'Circuit de Spa-Francorchamps',
    lengthM: 7004,
    bounds: { minX: 0, maxX: 1000, minZ: 0, maxZ: 1000, spanX: 1000, spanZ: 1000 },
    leftBoundary: [[0, 0] as [number, number]],
    rightBoundary: [[10, 0] as [number, number]],
    centerline: [[5, 0] as [number, number]],
    timingGates: {
      startFinish: { name: 'S/F', center: [0, 0] as [number, number], left: [0, 5] as [number, number], right: [0, -5] as [number, number], stationM: 0 },
      sector1: { name: 'S1', center: [2300, 0] as [number, number], left: [2300, 5] as [number, number], right: [2300, -5] as [number, number], stationM: 2300 },
      sector2: { name: 'S2', center: [4800, 0] as [number, number], left: [4800, 5] as [number, number], right: [4800, -5] as [number, number], stationM: 4800 },
    },
  };

  it('renders circuit information including length, turn count, and parsed source without sessions, target, or start/finish 0 gate', () => {
    const onClose = vi.fn();
    render(
      <CircuitInfoModal
        isOpen={true}
        onClose={onClose}
        trackName="Circuit de Spa-Francorchamps"
        trackCourse="Circuit de Spa-Francorchamps"
        trackGeometry={mockGeometry}
        xmlTrackLengthMeters={7004}
      />
    );

    // Official Circuit & Country
    expect(screen.getByText('Circuit de Spa-Francorchamps')).toBeInTheDocument();
    expect(screen.getByText(/Belgium/i)).toBeInTheDocument();

    // Turn count & Direction
    expect(screen.getByText('20 Turns')).toBeInTheDocument();
    expect(screen.getByText('Clockwise')).toBeInTheDocument();

    // Length
    expect(screen.getByText('7.004 km')).toBeInTheDocument();
    expect(screen.getByText(/7,004 m/i)).toBeInTheDocument();

    // Elevation Delta (Spa: 102m / 335 ft Delta)
    expect(screen.getByText('Elevation')).toBeInTheDocument();
    expect(screen.getByText('102 m')).toBeInTheDocument();
    expect(screen.getByText(/335 ft Delta/i)).toBeInTheDocument();

    // Sessions and Target should NOT be in the modal
    expect(screen.queryByText('Sessions')).not.toBeInTheDocument();
    expect(screen.queryByText('Alien Target')).not.toBeInTheDocument();

    // Parsed from & Source
    expect(screen.getByText(/LMU Results XML/i)).toBeInTheDocument();
    expect(screen.getByText(/Technical University of Munich/i)).toBeInTheDocument();

    // Famous corners
    expect(screen.getByText(/Eau Rouge & Raidillon/i)).toBeInTheDocument();
    expect(screen.getByText(/Pouhon/i)).toBeInTheDocument();
    expect(screen.getByText(/Blanchimont/i)).toBeInTheDocument();

    // Timing loops (Sector 1 and Sector 2 present, Start/Finish 0m removed)
    expect(screen.getByText('Sector 1 Gate')).toBeInTheDocument();
    expect(screen.getByText('Sector 2 Gate')).toBeInTheDocument();
    expect(screen.getByText('2300 m')).toBeInTheDocument();
    expect(screen.getByText('4800 m')).toBeInTheDocument();
    expect(screen.queryByText('Start / Finish Line')).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.0 m \(Loop Finish\)/i)).not.toBeInTheDocument();
  });

  it('closes when clicking the close button or pressing Escape', () => {
    const onClose = vi.fn();
    render(
      <CircuitInfoModal
        isOpen={true}
        onClose={onClose}
        trackName="Autodromo Nazionale Monza"
        trackCourse="Autodromo Nazionale Monza"
        trackGeometry={null}
      />
    );

    const closeBtn = screen.getByTitle('Close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders Monza details accurately with 11 turns and TUM survey', () => {
    render(
      <CircuitInfoModal
        isOpen={true}
        onClose={vi.fn()}
        trackName="Autodromo Nazionale Monza"
        trackGeometry={null}
      />
    );

    expect(screen.getByText('11 Turns')).toBeInTheDocument();
    expect(screen.getByText(/Italy/i)).toBeInTheDocument();
    expect(screen.getByText(/Variante del Rettifilo/i)).toBeInTheDocument();
    expect(screen.getByText(/Curva Parabolica/i)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CircuitInfoModal
        isOpen={false}
        onClose={vi.fn()}
        trackName="Autodromo Nazionale Monza"
        trackGeometry={null}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
