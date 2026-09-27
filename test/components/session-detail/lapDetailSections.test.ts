import { describe, expect, it } from 'vitest';
import { lapDetailSections, lapEventsTooltip } from '../../../src/components/session-detail/table/lapDetailSections.js';
import type { LapData } from '../../../shared/types/index.js';

const lap = (overrides: Partial<LapData>): LapData => ({
  lapNum: 9, position: 5, lapTime: 100.358, lapTimeString: '1:40.358', s1: null, s2: null, s3: null, topSpeed: null,
  fCompound: 'Soft', rCompound: 'Soft', isPitStop: false, isValid: true, ...overrides,
} as LapData);

describe('lapDetailSections', () => {
  it('groups what happened on a lap, in the order the table shows it', () => {
    const sections = lapDetailSections(lap({
      nonRepresentativeReason: 'contact',
      traffic: { ahead: null, behind: null, following: false, passed: [{ name: 'Rui Paiva', carClass: 'GT3', sameClass: false }], passedBy: [] },
      incidents: [{ type: 'contact', description: 'Contact with another car (326N)' }],
      trackLimits: [{ description: 'Track limits violation (+0.25 pts)' }],
    } as Partial<LapData>));

    expect(sections.map((s) => s.label)).toEqual(['Left out of average', 'Around you', 'Incidents', 'Track limits']);
    expect(sections[1].lines).toEqual(['Passed Rui Paiva (GT3)']);
    expect(sections[2].lines).toEqual(['Contact with another car (326N)']);
  });

  it('adds the pit loss on a pit lap and nothing on a quiet lap', () => {
    expect(lapDetailSections(lap({ isPitStop: true, pitStopDurationString: '+13.0s' }))).toEqual([
      { label: 'Pit stop', lines: ['Estimated pit loss: +13.0s'] },
    ]);
    expect(lapDetailSections(lap({}))).toEqual([]);
  });
});

describe('lapEventsTooltip', () => {
  it('lists incidents, track limits and penalties without emoji', () => {
    const tooltip = lapEventsTooltip(lap({
      incidentCount: 1, incidents: [{ type: 'contact', description: 'Contact with Immovable (4522N)' }],
      penaltyCount: 1, penalties: [{ description: 'Drive Thru for speeding in pit lane', penalty: 'Drive Thru' }],
    } as Partial<LapData>));

    expect(tooltip).toBe('Incidents (1):\n  • Contact with Immovable (4522N)\n\nPenalties (1):\n  • Drive Thru for speeding in pit lane');
    expect(lapEventsTooltip(lap({}))).toBeUndefined();
  });
});
