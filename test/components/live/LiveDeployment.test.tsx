import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LivePage } from '../../../src/components/live/LivePage.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import type { LiveDeployment } from '../../../shared/types/liveStrategy.js';
import { deploymentReadout } from '../../../src/components/live/race/deploymentReadout.js';
import { FakeEventSource } from '../../helpers/fakeEventSource.js';
import { liveLap, liveSession, liveSnapshot, liveStrategy } from '../../helpers/liveSnapshot.js';

const source = () => FakeEventSource.byUrl('/api/live/stream');
const send = (value: LiveSnapshot) => act(() => source().emit('snapshot', value));

const DEPLOYMENT: LiveDeployment = { unit: 'kW', current: 60, target: 40, next: null, changeSeconds: null, settlingLaps: 0, chargePercent: 8, changePerLap: -5.4, edge: 20, edgeSeconds: 95 };
const LAPS = [liveLap(3, 122.202, [37.366, 45.208, 39.628]), liveLap(4, 122.206, [37.404, 45.234, 39.568])];
const withRatio = () => liveStrategy({ fuelRatio: { recommended: 0.95, mfdSetting: 0.9, source: 'measured', pairedLaps: 5, garageSetting: null, excessLitres: null, fuelBiasLaps: null } });

describe('deployment readout', () => {
  it('formats kW and map advice, hold, settling, the next setting, the time to the edge and missing data', () => {
    expect(deploymentReadout(DEPLOYMENT)).toMatchObject({ label: 'DEPLOYMENT', value: '-20', unit: 'kW', tone: 'warn', note: '60 → 40 kW', detail: 'BATT 8% · 20% IN 1:35' });
    expect(deploymentReadout({ ...DEPLOYMENT, edgeSeconds: 0 }).detail).toBe('BATT 8% · 20% NOW');
    expect(deploymentReadout({ ...DEPLOYMENT, edge: 80, edgeSeconds: 59.6 }).detail).toBe('BATT 8% · 80% IN 1:00');
    expect(deploymentReadout({ ...DEPLOYMENT, edgeSeconds: 4000 }).detail).toBe('BATT 8% · 20% IN 60:00+');
    expect(deploymentReadout({ ...DEPLOYMENT, unit: 'map', current: 6, target: 5 })).toMatchObject({ value: '-1', unit: 'MAP', note: 'MAP 6 → 5' });
    expect(deploymentReadout({ ...DEPLOYMENT, target: 60, next: 40, changeSeconds: 300 })).toMatchObject({ value: 'HOLD', tone: 'gain', note: '40 kW IN 5:00' });
    expect(deploymentReadout({ ...DEPLOYMENT, target: 60 })).toMatchObject({ value: 'HOLD', note: 'AT 60 kW' });
    expect(deploymentReadout({ ...DEPLOYMENT, target: 40, settlingLaps: 1, current: 40 })).toMatchObject({ tone: 'muted', note: '40 kW SET', detail: 'BATT 8% · CHECK IN 1 LAP' });
    const measuring = { target: null, changePerLap: null, edge: null, edgeSeconds: null };
    expect(deploymentReadout({ ...DEPLOYMENT, ...measuring })).toMatchObject({ value: '—', note: 'CURRENT 60 kW', detail: 'BATT 8% · MEASURING' });
    expect(deploymentReadout({ ...DEPLOYMENT, ...measuring, current: null, chargePercent: null })).toMatchObject({ note: 'NO BATTERY DATA', detail: undefined });
  });
});

describe('deployment in the driving views', () => {
  beforeEach(() => {
    FakeEventSource.install();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('replaces the mid-stint fuel ratio column in a race and moves the ratio to the next stop', () => {
    render(<LivePage />);
    send(liveSnapshot({ recentLaps: LAPS, strategy: { ...withRatio(), deployment: DEPLOYMENT } }));
    expect(screen.getByTestId('live-race-cell-3')).toHaveTextContent('DEPLOYMENT');
    expect(screen.getByTestId('live-race-cell-3')).toHaveTextContent('60 → 40 kW');
    expect(screen.queryByText('FUEL RATIO')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-race-cell-1')).toHaveTextContent('MFD · RATIO 0.95');
  });

  it('leaves the race plan unchanged without a deployment', () => {
    render(<LivePage />);
    send(liveSnapshot({ recentLaps: LAPS, strategy: withRatio() }));
    expect(screen.getByTestId('live-race-cell-3')).toHaveTextContent('FUEL RATIO');
    expect(screen.queryByText('DEPLOYMENT')).not.toBeInTheDocument();
  });

  it('shows it under the timing in practice, and nothing without it', () => {
    render(<LivePage />);
    send(liveSnapshot({ session: liveSession({ kind: 'practice' }), recentLaps: LAPS, strategy: liveStrategy({ deployment: DEPLOYMENT }) }));
    const block = screen.getByTestId('live-practice-deployment');
    expect(block).toHaveTextContent('DEPLOYMENT');
    expect(block).toHaveTextContent('-20kW');
    expect(block).toHaveTextContent('60 → 40 kW');
    expect(block).toHaveTextContent('BATT 8% · 20% IN 1:35');
    send(liveSnapshot({ sequence: 2, session: liveSession({ kind: 'practice' }), recentLaps: LAPS, strategy: liveStrategy() }));
    expect(screen.queryByTestId('live-practice-deployment')).not.toBeInTheDocument();
  });

  it('is the third block in qualifying, beside the delta and the laps left', () => {
    render(<LivePage />);
    send(liveSnapshot({ session: liveSession({ kind: 'qualifying' }), recentLaps: LAPS, strategy: liveStrategy({ deployment: DEPLOYMENT }) }));
    expect(screen.getByTestId('live-quali-laps-left')).toBeInTheDocument();
    expect(screen.getByTestId('live-practice-deployment')).toHaveTextContent('60 → 40 kW');
  });
});
