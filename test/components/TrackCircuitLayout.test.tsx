import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackCircuitLayout } from '../../src/components/track-detail/TrackCircuitLayout.js';
import { TrackDetailHeader } from '../../src/components/track-detail/TrackDetailHeader.js';
import { TrackBoundaryGeometry } from '../../src/components/replay/map/index.js';

describe('TrackCircuitLayout', () => {
  const mockGeometry: TrackBoundaryGeometry = {
    layoutKey: 'spa_gp',
    circuitId: 'spa',
    layoutId: 'gp',
    trackVenue: 'Circuit de Spa-Francorchamps',
    trackCourse: 'GP',
    lengthM: 7004,
    bounds: {
      minX: 0,
      maxX: 1000,
      minZ: 0,
      maxZ: 1000,
      spanX: 1000,
      spanZ: 1000,
    },
    leftBoundary: [
      [100, 100],
      [200, 500],
      [500, 800],
      [800, 500],
      [500, 100],
    ],
    rightBoundary: [
      [120, 100],
      [220, 500],
      [520, 800],
      [820, 500],
      [520, 100],
    ],
    centerline: [
      [110, 100],
      [210, 500],
      [510, 800],
      [810, 500],
      [510, 100],
    ],
    startFinish: [110, 100],
  };

  it('renders circuit layout SVG with h-[54px] matching vertical space of title and subtitle', () => {
    render(
      <TrackCircuitLayout
        trackName="Circuit de Spa-Francorchamps"
        trackGeometry={mockGeometry}
      />
    );

    const layoutContainer = screen.getByTestId('track-circuit-layout');
    expect(layoutContainer).toBeInTheDocument();
    expect(layoutContainer.className).toContain('h-[54px]');
    expect(layoutContainer.className).toContain('w-[72px]');
    expect(layoutContainer.className).not.toContain('bg-');
    expect(layoutContainer.className).not.toContain('border');
    expect(layoutContainer.className).not.toContain('hover:');

    const svg = layoutContainer.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 800');

    // Check only the white circuit outline path is rendered
    const paths = svg?.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths?.[0].getAttribute('stroke')).toBe('#FFFFFF');
    expect(paths?.[0].getAttribute('fill')).toBe('none');

    // Check no extra circles/dots exist
    const circle = svg?.querySelector('circle');
    expect(circle).toBeNull();
  });

  it('renders fallback icon when geometry is null and not loading', () => {
    render(
      <TrackCircuitLayout
        trackName="Unknown Custom Circuit"
        trackGeometry={null}
      />
    );

    const fallbackContainer = screen.getByTestId('track-circuit-layout-fallback');
    expect(fallbackContainer).toBeInTheDocument();
    expect(fallbackContainer.className).toContain('h-[54px]');
    expect(fallbackContainer.className).toContain('w-[72px]');
  });

  it('renders before title in TrackDetailHeader with matching vertical space', async () => {
    const onBack = vi.fn();
    const setSelectedClass = vi.fn();
    const setSelectedCarModel = vi.fn();

    render(
      <TrackDetailHeader
        trackName="Circuit de Spa-Francorchamps"
        sessionsCount={5}
        onBack={onBack}
        selectedClass="All"
        setSelectedClass={setSelectedClass}
        selectedCarModel="All"
        setSelectedCarModel={setSelectedCarModel}
        availableCarModels={['Ferrari 499P']}
      />
    );

    // The heading must be present
    const heading = screen.getByRole('heading', { level: 2, name: 'Circuit de Spa-Francorchamps' });
    expect(heading).toBeInTheDocument();

    // Verify layout element is present before the title in DOM order
    const parentContainer = heading.closest('.flex.items-center.gap-3\\.5');
    expect(parentContainer).toBeInTheDocument();

    const firstChild = parentContainer?.firstElementChild;
    expect(firstChild).toHaveAttribute('data-testid');
    expect(firstChild?.className).toContain('h-[54px]');

    // Wait for any async geometry resolution to settle cleanly
    await screen.findByTestId(/track-circuit-layout/);
  });

  it('renders card size with h-[46px] w-[62px] matching vertical space in TrackSummaryCard', () => {
    render(
      <TrackCircuitLayout
        trackName="Circuit de Spa-Francorchamps"
        trackGeometry={mockGeometry}
        size="card"
      />
    );

    const layoutContainer = screen.getByTestId('track-circuit-layout');
    expect(layoutContainer).toBeInTheDocument();
    expect(layoutContainer.className).toContain('h-[46px]');
    expect(layoutContainer.className).toContain('w-[62px]');
  });
});
