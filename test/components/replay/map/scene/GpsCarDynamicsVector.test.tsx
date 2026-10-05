import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsCarDynamicsVector } from '../../../../../src/components/replay/map/scene/GpsCarDynamicsVector.js';

describe('GpsCarDynamicsVector', () => {
  it('returns null when total G force is below threshold (< 0.2G)', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={0.05}
          accelLonG={0.05}
          unitsPerMeter={5}
          markerScale={1}
        />
      </svg>
    );

    expect(container.querySelector('[data-testid="gps-car-dynamics-vector"]')).toBeNull();
  });

  it('returns null when unitsPerMeter is invalid or zero', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={1.5}
          accelLonG={0.8}
          unitsPerMeter={0}
          markerScale={1}
        />
      </svg>
    );

    expect(container.querySelector('[data-testid="gps-car-dynamics-vector"]')).toBeNull();
  });

  it('renders line and arrowhead with sky blue color for moderate G (< 1.4G)', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={1.0}
          accelLonG={0.0}
          unitsPerMeter={5}
          markerScale={1}
        />
      </svg>
    );

    const vector = screen.getByTestId('gps-car-dynamics-vector');
    expect(vector).toBeInTheDocument();
    const line = container.querySelector('line');
    expect(line).toHaveAttribute('stroke', '#38bdf8');
    const polygon = container.querySelector('polygon');
    expect(polygon).toHaveAttribute('fill', '#38bdf8');
  });

  it('renders amber color for high G (1.4G - 2.2G)', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={1.6}
          accelLonG={0.0}
          unitsPerMeter={5}
          markerScale={1}
        />
      </svg>
    );

    const line = container.querySelector('line');
    expect(line).toHaveAttribute('stroke', '#fbbf24');
  });

  it('renders red color for extreme G (>= 2.2G)', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={2.5}
          accelLonG={1.0}
          unitsPerMeter={5}
          markerScale={1}
        />
      </svg>
    );

    const line = container.querySelector('line');
    expect(line).toHaveAttribute('stroke', '#f87171');
  });

  it('renders informative tooltip title with G-force channels', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={1.8}
          accelLonG={-0.6}
          unitsPerMeter={10}
          markerScale={1}
        />
      </svg>
    );

    const title = container.querySelector('title');
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toContain('1.90G');
    expect(title?.textContent).toContain('+1.80G Lat');
    expect(title?.textContent).toContain('-0.60G Lon');
  });

  it('points forward (-Y) under braking (accelLonG < 0) for front axle load transfer', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={0.0}
          accelLonG={-1.5}
          unitsPerMeter={5}
          markerScale={1}
        />
      </svg>
    );

    const line = container.querySelector('line');
    expect(line).toBeInTheDocument();
    expect(Number(line?.getAttribute('x2'))).toBeCloseTo(0, 1);
    // In car body frame, -Y is forward (windshield)
    expect(Number(line?.getAttribute('y2'))).toBeLessThan(0);
  });

  it('points rearward (+Y) under acceleration (accelLonG > 0) for rear axle squat', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={0.0}
          accelLonG={1.2}
          unitsPerMeter={5}
          markerScale={1}
        />
      </svg>
    );

    const line = container.querySelector('line');
    expect(line).toBeInTheDocument();
    expect(Number(line?.getAttribute('x2'))).toBeCloseTo(0, 1);
    // In car body frame, +Y is rearward (tail)
    expect(Number(line?.getAttribute('y2'))).toBeGreaterThan(0);
  });

  it('points left (-X) in a right turn (accelLatG < 0) for outside tire load transfer', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={-1.5}
          accelLonG={0.0}
          unitsPerMeter={5}
          markerScale={1}
        />
      </svg>
    );

    const line = container.querySelector('line');
    expect(line).toBeInTheDocument();
    // In car body frame, -X is left (outside tires in right turn)
    expect(Number(line?.getAttribute('x2'))).toBeLessThan(0);
    expect(Number(line?.getAttribute('y2'))).toBeCloseTo(0, 1);
  });

  it('points right (+X) in a left turn (accelLatG > 0) for outside tire load transfer', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={1.5}
          accelLonG={0.0}
          unitsPerMeter={5}
          markerScale={1}
        />
      </svg>
    );

    const line = container.querySelector('line');
    expect(line).toBeInTheDocument();
    // In car body frame, +X is right (outside tires in left turn)
    expect(Number(line?.getAttribute('x2'))).toBeGreaterThan(0);
    expect(Number(line?.getAttribute('y2'))).toBeCloseTo(0, 1);
  });

  it('respects opacity and colorOverride props', () => {
    const { container } = render(
      <svg>
        <GpsCarDynamicsVector
          accelLatG={1.5}
          accelLonG={0.5}
          unitsPerMeter={5}
          markerScale={1}
          opacity={0.65}
          colorOverride="#f59e0b"
        />
      </svg>
    );

    const vectorGroup = container.querySelector('[data-testid="gps-car-dynamics-vector"]');
    expect(vectorGroup).toHaveAttribute('opacity', '0.65');
    const line = container.querySelector('line');
    expect(line).toHaveAttribute('stroke', '#f59e0b');
    const polygon = container.querySelector('polygon');
    expect(polygon).toHaveAttribute('fill', '#f59e0b');
  });
});
