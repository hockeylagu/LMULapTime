import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionHabitSection } from '../../../../../src/components/replay/analysis/conclusion/SessionHabitSection.js';
import { analysis, mockWatchServer } from '../../../session-detail/debrief/debriefFixtures.js';

// The fixture layout numbers corner 3 first, then 5 (T1–T2), then 9 (T4); the player is driver 0.
const shown = (props: Partial<React.ComponentProps<typeof SessionHabitSection>> = {}) =>
  render(<SessionHabitSection sessionId="R1" driverOrdinal={0} lapOrdinal={3} cornerNumber={2} {...props} />);

describe('SessionHabitSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the session's habit at the corner against the target and what the shown lap lost there", async () => {
    mockWatchServer();
    shown();
    expect(screen.getByRole('status')).toHaveTextContent('Reading the session');
    const block = await screen.findByTestId('corner-conclusion');
    expect(block).toHaveTextContent('Your session vs target');
    expect(block).toHaveTextContent('Focus corner');
    expect(block).toHaveTextContent('+0.20 s/lap');
    expect(block).toHaveTextContent('Carry 4 km/h more through T2');
    expect(block).toHaveTextContent('Try: Get closer to the inside at the apex·Apex 96 → 100 km/h');
    expect(block).toHaveTextContent('tighter arc: 80 m radius against 87 m');
    expect(block).toHaveTextContent('Also measured: braking 0.4 s longer · 0.2 s more coasting');
    expect(block).toHaveTextContent('Over-slowing · 100% of laps');
    expect(screen.getByText('Over-slowing')).toHaveAttribute('title', expect.stringContaining("under the target's"));
    expect(screen.getByTestId('corner-conclusion-lap')).toHaveTextContent('This lap +0.30 s vs. your usual at T2 · a slow exit');
  });

  it('follows the corner picked, and says when no habit is named there', async () => {
    mockWatchServer(200, { ...analysis, habits: [], unexplained: [] });
    shown({ cornerNumber: 3, lapOrdinal: 1 });
    const block = await screen.findByTestId('corner-conclusion');
    expect(block).toHaveTextContent('+0.10 s/lap');
    expect(block).toHaveTextContent('No habit named here this session.');
    expect(screen.queryByTestId('corner-conclusion-lap')).not.toBeInTheDocument();
  });

  it("says nothing on another driver's lap, at a corner the analysis does not hold, or without a session", async () => {
    const fetchMock = mockWatchServer();
    const other = shown({ driverOrdinal: 1 });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(other.container).toBeEmptyDOMElement();
    other.unmount();

    const unknown = shown({ cornerNumber: 1 });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(unknown.container).toBeEmptyDOMElement();
    unknown.unmount();

    fetchMock.mockClear();
    expect(shown({ sessionId: undefined }).container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the session has no analysis, and shows why a read failed', async () => {
    mockWatchServer(404);
    const missing = shown();
    expect(await screen.findByText(/No corner analysis for this session/)).toBeInTheDocument();
    missing.unmount();

    mockWatchServer(503);
    shown();
    expect(await screen.findByRole('alert')).toHaveTextContent('Session summaries are rebuilding');
  });
});
