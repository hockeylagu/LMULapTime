import React from 'react';
import { Zap } from 'lucide-react';
import { SummaryCard, RankedList } from './DashboardSummaryParts.js';
import { getPaceCategoryStyle } from '../../utils/paceCategoryStyles.js';
import { PaceCategory } from '../../../shared/types/index.js';

export interface BestRefLapInfo {
  sessionId?: string;
  percentage: number;
  category: PaceCategory;
  lapTimeString: string;
  track: string;
  car: string;
}

export interface BenchmarkLapsSummaryCardProps {
  rankedRefLaps: BestRefLapInfo[];
  visibleRefLaps: BestRefLapInfo[];
  showMoreBenchmarks: boolean;
  setShowMoreBenchmarks: (val: boolean | ((prev: boolean) => boolean)) => void;
  onSelectSession: (id: string) => void;
}

export const BenchmarkLapsSummaryCard: React.FC<BenchmarkLapsSummaryCardProps> = ({
  rankedRefLaps,
  visibleRefLaps,
  showMoreBenchmarks,
  setShowMoreBenchmarks,
  onSelectSession,
}) => (
  <SummaryCard
    icon={Zap}
    title="Best pace"
    footer={rankedRefLaps.length > 3 ? { expanded: showMoreBenchmarks, showAllLabel: `Show All ${rankedRefLaps.length} Benchmark Laps`, onToggle: () => setShowMoreBenchmarks(!showMoreBenchmarks) } : null}
  >
    <RankedList
      expanded={showMoreBenchmarks}
      empty="No benchmark lap data"
      items={visibleRefLaps.map(item => {
        const pace = getPaceCategoryStyle(item.category);
        const sessionId = item.sessionId;
        return {
          key: item.sessionId || item.track,
          name: item.track,
          detail: `${item.car} · ${item.lapTimeString}`,
          value: `${item.percentage.toFixed(1)}%`,
          marker: { className: pace.textClass, label: pace.label },
          title: `Open session details for ${item.track}`,
          onSelect: sessionId ? () => onSelectSession(sessionId) : undefined,
        };
      })}
    />
  </SummaryCard>
);
