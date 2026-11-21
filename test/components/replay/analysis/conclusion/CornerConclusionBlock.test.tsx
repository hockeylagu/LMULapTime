import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import { CornerConclusionBlock } from '../../../../../src/components/replay/analysis/conclusion/CornerConclusionBlock.js';
import { mockWatchServer } from '../../../session-detail/debrief/debriefFixtures.js';

// The player's lap 20 (stored lap 3) of the fixture session; corner 2 of its lap view is T1–T2.
const lap = {
  replayName: 'Test.Vcr', sessionId: 'R1', driverOrdinal: 0, lapOrdinal: 3, currentLap: 20, layoutKey: 'test_gp',
  vehicleIdentity: { carClass: 'Hyper', carType: 'Car A' }, pointsCount: 0, points: [],
  bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
} as ReplayTrajectoryData;

describe('CornerConclusionBlock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the session's habit alone without a baseline lap", async () => {
    mockWatchServer();
    render(<CornerConclusionBlock trajectory={lap} baseline={null} cornerNumber={2} />);
    expect(await screen.findByTestId('corner-conclusion')).toHaveTextContent('Carry 4 km/h more through T2');
    expect(screen.getByTestId('corner-conclusion-lap')).toHaveTextContent('+0.30 s');
    expect(screen.queryByTestId('lap-difference')).not.toBeInTheDocument();
  });

  it('puts what differs from the baseline lap above the habit, each with its own answer', async () => {
    // The fixture server has no passes for the laps: the lap part says why, the habit still shows.
    mockWatchServer();
    render(<CornerConclusionBlock trajectory={lap} baseline={{ ...lap, driverOrdinal: 2, currentLap: 7 }} cornerNumber={2} />);
    const why = await screen.findByText('Not found');
    const habit = await screen.findByTestId('corner-conclusion');
    expect(why.compareDocumentPosition(habit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
