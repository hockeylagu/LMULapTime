import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LiveDemoPage from '../../../../src/components/live/demo/LiveDemoPage.js';
import { createDemoState } from '../../../../src/components/live/demo/demoScenarios.js';
import { deploymentReadout } from '../../../../src/components/live/race/deploymentReadout.js';
import { racePlanView } from '../../../../src/components/live/race/raceAction.js';

const deployment = (id: string, carClass = 'Hyper') => createDemoState(id, carClass).snapshot?.strategy?.deployment ?? null;

describe('demo deployment advice', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });

  it('shows the advice in the real race view when the Hypercar class is selected', () => {
    window.location.hash = '#/live?demo=1&scenario=race&carClass=Hyper';
    render(<LiveDemoPage />);
    const cell = screen.getByTestId('live-race-cell-3');
    expect(cell).toHaveTextContent('DEPLOYMENT');
    expect(cell).toHaveTextContent('60 kW IN 5:00');
    expect(cell).toHaveTextContent('BATT 62% · 80% IN 7:00');
    expect(screen.queryByText('FUEL RATIO')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-race-cell-1')).toHaveTextContent('MFD · RATIO 0.95');
    // Without a battery (any other class) the plan is unchanged.
    expect(racePlanView(createDemoState('race', 'GT3').snapshot!).cells[2]?.label).toBe('FUEL RATIO');
  });

  it('advises a Hypercar on track in races, practice and qualifying only, through the real readout', () => {
    expect(deploymentReadout(deployment('race')!)).toMatchObject({ value: 'HOLD', note: '60 kW IN 5:00', detail: 'BATT 62% · 80% IN 7:00' });
    expect(deployment('practice')).not.toBeNull();
    expect(deployment('qualifying')).not.toBeNull();
    expect(deployment('race', 'GT3')).toBeNull();
    expect(deployment('tyre-strategy-quali')).toBeNull();
  });

  it('shows the advised change in its own scenario, in kW from the plugin list', () => {
    expect(deploymentReadout(deployment('deployment-change')!)).toMatchObject({ value: '+20', unit: 'kW', tone: 'warn', note: '40 → 60 kW', detail: 'BATT 64% · 80% IN 1:30' });
    expect(deployment('deployment-change', 'GT3')).toBeNull();
  });

  it('keeps the ratio with the refuel setup as the next pit approaches', () => {
    window.location.hash = '#/live?demo=1&scenario=pit-one&carClass=Hyper';
    render(<LiveDemoPage />);
    expect(screen.queryByText('DEPLOYMENT')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-race-cell-1')).toHaveTextContent('VE · MFD');
    expect(screen.getByTestId('live-race-cell-1')).toHaveTextContent('RATIO 0.95');
  });
});
