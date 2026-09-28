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

  // Keep the selected card in view when the selection comes from the URL.
  useEffect(() => {
    const card = stripRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    card?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selectedLayoutKey, layouts]);

  if (error) {
    return (
      <p role="alert" className="px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">
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
      className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
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
