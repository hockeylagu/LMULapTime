import { useState } from 'react';
import { readMapLayers, MAP_LAYERS_STORAGE_KEY, type MapLayers } from './mapLayers.js';

export function useMapLayers() {
  const [layers, setLayers] = useState(readMapLayers);
  const changeLayers = (next: MapLayers) => {
    try { localStorage.setItem(MAP_LAYERS_STORAGE_KEY, JSON.stringify(next)); } catch { /* Optional preference storage. */ }
    setLayers(next);
  };
  return { layers, changeLayers };
}

export function projectedPointBounds(points: Array<{ sx: number; sy: number }>) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx);
    minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy);
  }
  return { minX, minY, maxX, maxY };
}
