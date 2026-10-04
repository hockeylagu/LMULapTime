import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TrackCircuitLayout } from '../../../src/components/track-detail/TrackCircuitLayout.js';
import { TrackDetailHeader } from '../../../src/components/track-detail/TrackDetailHeader.js';
import { TrackBoundaryGeometry } from '../../../src/components/replay/map/index.js';
import * as trackGeometryApi from '../../../src/api/trackGeometryApi.js';

describe('TrackCircuitLayout', () => {
  afterEach(() => vi.restoreAllMocks());

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

  it('renders circuit layout SVG with h-[128px] as a larger square beside the track title', () => {
    render(
      <TrackCircuitLayout
        trackName="Circuit de Spa-Francorchamps"
        trackGeometry={mockGeometry}
      />
    );

    const layoutContainer = screen.getByTestId('track-circuit-layout');
    expect(layoutContainer).toBeInTheDocument();
    expect(layoutContainer.className).toContain('h-[128px]');
    expect(layoutContainer.className).toContain('w-[128px]');
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

  it('keeps the simple outline when native road, runoff and kerb surfaces are available', () => {
    const onClick = vi.fn();
    const geometryWithSurfaces: TrackBoundaryGeometry = {
      ...mockGeometry,
      mapSurfaces: {
        road: [[[[100, 100], [400, 100], [400, 400], [100, 100]]]],
        runoff: [[[[80, 80], [420, 80], [420, 420], [80, 80]]]],
        kerb: [[[[120, 120], [180, 120], [180, 180], [120, 120]]]],
      },
    };

    render(<TrackCircuitLayout trackName="Circuit de Spa-Francorchamps" trackGeometry={geometryWithSurfaces} onClick={onClick} />);

    const layout = screen.getByRole('button', { name: 'Open Circuit de Spa-Francorchamps' });
    expect(layout).toHaveAttribute('title', 'Circuit de Spa-Francorchamps Circuit Layout');
    expect(layout.querySelectorAll('[data-surface]')).toHaveLength(0);
    expect(layout.querySelectorAll('path')).toHaveLength(1);
    expect(layout.querySelector('path[stroke="#FFFFFF"]')).toBeInTheDocument();
    fireEvent.click(layout);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('fits the outline to centerline bounds instead of broad geometry bounds', () => {
    const geometryWithBroadBounds: TrackBoundaryGeometry = {
      ...mockGeometry,
      bounds: {
        minX: -5000,
        maxX: 5000,
        minZ: -5000,
        maxZ: 5000,
        spanX: 10000,
        spanZ: 10000,
      },
    };

    render(<TrackCircuitLayout trackName="Circuit de Spa-Francorchamps" trackGeometry={geometryWithBroadBounds} />);

    const path = screen.getByTestId('track-circuit-layout').querySelector('path');
    expect(path?.getAttribute('d')).toMatch(/^M 45\.0 755\.0/);
  });

  it('loads a lightweight static outline without requesting full geometry', () => {
    const loadGeometry = vi.spyOn(trackGeometryApi, 'loadTrackBoundaryGeometry');

    const { container } = render(<TrackCircuitLayout trackName="Circuit de Spa-Francorchamps" layoutKey="spa_gp" />);

    const outline = container.querySelector('img');
    expect(outline).toBeInTheDocument();
    expect(outline).toHaveAttribute('src', trackGeometryApi.getTrackOutlineUrl('spa_gp'));
    expect(loadGeometry).not.toHaveBeenCalled();
  });

  it('fetches full geometry after the static outline fails and then uses the inline outline', async () => {
    const loadGeometry = vi.spyOn(trackGeometryApi, 'loadTrackBoundaryGeometry').mockResolvedValue(mockGeometry);

    const { container } = render(<TrackCircuitLayout trackName="Circuit de Spa-Francorchamps" layoutKey="spa_gp" />);

    const outline = container.querySelector('img');
    expect(outline).toBeInTheDocument();
    fireEvent.error(outline!);

    const layout = await screen.findByTestId('track-circuit-layout');
    expect(loadGeometry).toHaveBeenCalledOnce();
    await waitFor(() => expect(layout.querySelector('path[stroke="#FFFFFF"]')).toBeInTheDocument());
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
    expect(fallbackContainer.className).toContain('h-[128px]');
    expect(fallbackContainer.className).toContain('w-[128px]');
  });

  it('renders a full-height outline beside the track header content', async () => {
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
    const parentContainer = heading.closest('.grid');
    expect(parentContainer).toBeInTheDocument();

    const firstChild = parentContainer?.firstElementChild;
    expect(firstChild).toHaveAttribute('data-testid');
    expect(firstChild?.className).toContain('w-[160px]');
    expect(firstChild?.className).toContain('self-stretch');

    // Wait for any async geometry resolution to settle cleanly
    await screen.findByTestId(/track-circuit-layout/);
  });

  it('renders the larger square outline used beside track card information', () => {
    render(
      <TrackCircuitLayout
        trackName="Circuit de Spa-Francorchamps"
        trackGeometry={mockGeometry}
        size="card"
      />
    );

    const layoutContainer = screen.getByTestId('track-circuit-layout');
    expect(layoutContainer).toBeInTheDocument();
    expect(layoutContainer.className).toContain('h-[128px]');
    expect(layoutContainer.className).toContain('w-[128px]');
  });
});
