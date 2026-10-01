import { useEffect, useState } from 'react';
import type { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import type { LeaderboardLap } from '../../../../shared/types/leaderboard.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { loadLeaderboard } from '../../../api/leaderboardApi.js';
import { isAbortError } from '../../../api/apiClient.js';

/** Personal best comes from the canonical same-layout/class board, never inferred from replay isBest. */
export function useReplayPersonalBest(metadata?: ReplayMetadata | null, trajectory?: ReplayTrajectoryData | null) {
  const driver = metadata?.drivers.find(entry => entry.slot === trajectory?.driverSlot);
  const layoutKey = trajectory?.layoutKey ? getCircuitSpecification(trajectory.layoutKey)?.layoutKey : undefined;
  const carClass = driver?.isPlayer ? resolveDriverCarClass(driver) : '';
  const key = layoutKey && carClass ? `${layoutKey}:${carClass}` : '';
  const [record, setRecord] = useState<{ key: string; lap: LeaderboardLap | null; error?: string } | null>(null);
  useEffect(() => {
    if (!layoutKey || !carClass) return;
    const controller = new AbortController();
    loadLeaderboard({ layoutKey, carClass }, controller.signal).then(board => {
      if (!controller.signal.aborted) setRecord({ key, lap: board.player?.bestLap ?? null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setRecord({ key, lap: null, error: error instanceof Error ? error.message : 'Personal best unavailable' });
      }
    });
    return () => controller.abort();
  }, [layoutKey, carClass, key]);
  const lap = record?.key === key ? record.lap : null;
  return {
    isPersonalBest: Boolean(driver?.isPlayer && lap && lap.replayName === trajectory?.replayName && lap.lapNum === trajectory?.currentLap),
    error: record?.key === key ? record.error : undefined,
  };
}
