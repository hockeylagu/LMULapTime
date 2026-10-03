import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GpsTrackMap } from '../../../../../src/components/replay/map/GpsTrackMap.js';
import { MAP_LAYERS_STORAGE_KEY } from '../../../../../src/components/replay/map/display/mapLayers.js';
import type { TrackBoundaryGeometry, TrackMapDisplay, TrackSurfacePolygon } from '../../../../../shared/types/trackGeometry.js';
import { mockBounds, mockPoints } from '../gpsTrackMapFixtures.js';

const polygon = (offset: number): TrackSurfacePolygon => [[
  [offset, offset], [offset + 10, offset], [offset + 10, offset + 10], [offset, offset],
]];

const geometry: TrackBoundaryGeometry = {
  layoutKey: 'test_gp', circuitId: 'test', layoutId: 'gp', trackVenue: 'Test', trackCourse: 'GP', lengthM: 100,
  bounds: { minX: 80, maxX: 220, minZ: 180, maxZ: 260, spanX: 140, spanZ: 80 },
  leftBoundary: [[90, 190], [140, 210]], rightBoundary: [[110, 210], [160, 230]], centerline: [[100, 200], [150, 220], [200, 240]],
  geometryRevision: 'geometry-v1',
};

function mapDisplay(overrides: Partial<TrackMapDisplay['surfaces']> = {}): TrackMapDisplay {
  return {
    layoutKey: 'test_gp', sourceRevision: 'geometry-v1',
    surfaces: {
      road: [polygon(100)], kerb: [polygon(110)], runoff: [polygon(120)], pit: [polygon(130)], otherRoad: [polygon(140)],
      ...overrides,
    },
  };
}

function renderMap(display = mapDisplay()) {
  return render(<GpsTrackMap points={mockPoints} bounds={mockBounds} currentIndex={0} trackGeometry={geometry} mapDisplay={display} />);
}

function openLayers() {
  fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
  return screen.getByRole('group', { name: 'Map layers' });
}

describe('GPS map display layers', () => {
  beforeEach(() => localStorage.removeItem(MAP_LAYERS_STORAGE_KEY));
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(MAP_LAYERS_STORAGE_KEY);
  });

  it('shows only the active road and kerbs by default', () => {
    const { container } = renderMap();
    const surfacePaths = [...container.querySelectorAll('[data-surface]')].map(path => path.getAttribute('data-surface'));
    expect(surfacePaths).toEqual(['road', 'kerb']);
  });

  it('toggles native runoff and pit layers independently without changing the SVG camera', () => {
    const { container } = renderMap();
    const mapSvg = container.querySelector('[data-testid="gps-map-background"]')?.closest('svg');
    const initialViewBox = mapSvg?.getAttribute('viewBox');
    expect(initialViewBox).toBeTruthy();

    openLayers();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff' }));
    expect(container.querySelector('[data-surface="runoff"]')).toBeInTheDocument();
    expect(container.querySelector('[data-surface="pit"]')).toBeNull();
    expect(mapSvg?.getAttribute('viewBox')).toBe(initialViewBox);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pit lane and apron' }));
    expect(container.querySelector('[data-surface="runoff"]')).toBeInTheDocument();
    expect(container.querySelector('[data-surface="pit"]')).toBeInTheDocument();
    expect(mapSvg?.getAttribute('viewBox')).toBe(initialViewBox);
  });

  it('toggles a layer when clicking its label text without closing the panel', async () => {
    const user = userEvent.setup();
    renderMap();
    openLayers();

    const checkbox = screen.getByRole('checkbox', { name: 'Runoff' });
    expect(checkbox).not.toBeChecked();

    const labelText = screen.getByText('Runoff');
    await user.click(labelText);

    expect(checkbox).toBeChecked();
    expect(screen.getByRole('group', { name: 'Map layers' })).toBeInTheDocument();

    await user.click(labelText);
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('group', { name: 'Map layers' })).toBeInTheDocument();
  });

  it('fits enabled outer layers only on request and keeps controls from zooming the map on wheel input', () => {
    const { container } = renderMap(mapDisplay({ runoff: [polygon(10_000)] }));
    const mapSvg = container.querySelector('[data-testid="gps-map-background"]')?.closest('svg');
    const original = mapSvg?.getAttribute('viewBox');
    const panel = openLayers();
    fireEvent.wheel(panel, { deltaY: -120 });
    expect(mapSvg?.getAttribute('viewBox')).toBe(original);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff' }));
    expect(mapSvg?.getAttribute('viewBox')).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Fit visible layers' }));
    expect(mapSvg?.getAttribute('viewBox')).not.toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Fit track' }));
    expect(mapSvg?.getAttribute('viewBox')).toBe(original);
  });

  it('persists layer choices, restores defaults, and keeps the UI working when storage fails', () => {
    const first = renderMap();
    openLayers();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff' }));
    const stored = JSON.parse(localStorage.getItem(MAP_LAYERS_STORAGE_KEY) ?? '{}') as { runoff?: boolean };
    expect(stored.runoff).toBe(true);
    first.unmount();

    renderMap();
    openLayers();
    expect(screen.getByRole('checkbox', { name: 'Runoff' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(screen.getByRole('checkbox', { name: 'Runoff' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Active track' })).toBeChecked();
    expect(JSON.parse(localStorage.getItem(MAP_LAYERS_STORAGE_KEY) ?? '{}')).toMatchObject({ road: true, kerb: true, runoff: false, pit: false });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff' }));
    expect(screen.getByRole('checkbox', { name: 'Runoff' })).toBeChecked();
  });

  it('closes with Escape, restores focus to Layers, and disables unavailable pit geometry', () => {
    renderMap(mapDisplay({ pit: [] }));
    const trigger = screen.getByRole('button', { name: 'Layers' });
    const panel = openLayers();
    expect(screen.getByRole('checkbox', { name: 'Pit lane and apron' })).toBeDisabled();
    expect(screen.getByText(/Some optional surface layers are unavailable/)).toBeInTheDocument();
    expect(panel.querySelector('input:not(:disabled)')).toHaveFocus();

    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Map layers' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
