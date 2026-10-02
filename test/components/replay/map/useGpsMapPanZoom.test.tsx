import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGpsMapPanZoom } from '../../../../src/components/replay/map/useGpsMapPanZoom.js';

describe('useGpsMapPanZoom', () => {
  it('centers once with C at the same zoom and toggles follow with F from the chart', () => {
    const surface = document.createElement('div'); surface.dataset.replaySurface = 'chart'; document.body.append(surface);
    const { result, rerender } = renderHook(({ position }) => useGpsMapPanZoom({ viewBoxSize: 800, currentPos: position }),
      { initialProps: { position: { sx: 550, sy: 100 } } });
    act(() => result.current.setZoomLevel(4));
    act(() => surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })));
    expect(result.current.zoomLevel).toBe(4); expect(result.current.followCar).toBe(false);
    const centered = result.current.currentViewBox;
    rerender({ position: { sx: 650, sy: 200 } });
    expect(result.current.currentViewBox).toBe(centered);
    act(() => surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true })));
    expect(result.current.followCar).toBe(true);
    rerender({ position: { sx: 700, sy: 250 } });
    const followed = result.current.currentViewBox;
    act(() => surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true })));
    expect(result.current.followCar).toBe(false);
    expect(result.current.currentViewBox).toBe(followed);
    rerender({ position: { sx: 750, sy: 300 } });
    expect(result.current.currentViewBox).toBe(followed);
    surface.remove();
  });

  it('follows a new scrub position while zoomed, then preserves manual map exploration', () => {
    const { result, rerender } = renderHook(({ position }) => useGpsMapPanZoom({ viewBoxSize: 800, currentPos: position }),
      { initialProps: { position: { sx: 500, sy: 300 } } });
    act(() => result.current.focusOnPoint(200, 100, 4));
    rerender({ position: { sx: 600, sy: 350 } });
    expect(result.current.followCar).toBe(true);
    act(() => result.current.handlePointerDown({ button: 0, target: document.createElement('div'), clientX: 100, clientY: 100 } as unknown as React.PointerEvent<HTMLDivElement>));
    expect(result.current.followCar).toBe(false);
    const view = result.current.currentViewBox;
    rerender({ position: { sx: 650, sy: 350 } });
    expect(result.current.currentViewBox).toBe(view);
  });

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

  it('zooms in centered at the cursor coordinates with zoomAtCoords / handleDoubleClick', () => {
    const { result } = renderHook(() =>
      useGpsMapPanZoom({ viewBoxSize: 800, currentPos: { sx: 400, sy: 400 } })
    );

    // Mock DOM container
    const mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 800,
        right: 800,
        bottom: 800,
      }),
    });
    result.current.containerRef.current = mockContainer;

    // Simulate double click at (200, 300)
    act(() => {
      const mockEvent = {
        button: 0,
        clientX: 200,
        clientY: 300,
        preventDefault: () => {},
        target: mockContainer,
      } as unknown as React.MouseEvent<HTMLDivElement>;
      result.current.handleDoubleClick(mockEvent);
    });

    expect(result.current.zoomLevel).toBe(3);
    // When zooming towards (200, 300) from default center (400, 400), pan shifts towards (200, 300)
    expect(result.current.panOffset.x).toBeLessThan(0);
    expect(result.current.panOffset.y).toBeLessThan(0);

    // Consecutive double click zooms 2 more steps (3 -> 6)
    act(() => {
      const mockEvent = {
        button: 0,
        clientX: 200,
        clientY: 300,
        preventDefault: () => {},
        target: mockContainer,
      } as unknown as React.MouseEvent<HTMLDivElement>;
      result.current.handleDoubleClick(mockEvent);
    });
    expect(result.current.zoomLevel).toBe(6);
  });

  it('preserves followCar mode when zoomIn and zoomOut are clicked', () => {
    const carPos = { sx: 500, sy: 300 };
    const { result } = renderHook(() =>
      useGpsMapPanZoom({ viewBoxSize: 800, currentPos: carPos })
    );

    act(() => {
      result.current.setFollowCar(true);
    });
    expect(result.current.followCar).toBe(true);

    // Zoom in with + button
    act(() => {
      result.current.zoomIn();
    });
    expect(result.current.zoomLevel).toBe(2);
    expect(result.current.followCar).toBe(true);
    const [vx1, vy1, vw1, vh1] = result.current.currentViewBox.split(' ').map(Number);
    expect(vx1 + vw1 / 2).toBeCloseTo(carPos.sx, 0);
    expect(vy1 + vh1 / 2).toBeCloseTo(carPos.sy, 0);

    // Zoom out with - button
    act(() => {
      result.current.zoomOut();
    });
    expect(result.current.zoomLevel).toBe(1);
    expect(result.current.followCar).toBe(true);
    const [vx2, vy2, vw2, vh2] = result.current.currentViewBox.split(' ').map(Number);
    expect(vx2 + vw2 / 2).toBeCloseTo(carPos.sx, 0);
    expect(vy2 + vh2 / 2).toBeCloseTo(carPos.sy, 0);
  });

  it('does not start panning or cancel followCar when pointer down occurs on a button or controls overlay', () => {
    const carPos = { sx: 500, sy: 300 };
    const { result } = renderHook(() =>
      useGpsMapPanZoom({ viewBoxSize: 800, currentPos: carPos })
    );

    act(() => {
      result.current.setFollowCar(true);
    });

    const mockButton = document.createElement('button');
    act(() => {
      const mockEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        target: mockButton,
      } as unknown as React.PointerEvent<HTMLDivElement>;
      result.current.handlePointerDown(mockEvent);
    });

    // followCar must still be true
    expect(result.current.followCar).toBe(true);
  });
});
