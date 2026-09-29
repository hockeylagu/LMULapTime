import React, { useEffect, useRef } from 'react';
import type { LeaderboardLayout } from '../../../../shared/types/leaderboard.js';
import { TrackRibbonCard } from './TrackRibbonCard.js';

export interface TrackRibbonProps {
  layouts: LeaderboardLayout[];
  selectedLayoutKey: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (layout: LeaderboardLayout) => void;
}

/** The layouts the player drove, newest first, as a horizontal strip of cards. */
export const TrackRibbon: React.FC<TrackRibbonProps> = ({ layouts, selectedLayoutKey, loading, error, onSelect }) => {
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the selected card in view when the selection comes from the URL. Only the strip scrolls:
  // scrollIntoView would scroll the page too.
  useEffect(() => {
    const strip = stripRef.current;
    const card = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !card) return;
    const left = card.offsetLeft; // the strip is the offset parent (relative)
    if (left < strip.scrollLeft || left + card.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = Math.max(0, left - 8);
    }
  }, [selectedLayoutKey, layouts]);

  if (error) {
    return (
      <p role="alert" className="px-4 py-3 rounded-xl border border-lmu-loss-strong/30 bg-lmu-loss-strong/10 text-sm text-lmu-loss-soft">
        {error}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden" aria-label="Loading your tracks">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="shrink-0 w-56 h-[124px] rounded-xl border border-lmu-border bg-lmu-bg/60 animate-pulse" />
        ))}
      </div>
    );
  }

  if (layouts.length === 0) {
    return (
      <p className="px-4 py-6 rounded-xl border border-lmu-border bg-lmu-bg/60 text-sm text-lmu-muted text-center">
        No laps yet. Drive a session and your tracks will appear here.
      </p>
    );
  }

  return (
    <div
      ref={stripRef}
      role="toolbar"
      aria-label="Your tracks"
      className="relative flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
    >
      {layouts.map((layout) => (
        <TrackRibbonCard
          key={layout.layoutKey}
          layout={layout}
          selected={layout.layoutKey === selectedLayoutKey}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};
