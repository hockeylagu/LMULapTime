import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsTrackMap } from '../../../../../src/components/replay/index.js';
import { ReplayTrajectoryPoint } from '../../../../../server/core/types.js';

const points: ReplayTrajectoryPoint[] = [
  { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
  { x: 101, y: 10, z: 201, rotY: 0, speedKmh: 160, throttle: 80, brake: 0, timeSec: 0.1 },
  { x: 102, y: 10, z: 202, rotY: 0, speedKmh: 170, throttle: 80, brake: 0, timeSec: 0.2 },
];
const bounds = { minX: 100, maxX: 200, minZ: 200, maxZ: 240, spanX: 100, spanZ: 40 };

describe('GpsSceneCarMarkers', () => {
  it('draws the car and the ghost in their own layer over the scene, not among the racing lines', () => {
    const { container } = render(<GpsTrackMap points={points} bounds={bounds} currentIndex={1} baselinePoints={points} />);
    const overlay = screen.getByTestId('gps-car-markers');
    const scene = container.querySelector('[data-track-line="primary"]')?.closest('svg');

    expect(overlay).toHaveClass('will-change-transform', 'pointer-events-none', 'absolute', 'inset-0');
    expect(overlay.getAttribute('viewBox')).toBe(scene?.getAttribute('viewBox'));
    expect(overlay.querySelector('[filter="url(#carGlow)"]')).toBeInTheDocument();
    expect(overlay.querySelector('[filter="url(#ghostGlow)"]')).toBeInTheDocument();
    expect(overlay.querySelector('[data-track-line]')).toBeNull();
    expect(scene?.querySelector('[filter="url(#carGlow)"]')).toBeNull();
  });

  it('follows the scrub cursor', () => {
    const { rerender } = render(<GpsTrackMap points={points} bounds={bounds} currentIndex={0} />);
    const carTransform = () => screen.getByTestId('gps-car-markers').querySelector('g')?.getAttribute('transform');
    const before = carTransform();
    rerender(<GpsTrackMap points={points} bounds={bounds} currentIndex={2} />);
    expect(carTransform()).not.toBe(before);
  });
});
