// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGpsSceneCameraFocus } from '../../../../../src/components/replay/map/scene/useGpsSceneCameraFocus.js';

const cornerMarkers = [{ cornerNumber: 1, actualSx: 10, actualSy: 20 }, { cornerNumber: 2, actualSx: 30, actualSy: 40 }];

describe('useGpsSceneCameraFocus', () => {
  it('refits only when the layout changes after the first one', () => {
    const resetPanZoom = vi.fn();
    const { rerender } = renderHook(({ layoutKey }) => useGpsSceneCameraFocus({
      layoutKey, selectedCornerNumber: null, cornerMarkers, focusOnPoint: vi.fn(), resetPanZoom,
    }), { initialProps: { layoutKey: 'monza_gp' as string | null } });
    expect(resetPanZoom).not.toHaveBeenCalled();
    rerender({ layoutKey: 'monza_gp' });
    rerender({ layoutKey: null });
    expect(resetPanZoom).not.toHaveBeenCalled();
    rerender({ layoutKey: 'monza_curva_grande' });
    expect(resetPanZoom).toHaveBeenCalledTimes(1);
  });

  it('zooms to a newly selected corner once and refits when it is cleared', () => {
    const focusOnPoint = vi.fn();
    const resetPanZoom = vi.fn();
    const { rerender } = renderHook(({ selected }) => useGpsSceneCameraFocus({
      layoutKey: 'monza_gp', selectedCornerNumber: selected, cornerMarkers, focusOnPoint, resetPanZoom,
    }), { initialProps: { selected: null as number | null } });
    expect(resetPanZoom).not.toHaveBeenCalled();
    rerender({ selected: 2 });
    rerender({ selected: 2 });
    expect(focusOnPoint).toHaveBeenCalledTimes(1);
    expect(focusOnPoint).toHaveBeenCalledWith(30, 40, 4.5);
    rerender({ selected: null });
    expect(resetPanZoom).toHaveBeenCalledTimes(1);
    rerender({ selected: 9 });
    expect(focusOnPoint).toHaveBeenCalledTimes(1);
  });
});
