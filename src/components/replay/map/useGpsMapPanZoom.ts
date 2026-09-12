import { useState, useRef, useEffect, useMemo } from 'react';

export interface UseGpsMapPanZoomOptions {
  viewBoxSize: number;
  currentPos?: { sx: number; sy: number };
}

const MAX_ZOOM = 100;

function getNextZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) {
    const step = current >= 30 ? 10 : current >= 15 ? 5 : current >= 7.5 ? 2.5 : current >= 3 ? 1.5 : 1;
    return Math.min(MAX_ZOOM, Number((current + step).toFixed(1)));
  } else {
    const step = current > 30 ? 10 : current > 15 ? 5 : current > 7.5 ? 2.5 : current > 3 ? 1.5 : 1;
    return Math.max(1, Number((current - step).toFixed(1)));
  }
}

export const BASE_ZOOM = 1.5;

export function useGpsMapPanZoom({ viewBoxSize, currentPos }: UseGpsMapPanZoomOptions) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [followCar, setFollowCar] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number; factor: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
    factor: 1,
  });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const zoomLevelRef = useRef<number>(zoomLevel);
  zoomLevelRef.current = zoomLevel;
  const panOffsetRef = useRef<{ x: number; y: number }>(panOffset);
  panOffsetRef.current = panOffset;
  const followCarRef = useRef<boolean>(followCar);
  followCarRef.current = followCar;
  const currentPosRef = useRef<{ sx: number; sy: number } | undefined>(currentPos);
  currentPosRef.current = currentPos;

  const handleSetFollowCar: React.Dispatch<React.SetStateAction<boolean>> = valueOrUpdater => {
    setFollowCar(prev => {
      const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
      if (next) {
        panOffsetRef.current = { x: 0, y: 0 };
        setPanOffset({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const currentViewBox = useMemo(() => {
    const effectiveZoom = zoomLevel * BASE_ZOOM;
    const visibleSize = viewBoxSize / effectiveZoom;
    const centerX = followCar && currentPos ? currentPos.sx : viewBoxSize / 2 + panOffset.x;
    const centerY = followCar && currentPos ? currentPos.sy : viewBoxSize / 2 + panOffset.y;
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

      const currentZoom = zoomLevelRef.current;
      const nextZoom = getNextZoom(currentZoom, e.deltaY < 0 ? 1 : -1);
      if (nextZoom === currentZoom) return;

      if (nextZoom === 1) {
        zoomLevelRef.current = 1;
        panOffsetRef.current = { x: 0, y: 0 };
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
        return;
      }

      // If in follow-car mode, wheel zoom stays centered on the car and preserves followCar
      if (followCarRef.current && currentPosRef.current) {
        zoomLevelRef.current = nextZoom;
        setZoomLevel(nextZoom);
        return;
      }

      const rect = el.getBoundingClientRect();
      const W = rect.width || 800;
      const H = rect.height || 800;
      const renderedSize = Math.min(W, H);
      const offsetDomX = (W - renderedSize) / 2;
      const offsetDomY = (H - renderedSize) / 2;

      const effectiveOld = currentZoom * BASE_ZOOM;
      const visibleOld = viewBoxSize / effectiveOld;
      const currentCenterX = (followCarRef.current && currentPosRef.current ? currentPosRef.current.sx : viewBoxSize / 2) + panOffsetRef.current.x;
      const currentCenterY = (followCarRef.current && currentPosRef.current ? currentPosRef.current.sy : viewBoxSize / 2) + panOffsetRef.current.y;
      const vxOld = currentCenterX - visibleOld / 2;
      const vyOld = currentCenterY - visibleOld / 2;

      // Clamp cursor position to rendered SVG box to avoid jumping if cursor is in letterbox margins
      const clampedX = Math.max(offsetDomX, Math.min(offsetDomX + renderedSize, e.clientX - rect.left));
      const clampedY = Math.max(offsetDomY, Math.min(offsetDomY + renderedSize, e.clientY - rect.top));
      const cursorRelX = clampedX - offsetDomX;
      const cursorRelY = clampedY - offsetDomY;

      const scaleOld = renderedSize / visibleOld;
      const pointSvgX = vxOld + cursorRelX / scaleOld;
      const pointSvgY = vyOld + cursorRelY / scaleOld;

      const effectiveNew = nextZoom * BASE_ZOOM;
      const visibleNew = viewBoxSize / effectiveNew;
      const scaleNew = renderedSize / visibleNew;

      const vxNew = pointSvgX - cursorRelX / scaleNew;
      const vyNew = pointSvgY - cursorRelY / scaleNew;

      const centerXNew = vxNew + visibleNew / 2;
      const centerYNew = vyNew + visibleNew / 2;

      // Anchor relative to standard viewBox center because zooming disables car lock
      const newPanX = Math.max(-1000, Math.min(1000, Number((centerXNew - viewBoxSize / 2).toFixed(1))));
      const newPanY = Math.max(-1000, Math.min(1000, Number((centerYNew - viewBoxSize / 2).toFixed(1))));

      zoomLevelRef.current = nextZoom;
      panOffsetRef.current = { x: newPanX, y: newPanY };

      setZoomLevel(nextZoom);
      setPanOffset({ x: newPanX, y: newPanY });
      if (followCarRef.current) setFollowCar(false);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewBoxSize]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    const renderedSize = Math.min(rect?.width || 800, rect?.height || 800);
    const visibleSize = viewBoxSize / (zoomLevelRef.current * BASE_ZOOM);
    const factor = visibleSize / (renderedSize || 800);

    let startPanX = panOffsetRef.current.x;
    let startPanY = panOffsetRef.current.y;
    if (followCarRef.current && currentPosRef.current) {
      startPanX = currentPosRef.current.sx + startPanX - viewBoxSize / 2;
      startPanY = currentPosRef.current.sy + startPanY - viewBoxSize / 2;
      followCarRef.current = false;
      setFollowCar(false);
      panOffsetRef.current = { x: startPanX, y: startPanY };
      setPanOffset({ x: startPanX, y: startPanY });
    }

    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: startPanX, panY: startPanY, factor };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const { panX, panY, x, y, factor } = dragStartRef.current;
    const newPanX = panX - (e.clientX - x) * factor;
    const newPanY = panY - (e.clientY - y) * factor;
    panOffsetRef.current = { x: newPanX, y: newPanY };
    setPanOffset({ x: newPanX, y: newPanY });
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

  const focusOnPoint = (targetX: number, targetY: number, targetZoom = 4.5) => {
    const newPanX = Math.max(-1000, Math.min(1000, Number((targetX - viewBoxSize / 2).toFixed(1))));
    const newPanY = Math.max(-1000, Math.min(1000, Number((targetY - viewBoxSize / 2).toFixed(1))));
    zoomLevelRef.current = targetZoom;
    panOffsetRef.current = { x: newPanX, y: newPanY };
    setZoomLevel(targetZoom);
    setPanOffset({ x: newPanX, y: newPanY });
    setFollowCar(false);
  };

  const zoomIn = () => setZoomLevel(z => getNextZoom(z, 1));
  const zoomOut = () =>
    setZoomLevel(z => {
      const next = getNextZoom(z, -1);
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });

  return {
    zoomLevel,
    setZoomLevel,
    panOffset,
    setPanOffset,
    followCar,
    setFollowCar: handleSetFollowCar,
    containerRef,
    currentViewBox,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetPanZoom,
    focusOnPoint,
    zoomIn,
    zoomOut,
  };
}
