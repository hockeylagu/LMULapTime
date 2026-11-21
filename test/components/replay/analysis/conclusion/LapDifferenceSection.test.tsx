import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import type { CornerPass, SessionCornerPasses } from '../../../../../shared/types/corners/cornerPasses.js';
import { clearLayoutCornersCache } from '../../../../../src/api/cornerApi.js';
import { LapDifferenceSection } from '../../../../../src/components/replay/analysis/conclusion/LapDifferenceSection.js';
import { lapPass } from './lapPassFixtures.js';

const turn = (id: number, startM: number) => ({ id, label: `T${id + 1}`, title: '', apexM: startM + 100, startM, endM: startM + 200 });
const served = (passes: CornerPass[]): SessionCornerPasses => ({
  available: true, layoutKey: 'test_gp', startStationM: 0, trackLengthM: 5000, turns: [turn(0, 600), turn(1, 1600)], cars: [], passes, laps: [], contacts: [],
});
// The lap view's corners for the class: T2 alone starts the lap, then a sequence holding T1.
const layout = { kind: 'sequences', startStationM: 0, lengthM: 5000, corners: [{ ...turn(0, 600), sequence: { carClass: 'GT3', turnIds: [0] } }, turn(1, 100)] };

const lap = (sessionId: string, driverOrdinal: number, currentLap: number, carClass = 'GT3'): ReplayTrajectoryData => ({
  replayName: 'Test.Vcr', sessionId, driverOrdinal, lapOrdinal: 0, currentLap, layoutKey: 'test_gp',
  vehicleIdentity: { carClass, carType: 'Car A' }, pointsCount: 0, points: [],
  bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
});

/** Serves each session's passes (a string says why it has none) and the layout's corners. */
function mockServer(mine: SessionCornerPasses | string, theirs: SessionCornerPasses | string) {
  clearLayoutCornersCache();
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  const answer = (passes: SessionCornerPasses | string) => json(typeof passes === 'string' ? { available: false, reason: passes } : passes);
  const fetchMock = vi.fn((input: string) => {
    if (input.startsWith('/api/session/A/corner-passes?driverOrdinal=2')) return answer(mine);
    if (input.startsWith('/api/session/B/corner-passes?driverOrdinal=4')) return answer(theirs);
    if (input.startsWith('/api/corners?')) return json(layout);
    return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Lap 5 of driver 2 brakes 10 m earlier into T1 than lap 3 of driver 4; other laps in the answers are not read.
const mine = served([lapPass(0, 5, { brakeM: 690, toApex: 2.1, brakeSec: 1.3 }), lapPass(0, 6, { toApex: 3 }), lapPass(1, 5)]);
const theirs = served([lapPass(0, 3), lapPass(0, 4, { toApex: 1 }), lapPass(1, 3, { fromApex: 2.2 })]);

describe('LapDifferenceSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says what the shown lap did differently from its baseline through the corner picked', async () => {
    mockServer(mine, theirs);
    const view = render(<LapDifferenceSection trajectory={lap('A', 2, 5)} baseline={lap('B', 4, 3)} cornerNumber={2} />);
    expect(screen.getByRole('status')).toHaveTextContent("Reading the two laps' corner passes");
    const section = await screen.findByTestId('lap-difference');
    expect(section).toHaveTextContent('This lap vs baseline');
    expect(screen.getByTestId('lap-difference-line')).toHaveTextContent('+0.10 sinto T1 · This lap braked 10 m earlierAlso: braking 0.3 s longer');
    // The other corner of the lap view: the baseline is the slower lap there, a gain for the shown lap.
    view.rerender(<LapDifferenceSection trajectory={lap('A', 2, 5)} baseline={lap('B', 4, 3)} cornerNumber={1} />);
    expect(screen.getByTestId('lap-difference-line')).toHaveTextContent('−0.20 sout of T2 · The baseline lost time: nothing measured stands out');
  });

  it('says so when nothing differs, or when the corner was not measured on both laps', async () => {
    mockServer(served([lapPass(0, 5)]), served([lapPass(0, 3)]));
    const view = render(<LapDifferenceSection trajectory={lap('A', 2, 5)} baseline={lap('B', 4, 3)} cornerNumber={2} />);
    expect(await screen.findByText('No difference worth telling between the two laps here.')).toBeInTheDocument();
    view.rerender(<LapDifferenceSection trajectory={lap('A', 2, 5)} baseline={lap('B', 4, 3)} cornerNumber={1} />);
    expect(screen.getByText('This corner was not measured on both laps.')).toBeInTheDocument();
  });

  it('is absent without a baseline, and reads nothing for laps of two classes or without a session', () => {
    const fetchMock = mockServer(mine, theirs);
    expect(render(<LapDifferenceSection trajectory={lap('A', 2, 5)} baseline={null} cornerNumber={2} />).container).toBeEmptyDOMElement();
    render(<LapDifferenceSection trajectory={lap('A', 2, 5)} baseline={lap('B', 4, 3, 'LMP2')} cornerNumber={2} />);
    expect(screen.getByText('The two laps are in different classes: their difference is not explained.')).toBeInTheDocument();
    render(<LapDifferenceSection trajectory={lap('A', 2, 5)} baseline={{ ...lap('B', 4, 3), sessionId: undefined }} cornerNumber={2} />);
    expect(screen.getByText('Both laps need a session replay to be explained.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says why a lap has no passes, and shows a failed read', async () => {
    mockServer(mine, 'No corner passes built for this replay.');
    const view = render(<LapDifferenceSection trajectory={lap('A', 2, 5)} baseline={lap('B', 4, 3)} cornerNumber={2} />);
    expect(await screen.findByText('The baseline: No corner passes built for this replay.')).toBeInTheDocument();
    view.unmount();

    mockServer('This session has no replay.', theirs);
    const own = render(<LapDifferenceSection trajectory={lap('A', 2, 5)} baseline={lap('B', 4, 3)} cornerNumber={2} />);
    expect(await screen.findByText('This session has no replay.')).toBeInTheDocument();
    own.unmount();

    mockServer(mine, theirs);
    render(<LapDifferenceSection trajectory={lap('A', 9, 5)} baseline={lap('B', 4, 3)} cornerNumber={2} />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByText(/Not found|Could not read the corner passes/)).toBeInTheDocument();
  });
});
