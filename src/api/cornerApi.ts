import type { LayoutCorners } from '../../shared/types/corners/cornerPasses.js';
import type { SequenceMapsResponse } from '../../shared/types/corners/sequenceMaps.js';
import type { CornerTrendsResponse } from '../../shared/types/corners/cornerTrends.js';
import type { SessionCornerAnalysis } from '../../shared/types/corners/cornerAnalysis.js';
import type { HabitFocusPin } from '../../shared/types/corners/habitFocus.js';
import { fetchJson, postJson } from './apiClient.js';

export function fetchSequenceMaps(signal?: AbortSignal): Promise<SequenceMapsResponse> {
  return fetchJson('/api/corner-sequences/maps', { signal });
}

/** The driver's time through each corner of a layout, session after session, for a class (and car model). */
export function fetchCornerTrends(layoutKey: string, carClass: string, carType: string, signal?: AbortSignal): Promise<CornerTrendsResponse> {
  const query = new URLSearchParams({ layoutKey, carClass, ...(carType ? { carType } : {}) });
  return fetchJson(`/api/corner-trends?${query.toString()}`, { signal });
}

/** The session player's corner habits and mistakes (the corner analysis engine, from the stored passes). */
export function fetchSessionCornerAnalysis(sessionId: string, signal?: AbortSignal): Promise<SessionCornerAnalysis> {
  return fetchJson(`/api/session/${encodeURIComponent(sessionId)}/corner-analysis`, { signal });
}

/** A layout's corners for a class: its sequences, else the official turns (any lap's corner windows). */
export function fetchLayoutCorners(layoutKey: string, carClass: string, signal?: AbortSignal): Promise<LayoutCorners> {
  const query = new URLSearchParams({ layoutKey, carClass });
  return fetchJson(`/api/corners?${query.toString()}`, { signal });
}

// A layout's corners for a class change only when a map is (re)built: one fetch per layout and class until a scan
// (which may grow a map) or a regeneration finishes.
const layoutCornersCache = new Map<string, Promise<LayoutCorners | null>>();

/**
 * `fetchLayoutCorners`, once per layout and class: null when there are none (no centre line, or the server
 * unreachable): the lap then has no corners.
 */
export function loadLayoutCorners(layoutKey: string, carClass: string): Promise<LayoutCorners | null> {
  const key = `${layoutKey}|${carClass}`;
  let pending = layoutCornersCache.get(key);
  if (!pending) {
    // A failed fetch is not kept: the next lap asks again (the server may still be starting).
    pending = fetchLayoutCorners(layoutKey, carClass).catch(() => {
      layoutCornersCache.delete(key);
      return null;
    });
    layoutCornersCache.set(key, pending);
  }
  return pending;
}

/** Forgets the fetched corners: a map may have changed. */
export function clearLayoutCornersCache(): void {
  layoutCornersCache.clear();
}

// What else keeps answers built on the maps (the corner card's kept sequence passes).
const mapListeners = new Set<() => void>();

/** Runs `forget` whenever the maps may have changed; returns the unsubscribe. */
export function onSequenceMapsChanged(forget: () => void): () => void {
  mapListeners.add(forget);
  return () => { mapListeners.delete(forget); };
}

/** A scan or a regeneration finished: every answer built on the maps is asked for again. */
export function sequenceMapsChanged(): void {
  clearLayoutCornersCache();
  mapListeners.forEach(forget => forget());
}

/** Rebuilds a map from the class's fastest laps now, then its layout's sequence passes (in the background). */
export function regenerateSequenceMap(layoutKey: string, carClass: string): Promise<{ regenerating: string }> {
  return postJson('/api/corner-sequences/maps/regenerate', { layoutKey, carClass });
}

/** Makes the corner holding the turn a focus until unpinned; refused ("Unpin one first") when 2 are pinned. */
export function pinHabitFocus(pin: HabitFocusPin): Promise<{ pinned: boolean }> {
  return postJson('/api/habit-focus/pin', pin);
}

/** Hands the corner's focus slot back to the rules. */
export function unpinHabitFocus(pin: HabitFocusPin): Promise<{ pinned: boolean }> {
  return postJson('/api/habit-focus/unpin', pin);
}
