import React, { useState, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { SummaryCard, UnitToggle, RankedList, shareOf } from './DashboardSummaryParts.js';

export interface CircuitsSummaryCardProps {
  rankedTracks: { track: string; laps: number; km: number }[];
  visibleTracks?: { track: string; laps: number; km: number }[];
  showMoreTracks: boolean;
  setShowMoreTracks: (val: boolean | ((prev: boolean) => boolean)) => void;
  selectedCarClass?: string;
}

export const CircuitsSummaryCard: React.FC<CircuitsSummaryCardProps> = ({
  rankedTracks,
  visibleTracks,
  showMoreTracks,
  setShowMoreTracks,
  selectedCarClass = 'All',
}) => {
  const [unit, setUnit] = useState<'laps' | 'km'>('laps');

  const sourceTracks = rankedTracks && rankedTracks.length > 0 ? rankedTracks : (visibleTracks || []);

  const sortedTracks = useMemo(() => {
    return [...sourceTracks].sort((a, b) => (unit === 'km' ? b.km - a.km : b.laps - a.laps));
  }, [sourceTracks, unit]);

  const total = sourceTracks.reduce((sum, item) => sum + (unit === 'km' ? item.km : item.laps), 0);
  const displayTracks = showMoreTracks ? sortedTracks : sortedTracks.slice(0, 3);
  const suffix = selectedCarClass !== 'All' ? `?carClass=${encodeURIComponent(selectedCarClass)}` : '';

  return (
    <SummaryCard
      icon={MapPin}
      title="Circuits"
      action={<UnitToggle unit={unit} onChange={setUnit} />}
      footer={sourceTracks.length > 3 ? { expanded: showMoreTracks, showAllLabel: `Show All ${sourceTracks.length} Circuits`, onToggle: () => setShowMoreTracks(!showMoreTracks) } : null}
    >
      <RankedList
        expanded={showMoreTracks}
        empty="No track data"
        items={displayTracks.map((item, i) => ({
          key: item.track,
          name: item.track,
          value: unit === 'km' ? Math.round(item.km).toLocaleString() : item.laps.toLocaleString(),
          unit: unit === 'km' ? 'km' : 'laps',
          detail: i === 0 ? shareOf(unit === 'km' ? item.km : item.laps, total, unit === 'km' ? 'distance' : 'laps') : undefined,
          title: `View ${item.track} Track Details`,
          to: `/track/${encodeURIComponent(item.track)}${suffix}`,
        }))}
      />
    </SummaryCard>
  );
};
