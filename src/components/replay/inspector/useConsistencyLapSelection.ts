import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import type { LapConsistencyOption } from '../analysis/LapSelectorDropdown.js';

export interface ConsistencyLapSelection {
  availableConsistencyLaps: LapConsistencyOption[];
  excludedConsistencyLaps: Set<number>;
  toggleConsistencyLap: (lapNumber: number) => void;
}

/**
 * Which of the replay's laps the consistency stats use. Invalid laps and the laps the session
 * parser marked non-representative (contact, off pace) start excluded, once per replay and
 * driver; the driver can tick them back in.
 */
export function useConsistencyLapSelection(
  trajectory: ReplayTrajectoryData | null,
  metadata: ReplayMetadata | null,
  activeReplayName: string | null,
  selectedDriverSlot: number | null
): ConsistencyLapSelection {
  const [excludedConsistencyLaps, setExcludedConsistencyLaps] = useState<Set<number>>(new Set());

  const toggleConsistencyLap = (lapNumber: number) => {
    setExcludedConsistencyLaps(prev => {
      const next = new Set(prev);
      if (next.has(lapNumber)) next.delete(lapNumber);
      else next.add(lapNumber);
      return next;
    });
  };

  const availableConsistencyLaps = useMemo(() => {
    const laps = (trajectory?.laps || metadata?.laps || []).filter(l => l.lapTimeSec > 0);
    return laps
      .map(l => ({
        lapNumber: l.lapNumber,
        lapTimeSec: l.lapTimeSec,
        isValid: l.isValid !== false && !l.isOutlap,
        nonRepresentativeReason: l.nonRepresentativeReason,
      }))
      .sort((a, b) => a.lapNumber - b.lapNumber);
  }, [metadata, trajectory]);

  const initializedExclusionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeReplayName || availableConsistencyLaps.length === 0) return;
    const key = `${activeReplayName}|${selectedDriverSlot ?? 'x'}`;
    if (initializedExclusionKeyRef.current === key) return;
    initializedExclusionKeyRef.current = key;
    const excludedByDefault = availableConsistencyLaps
      .filter(l => !l.isValid || l.nonRepresentativeReason)
      .map(l => l.lapNumber);
    setExcludedConsistencyLaps(new Set(excludedByDefault));
  }, [activeReplayName, selectedDriverSlot, availableConsistencyLaps]);

  return { availableConsistencyLaps, excludedConsistencyLaps, toggleConsistencyLap };
}
