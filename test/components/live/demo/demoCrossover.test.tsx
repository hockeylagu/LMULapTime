import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LiveDemoPage from '../../../../src/components/live/demo/LiveDemoPage.js';
import { createDemoState } from '../../../../src/components/live/demo/demoScenarios.js';
import { racePlanView } from '../../../../src/components/live/race/raceAction.js';

describe('demo tyre crossover', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  it('renders the urgent wet stop and red MFD mismatch in the real page', () => {
    window.location.hash = '#/live?demo=1&scenario=crossover-wets';
    render(<LiveDemoPage />);
    expect(screen.getByTestId('live-race-cell-2')).toHaveTextContent('SET NEW WET');
    expect(racePlanView(createDemoState('crossover-wets').snapshot!).cells[1].tone).toBe('loss');
  });
  it('merges slicks into the planned stop and leaves the wet scenario unchanged', () => {
    const snapshot = createDemoState('crossover-slicks').snapshot!;
    expect(snapshot.strategy?.crossover).toMatchObject({ action: 'slicks', when: 'planned-stop' });
    expect(racePlanView(snapshot).cells[1].detail).toBe('TRACK DRY · AT THE STOP');
    expect(createDemoState('wet').snapshot!.strategy?.crossover ?? null).toBeNull();
  });
});
