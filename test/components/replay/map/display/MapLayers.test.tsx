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

const displayWithBrakeMarkers: TrackMapDisplay = {
  ...mapDisplay(),
  brakeMarkers: [
    { id: 'brake-150', center: [120, 205], label: '150', stationM: 325, side: 'left' },
    { id: 'brake-unknown', center: [180, 230], label: '50', stationM: 710, side: 'right' },
  ],
};

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

  it('uses one outer-surface toggle when only other roads are available', () => {
    const { container } = renderMap(mapDisplay({ runoff: [] }));
    openLayers();
    const toggle = screen.getByRole('checkbox', { name: 'Runoff and other roads' });
    expect(toggle).toBeEnabled();
    expect(screen.queryByRole('checkbox', { name: 'Other circuit roads' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(container.querySelector('[data-surface="otherRoad"]')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(container.querySelector('[data-surface="otherRoad"]')).not.toBeInTheDocument();
  });

  it('preserves an enabled legacy other-road preference in the combined toggle', () => {
    localStorage.setItem(MAP_LAYERS_STORAGE_KEY, JSON.stringify({ runoff: false, otherRoad: true }));
    const { container } = renderMap();
    openLayers();
    expect(screen.getByRole('checkbox', { name: 'Runoff and other roads' })).toBeChecked();
    expect(container.querySelector('[data-surface="runoff"]')).toBeInTheDocument();
    expect(container.querySelector('[data-surface="otherRoad"]')).toBeInTheDocument();
  });

  it('shows only the active road and kerbs by default', () => {
    const { container } = renderMap();
    const surfacePaths = [...container.querySelectorAll('[data-surface]')].map(path => path.getAttribute('data-surface'));
    expect(surfacePaths).toEqual(['road', 'kerb']);
  });

  it('renders centerline guide over active track when centerline layer is toggled on', () => {
    const { container } = renderMap();
    expect(container.querySelector('[data-testid="gps-track-centerline"]')).toBeNull();

    openLayers();
    const centerlineCheckbox = screen.getByRole('checkbox', { name: 'Centerline guide' });
    expect(centerlineCheckbox).toBeEnabled();
    fireEvent.click(centerlineCheckbox);

    const centerline = container.querySelector('[data-testid="gps-track-centerline"]');
    expect(centerline).toBeInTheDocument();
    expect(centerline).toHaveAttribute('stroke', '#94A3B8');
    // Active track road is still rendered underneath
    expect(container.querySelector('[data-surface="road"]')).toBeInTheDocument();
  });

  it('does not include G-force arrow in the map layers selection control', () => {
    renderMap();
    openLayers();
    expect(screen.queryByRole('checkbox', { name: 'G-force arrow' })).toBeNull();
  });

  it('renders map layer checkboxes in the requested order', () => {
    renderMap();
    openLayers();
    const checkboxes = screen.getAllByRole('checkbox');
    const labels = checkboxes.map(cb => cb.closest('label')?.textContent?.trim());
    expect(labels).toEqual([
      'Active track',
      'Kerbs',
      'Braking markers',
      'Pit lane',
      'Centerline guide',
      'Runoff and other roads',
    ]);
  });

  it('switches apron, gravel and grass with runoff and keys their colours', () => {
    const { container } = renderMap(mapDisplay({ apron: [polygon(150)], gravel: [polygon(160)], grass: [polygon(170)] }));
    openLayers();
    expect(screen.queryByRole('list', { name: 'Runoff colours' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff and other roads' }));
    const drawn = [...container.querySelectorAll('[data-surface]')].map(path => path.getAttribute('data-surface'));
    expect(drawn).toEqual(['grass', 'gravel', 'runoff', 'apron', 'otherRoad', 'road', 'kerb']);
    expect(screen.getAllByRole('listitem').map(item => item.textContent))
      .toEqual(['Paved runoff', 'Painted apron', 'Gravel', 'Grass', 'Other roads']);
  });

  it('keys only the runoff kinds the layout has', () => {
    renderMap(mapDisplay({ gravel: [polygon(160)] }));
    openLayers();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff and other roads' }));
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Paved runoff', 'Gravel', 'Other roads']);
  });

  it('migrates a stored gravel, grass or apron preference into the combined runoff toggle', () => {
    localStorage.setItem(MAP_LAYERS_STORAGE_KEY, JSON.stringify({ runoff: false, grass: true }));
    const { container } = renderMap(mapDisplay({ apron: [polygon(150)] }));
    openLayers();
    expect(screen.getByRole('checkbox', { name: 'Runoff and other roads' })).toBeChecked();
    expect(container.querySelector('[data-surface="apron"]')).toBeInTheDocument();
  });

  it('toggles native runoff and pit layers independently without changing the SVG camera', () => {
    const { container } = renderMap();
    const mapSvg = container.querySelector('[data-testid="gps-map-background"]')?.closest('svg');
    const initialViewBox = mapSvg?.getAttribute('viewBox');
    expect(initialViewBox).toBeTruthy();

    openLayers();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff and other roads' }));
    expect(container.querySelector('[data-surface="runoff"]')).toBeInTheDocument();
    expect(container.querySelector('[data-surface="otherRoad"]')).toBeInTheDocument();
    expect(container.querySelector('[data-surface="pit"]')).toBeNull();
    expect(mapSvg?.getAttribute('viewBox')).toBe(initialViewBox);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pit lane' }));
    expect(container.querySelector('[data-surface="runoff"]')).toBeInTheDocument();
    expect(container.querySelector('[data-surface="pit"]')).toBeInTheDocument();
    expect(mapSvg?.getAttribute('viewBox')).toBe(initialViewBox);
  });

  it('keeps braking markers off by default and draws measured and unknown boards when enabled', () => {
    const { container, rerender } = renderMap(displayWithBrakeMarkers);
    expect(container.querySelector('[data-testid="gps-brake-markers"]')).toBeNull();

    openLayers();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Braking markers' }));
    expect(container.querySelector('[data-marker-id="brake-150"] text')).toHaveTextContent('150');
    expect(container.querySelector('[data-marker-id="brake-unknown"] text')).toHaveTextContent('50');
    expect(screen.getByRole('img', { name: 'Brake board, 150' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Brake board, 50' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="gps-brake-markers"] rect')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="gps-brake-markers"] circle')).toHaveLength(0);

    rerender(<GpsTrackMap points={mockPoints} bounds={mockBounds} currentIndex={0} trackGeometry={geometry} mapDisplay={mapDisplay()} />);
    expect(screen.getByRole('checkbox', { name: 'Braking markers' })).toBeDisabled();
    expect(container.querySelector('[data-testid="gps-brake-markers"]')).toBeNull();
  });

  it('toggles a layer when clicking its label text without closing the panel', async () => {
    const user = userEvent.setup();
    renderMap();
    openLayers();

    const checkbox = screen.getByRole('checkbox', { name: 'Runoff and other roads' });
    expect(checkbox).not.toBeChecked();

    const labelText = screen.getByText('Runoff and other roads');
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff and other roads' }));
    expect(mapSvg?.getAttribute('viewBox')).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Fit visible layers' }));
    expect(mapSvg?.getAttribute('viewBox')).not.toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Fit track' }));
    expect(mapSvg?.getAttribute('viewBox')).toBe(original);
  });

  it('persists layer choices, restores defaults, and keeps the UI working when storage fails', () => {
    const first = renderMap();
    openLayers();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff and other roads' }));
    const stored = JSON.parse(localStorage.getItem(MAP_LAYERS_STORAGE_KEY) ?? '{}') as { runoff?: boolean };
    expect(stored.runoff).toBe(true);
    first.unmount();

    renderMap();
    openLayers();
    expect(screen.getByRole('checkbox', { name: 'Runoff and other roads' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(screen.getByRole('checkbox', { name: 'Runoff and other roads' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Active track' })).toBeChecked();
    expect(JSON.parse(localStorage.getItem(MAP_LAYERS_STORAGE_KEY) ?? '{}')).toMatchObject({ road: true, kerb: true, runoff: false, pit: false });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Runoff and other roads' }));
    expect(screen.getByRole('checkbox', { name: 'Runoff and other roads' })).toBeChecked();
  });

  it('closes with Escape, restores focus to Layers, and disables unavailable pit geometry', () => {
    renderMap(mapDisplay({ pit: [] }));
    const trigger = screen.getByRole('button', { name: 'Layers' });
    const panel = openLayers();
    expect(screen.getByRole('checkbox', { name: 'Pit lane' })).toBeDisabled();
    expect(screen.getByText(/Some optional map layers are unavailable/)).toBeInTheDocument();
    expect(panel.querySelector('input:not(:disabled)')).toHaveFocus();

    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Map layers' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('provides sub-toggles for distance, sponsor ads, and digi boards and offsets overlapping digi boards', () => {
    const displayWithMixed: TrackMapDisplay = {
      ...mapDisplay(),
      brakeMarkers: [
        { id: 'm-dist', center: [120, 205], label: '100', stationM: 300, side: 'left' },
        { id: 'm-digi', center: [120, 205], label: 'DIGI', stationM: 300, side: 'left' },
        { id: 'm-ad', center: [180, 230], label: 'TOT', stationM: 700, side: 'right' },
      ],
    };

    const { container } = renderMap(displayWithMixed);
    openLayers();

    // Enable braking markers -> sub-toggles appear
    fireEvent.click(screen.getByRole('checkbox', { name: 'Braking markers' }));
    const distCheckbox = screen.getByRole('checkbox', { name: /Distance/ });
    const adsCheckbox = screen.getByRole('checkbox', { name: /Sponsor ads/ });
    const digiCheckbox = screen.getByRole('checkbox', { name: /Digi boards/ });

    expect(distCheckbox).toBeChecked();
    expect(adsCheckbox).toBeChecked();
    expect(digiCheckbox).toBeChecked();

    // All three are visible initially
    expect(container.querySelector('[data-marker-id="m-dist"]')).toBeInTheDocument();
    expect(container.querySelector('[data-marker-id="m-digi"]')).toBeInTheDocument();
    expect(container.querySelector('[data-marker-id="m-ad"]')).toBeInTheDocument();

    // Overlapping digi board is shifted away from distance board
    const distTransform = container.querySelector('[data-marker-id="m-dist"] g')?.getAttribute('transform');
    const digiTransform = container.querySelector('[data-marker-id="m-digi"] g')?.getAttribute('transform');
    expect(distTransform).not.toEqual(digiTransform);

    // Toggle off distance -> only ads and digi remain
    fireEvent.click(distCheckbox);
    expect(container.querySelector('[data-marker-id="m-dist"]')).toBeNull();
    expect(container.querySelector('[data-marker-id="m-digi"]')).toBeInTheDocument();
    expect(container.querySelector('[data-marker-id="m-ad"]')).toBeInTheDocument();

    // Toggle off digi -> only ads remain
    fireEvent.click(digiCheckbox);
    expect(container.querySelector('[data-marker-id="m-digi"]')).toBeNull();
    expect(container.querySelector('[data-marker-id="m-ad"]')).toBeInTheDocument();

    // Toggle off ads -> no markers
    fireEvent.click(adsCheckbox);
    expect(container.querySelector('[data-marker-id="m-ad"]')).toBeNull();
  });
});
