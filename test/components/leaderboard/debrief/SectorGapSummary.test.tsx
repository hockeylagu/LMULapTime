import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectorGapSummary, worstSector } from '../../../../src/components/leaderboard/debrief/SectorGapSummary.js';

const yours = { s1: 30, s2: 40, s3: 30 };
const theirs = { s1: 30.05, s2: 39.9, s3: 29.75 };

describe('SectorGapSummary', () => {
  it('says how much the best sectors close and where most of the gap is', () => {
    render(<SectorGapSummary gap={0.3} theoreticalBest={99.8} theoreticalGap={0.1} yours={yours} theirs={theirs} />);
    expect(screen.getByText(/Your best sectors close/)).toHaveTextContent(
      'Your best sectors close 0.200 of the 0.300 s: the rest is new pace. Most of it is in S3 (+0.250).'
    );
  });

  it('says so when the best sectors already beat their lap', () => {
    render(<SectorGapSummary gap={0.3} theoreticalBest={99.58} theoreticalGap={-0.12} yours={yours} theirs={theirs} theirLabel="your rival" />);
    expect(screen.getByText(/already driven it/)).toHaveTextContent('0.120 s under your rival');
  });

  it('shows nothing when your lap is faster in every sector', () => {
    const { container } = render(<SectorGapSummary gap={-0.3} theoreticalBest={null} theoreticalGap={null} yours={theirs} theirs={{ s1: 31, s2: 41, s3: 31 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('worstSector', () => {
  it('finds the sector losing the most, or none', () => {
    expect(worstSector(yours, theirs)).toEqual({ label: 'S3', gap: expect.closeTo(0.25, 5) });
    expect(worstSector(theirs, { s1: 31, s2: 41, s3: 31 })).toBeNull();
    expect(worstSector(yours, null)).toBeNull();
  });
});
