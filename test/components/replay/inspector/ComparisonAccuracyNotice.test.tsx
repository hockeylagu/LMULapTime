import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComparisonAccuracyNotice, describeComparisonCaveats } from '../../../../src/components/replay/inspector/ComparisonAccuracyNotice';
import { ReplayTrajectoryData } from '../../../../shared/types/index.js';

const lap = (overrides: Partial<ReplayTrajectoryData> = {}): ReplayTrajectoryData => ({
  replayName: 'Test.Vcr',
  pointsCount: 0,
  points: [],
  bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
  stationSource: 'track',
  lineCut: { start: 'line', end: 'line' },
  ...overrides,
});

describe('describeComparisonCaveats', () => {
  it('says nothing about two laps cut at the line on a mapped track', () => {
    expect(describeComparisonCaveats(lap(), lap())).toEqual([]);
  });

  it('says nothing outside comparison mode', () => {
    expect(describeComparisonCaveats(lap({ stationSource: 'odometer' }), null)).toEqual([]);
  });

  it('warns once when either lap has no track map', () => {
    const caveats = describeComparisonCaveats(lap(), lap({ stationSource: 'odometer', lineCut: { start: 'none', end: 'none' } }));
    expect(caveats).toHaveLength(1);
    expect(caveats[0]).toMatch(/no track map/);
  });

  it('names the lap and the end that is away from the line', () => {
    const caveats = describeComparisonCaveats(lap({ lineCut: { start: 'none', end: 'line' } }), lap({ lineCut: { start: 'line', end: 'none' } }));
    expect(caveats).toHaveLength(2);
    expect(caveats[0]).toMatch(/^This lap starts away from the start\/finish line/);
    expect(caveats[1]).toMatch(/^The comparison lap ends away from the start\/finish line/);
  });

  it('treats an end extended over the last few metres to the line as on the line', () => {
    expect(describeComparisonCaveats(lap({ lineCut: { start: 'extrapolated', end: 'extrapolated' } }), lap())).toEqual([]);
  });

  it('trusts laps from a server that sends no flags', () => {
    expect(describeComparisonCaveats(lap({ stationSource: undefined, lineCut: undefined }), lap())).toEqual([]);
  });
});

describe('ComparisonAccuracyNotice', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<ComparisonAccuracyNotice trajectory={lap()} baselineTrajectory={lap()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the caveats as a note', () => {
    render(<ComparisonAccuracyNotice trajectory={lap({ stationSource: 'odometer' })} baselineTrajectory={lap()} />);
    expect(screen.getByRole('note')).toHaveTextContent(/no track map/);
  });
});
