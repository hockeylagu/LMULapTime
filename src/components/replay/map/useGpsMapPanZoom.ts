import { useState, useRef, useEffect, useMemo } from 'react';

export interface UseGpsMapPanZoomOptions {
  viewBoxSize: number;
  currentPos?: { sx: number; sy: number };
}

export function useGpsMapPanZoom({ viewBoxSize, currentPos }: UseGpsMapPanZoomOptions) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [followCar, setFollowCar] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentViewBox = useMemo(() => {
    if (zoomLevel <= 1 && !followCar && panOffset.x === 0 && panOffset.y === 0) {
      return `0 0 ${viewBoxSize} ${viewBoxSize}`;
    }
    const visibleSize = viewBoxSize / zoomLevel;
    const centerX = (followCar && currentPos ? currentPos.sx : viewBoxSize / 2) + panOffset.x;
    const centerY = (followCar && currentPos ? currentPos.sy : viewBoxSize / 2) + panOffset.y;
    const vx = Math.max(-500, Math.min(1300, centerX - visibleSize / 2));
    const vy = Math.max(-500, Math.min(1300, centerY - visibleSize / 2));
    return `${vx.toFixed(1)} ${vy.toFixed(1)} ${visibleSize.toFixed(1)} ${visibleSize.toFixed(1)}`;
  }, [zoomLevel, followCar, currentPos, panOffset, viewBoxSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        setZoomLevel(z => Math.min(6, Number((z + 0.5).toFixed(1))));
      } else {
        setZoomLevel(z => {
          const next = Math.max(1, Number((z - 0.5).toFixed(1)));
          if (next === 1) setPanOffset({ x: 0, y: 0 });
          return next;
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1 && !followCar) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const factor = (viewBoxSize / 800) / zoomLevel;
    setPanOffset({
      x: dragStartRef.current.panX - (e.clientX - dragStartRef.current.x) * factor,
      y: dragStartRef.current.panY - (e.clientY - dragStartRef.current.y) * factor,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const resetPanZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setFollowCar(false);
  };

  const zoomIn = () => setZoomLevel(z => Math.min(6, Number((z + 0.5).toFixed(1))));
  const zoomOut = () =>
    setZoomLevel(z => {
      const next = Math.max(1, Number((z - 0.5).toFixed(1)));
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });

  return {
    zoomLevel,
    setZoomLevel,
    panOffset,
    setPanOffset,
    followCar,
    setFollowCar,
    containerRef,
    currentViewBox,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetPanZoom,
    zoomIn,
    zoomOut,
  };
}
