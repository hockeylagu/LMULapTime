import { describe, expect, it } from 'vitest';
import { lapDetailSections, lapEventsTooltip } from '../../../src/components/session-detail/table/lapDetailSections.js';
import type { LapData } from '../../../shared/types/index.js';
import { lapEventTime } from '../../../src/components/session-detail/table/SessionLapDetailsRow.js';

const lap = (overrides: Partial<LapData>): LapData => ({
  lapNum: 9, position: 5, lapTime: 100.358, lapTimeString: '1:40.358', s1: null, s2: null, s3: null, topSpeed: null,
  fCompound: 'Soft', rCompound: 'Soft', isPitStop: false, isValid: true, ...overrides,
} as LapData);

describe('lapDetailSections', () => {
  it('reports timing-line position changes even without traffic evidence', () => {
    expect(lapDetailSections(lap({}), { places: { from: 5, to: 3, inClass: true } })).toEqual([
      { label: 'Position gained', lines: ['P5 → P3 · 2 places gained'] },
    ]);
    expect(lapDetailSections(lap({ isPitStop: true }), { places: { from: 3, to: 4, inClass: false } })[0])
      .toEqual({ label: 'Position lost', lines: ['P3 → P4 · 1 place lost'] });
  });

  it('shows measured event offsets and preserves the session clock when an offset cannot be established', () => {
    const timed = lap({ elapsedSeconds: 500, lapTime: 100 });
    expect(lapEventTime(timed, 530.5)).toBe('Lap +0:30.5');
    expect(lapEventTime(timed, 500)).toBe('Lap +0:00.0');
    expect(lapEventTime(timed, 499)).toBe('Session 8:19.0');
    expect(lapEventTime(timed, 601)).toBe('Session 10:01.0');
    expect(lapEventTime(lap({}), 530.5)).toBe('Session 8:50.5');
    expect(lapEventTime(timed, undefined)).toBeUndefined();
    expect(lapEventTime(timed, Number.NaN)).toBeUndefined();
  });
  it('groups what happened on a lap, in the order the table shows it', () => {
    const sections = lapDetailSections(lap({
      nonRepresentativeReason: 'contact',
      traffic: { ahead: null, behind: null, following: false, passed: [{ name: 'Rui Paiva', carClass: 'GT3', sameClass: false }], passedBy: [] },
      incidents: [{ type: 'contact', description: 'Contact with another car (326N)' }],
      trackLimits: [{ description: 'Track limits violation (+0.25 pts)' }],
    } as Partial<LapData>));

    expect(sections.map((s) => s.label)).toEqual(['Left out of average', 'Around you', 'Incidents', 'Track limits']);
    expect(sections[0].lines).toEqual(['Slower than your median lap, with contact or damage']);
    expect(sections[1].lines).toEqual(['Other classes: passed Rui Paiva (GT3)']);
    expect(sections[2].lines).toEqual(['Contact with another car (326N)']);
    // The heading already says Track limits.
    expect(sections[3].lines).toEqual(['Violation (+0.25 pts)']);
  });

  it('does not call cars going by on a pit lap or an out-lap a fight', () => {
    const traffic = { ahead: null, behind: null, following: false, passed: [], passedBy: [{ name: 'Rui Paiva', carClass: 'GT3', sameClass: true }] };
    expect(lapDetailSections(lap({ traffic }))).toEqual([{ label: 'Around you', lines: ['Defending: passed by Rui Paiva'] }]);
    expect(lapDetailSections(lap({ traffic, isOutLap: true }))).toEqual([]);
  });

  const pitService = { pitLaneSec: 123.1, serviceSec: 73.2, classMedianServiceSec: 29.3, unexplainedSec: 44 };

  it('splits a stop between its in-lap and its out-lap at the timing line', () => {
    // The 08/27 Daytona stop: the line runs through the pit lane 13 s after the entry, before the box.
    const inLap = lap({
      lapNum: 14, lapTime: 122.366, isPitStop: true, pitStopDuration: 113.1, pitStopDurationString: '+113.1s',
      pitService: { ...pitService, laneBeforeLineSec: 13.4, serviceAfterLine: true },
    });
    const outLap = lap({ lapNum: 15, lapTime: 210.933, isOutLap: true });
    const stop = { inLap, outLap, damageBefore: { lapNum: 11, description: 'New suspension damage reported' } };

    expect(lapDetailSections(inLap, { pitStop: { ...stop, onOutLap: false } })).toEqual([{ label: 'Pit stop', lines: [
      'Pit entry: into the pit lane 13 s before the line',
      'Time lost on this lap: +12.3s',
    ] }]);
    expect(lapDetailSections(outLap, { pitStop: { ...stop, onOutLap: true } })).toEqual([{ label: 'Pit stop', lines: [
      'In the box: 73 s (usual for your class: 29 s)',
      "Likely repairs: 44 s longer than your class's usual stop, after the suspension damage on lap 11",
      'Pit exit: out of the pit lane 110 s after the line (pit lane 123 s in all)',
      'Time lost on this lap: +100.8s',
      'Whole stop: +113.1s over laps 14 and 15',
    ] }]);
  });

  it('keeps a stop the line does not cut on the in-lap', () => {
    const inLap = lap({ lapNum: 5, isPitStop: true, pitStopDuration: 30, pitStopDurationString: '+30.0s', pitService });
    expect(lapDetailSections(inLap)).toEqual([{ label: 'Pit stop', lines: [
      'Pit lane: 123 s',
      'In the box: 73 s (usual for your class: 29 s)',
      "Likely repairs: 44 s longer than your class's usual stop",
      'Estimated pit loss: +30.0s',
    ] }]);
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
