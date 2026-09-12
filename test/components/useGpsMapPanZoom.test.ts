import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGpsMapPanZoom } from '../../src/components/replay/map/useGpsMapPanZoom.js';

describe('useGpsMapPanZoom', () => {
  it('initializes at zoomLevel=1 and computes default viewBox with BASE_ZOOM=1.5', () => {
    const { result } = renderHook(() =>
      useGpsMapPanZoom({ viewBoxSize: 800, currentPos: { sx: 400, sy: 400 } })
    );

    expect(result.current.zoomLevel).toBe(1);
    expect(result.current.followCar).toBe(false);

    // Visible size is 800 / (1 * 1.5) = 533.3
    const [, , vw, vh] = result.current.currentViewBox.split(' ').map(Number);
    expect(vw).toBeCloseTo(533.3, 0);
    expect(vh).toBeCloseTo(533.3, 0);
  });

  it('zooms in and zooms out with zoomIn and zoomOut controls', () => {
    const { result } = renderHook(() =>
      useGpsMapPanZoom({ viewBoxSize: 800, currentPos: { sx: 400, sy: 400 } })
    );

    act(() => {
      result.current.zoomIn();
    });
    expect(result.current.zoomLevel).toBe(2);

    act(() => {
      result.current.zoomOut();
    });
    expect(result.current.zoomLevel).toBe(1);
  });

  it('resets zoom and pan when calling resetPanZoom', () => {
    const { result } = renderHook(() =>
      useGpsMapPanZoom({ viewBoxSize: 800, currentPos: { sx: 400, sy: 400 } })
    );

    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
    });
    expect(result.current.zoomLevel).toBe(3);

    act(() => {
      result.current.resetPanZoom();
    });
    expect(result.current.zoomLevel).toBe(1);
  });

  it('focuses on a specific target coordinate with focusOnPoint', () => {
    const { result } = renderHook(() =>
      useGpsMapPanZoom({ viewBoxSize: 800, currentPos: { sx: 400, sy: 400 } })
    );

    act(() => {
      result.current.focusOnPoint(250, 300, 4.5);
    });

    expect(result.current.zoomLevel).toBe(4.5);
    const [vx, vy, vw, vh] = result.current.currentViewBox.split(' ').map(Number);
    // At zoom 4.5, visible size is 800 / (4.5 * 1.5) = 118.5
    expect(vw).toBeCloseTo(118.5, 0);
    expect(vh).toBeCloseTo(118.5, 0);
    // Center is (250, 300)
    expect(vx + vw / 2).toBeCloseTo(250, 0);
    expect(vy + vh / 2).toBeCloseTo(300, 0);
  });

  it('keeps camera centered exactly on currentPos when followCar is true at any zoom level', () => {
    const carPos = { sx: 620, sy: 180 };
    const { result } = renderHook(() =>
      useGpsMapPanZoom({ viewBoxSize: 800, currentPos: carPos })
    );

    // Zoom in to 4.5x
    act(() => {
      result.current.setZoomLevel(4.5);
      result.current.setFollowCar(true);
    });

    expect(result.current.followCar).toBe(true);
    expect(result.current.zoomLevel).toBe(4.5);

    const [vx, vy, vw, vh] = result.current.currentViewBox.split(' ').map(Number);
    // Center of viewBox must be exactly equal to car coordinates (620, 180)
    expect(vx + vw / 2).toBeCloseTo(carPos.sx, 0);
    expect(vy + vh / 2).toBeCloseTo(carPos.sy, 0);
  });

  it('resets any stale pan offset when followCar is toggled on so car is centered', () => {
    const carPos = { sx: 350, sy: 550 };
    const { result } = renderHook(() =>
      useGpsMapPanZoom({ viewBoxSize: 800, currentPos: carPos })
    );

    // User was zoomed in and focused on a distant corner at (100, 100)
    act(() => {
      result.current.focusOnPoint(100, 100, 4.5);
    });

    // Then user toggles followCar on
    act(() => {
      result.current.setFollowCar(true);
    });

    expect(result.current.followCar).toBe(true);
    const [vx, vy, vw, vh] = result.current.currentViewBox.split(' ').map(Number);
    // Center must be on car (350, 550), not shifted by previous corner focus
    expect(vx + vw / 2).toBeCloseTo(carPos.sx, 0);
    expect(vy + vh / 2).toBeCloseTo(carPos.sy, 0);
  });
});
