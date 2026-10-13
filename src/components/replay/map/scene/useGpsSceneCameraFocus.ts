import { useEffect, useRef } from 'react';

interface Options {
  layoutKey: string | null | undefined;
  selectedCornerNumber: number | null | undefined;
  cornerMarkers: ReadonlyArray<{ cornerNumber: number; actualSx: number; actualSy: number }>;
  focusOnPoint: (sx: number, sy: number, zoom: number) => void;
  resetPanZoom: () => void;
}

/** Refits the camera when the layout changes, and zooms to a selected corner (refitting once it is cleared). */
export function useGpsSceneCameraFocus({ layoutKey, selectedCornerNumber, cornerMarkers, focusOnPoint, resetPanZoom }: Options) {
  const lastLayoutKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = layoutKey ?? null;
    if (!key || lastLayoutKeyRef.current === key) return;
    if (lastLayoutKeyRef.current !== null) resetPanZoom();
    lastLayoutKeyRef.current = key;
  }, [layoutKey, resetPanZoom]);

  const lastSelectedCornerRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedCornerNumber !== null && selectedCornerNumber !== undefined) {
      if (selectedCornerNumber === lastSelectedCornerRef.current) return;
      lastSelectedCornerRef.current = selectedCornerNumber;
      const corner = cornerMarkers.find(c => c.cornerNumber === selectedCornerNumber);
      if (corner) focusOnPoint(corner.actualSx, corner.actualSy, 4.5);
    } else if (lastSelectedCornerRef.current !== null) {
      lastSelectedCornerRef.current = null;
      resetPanZoom();
    }
  }, [selectedCornerNumber, cornerMarkers, focusOnPoint, resetPanZoom]);
}
