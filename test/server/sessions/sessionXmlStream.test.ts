import { describe, expect, it } from 'vitest';
import type { DriverData } from '../../../shared/types/session.js';
import { parseStreamEvents } from '../../../server/sessions/sessionXmlStream.js';
import type { RawStreamXmlNode } from '../../../server/sessions/sessionXmlTypes.js';

function driver(name: string): DriverData {
  return {
    name, carType: 'Test Car', carClass: 'GT3', carNumber: '1', teamName: 'Test Team', isPlayer: false,
    position: 1, classPosition: 1, bestLapTime: 120, 
    bestS1: 40, bestS2: 40, bestS3: 40, theoreticalBest: 120, 
    declaredLapsCount: 1,
    laps: [{ lapNumber: 2, position: 1, lapTime: 120, 
      s1: 40, s2: 40, s3: 40, topSpeed: null, fCompound: 'Medium', rCompound: 'Medium',
      isPitStop: false, isValid: true, elapsedSeconds: 120 }],
  };
}

const events: Array<{ kind: string; stream: RawStreamXmlNode; count: (driver: DriverData) => number }> = [
  { kind: 'contact', stream: { Incident: { '@_et': 150,
    '#text': 'Ann Smith#12(2) reported contact (750) with Immovable' } }, count: d => d.incidents?.length ?? 0 },
  { kind: 'damage', stream: { Sector: { '@_et': 150,
    '#text': 'Ann Smith#12(2) reports new suspension damage' } }, count: d => d.incidents?.length ?? 0 },
  { kind: 'track limits', stream: { TrackLimits: { '@_Driver': 'Ann Smith', '@_Lap': 1,
    '@_et': 150, '#text': 'Warning' } }, count: d => d.trackLimits?.length ?? 0 },
  { kind: 'penalty', stream: { Penalty: { '@_Driver': 'Ann Smith', '@_et': 150,
    '@_Penalty': 'Drive Thru', '@_Reason': 'Speeding' } }, count: d => d.penalties?.length ?? 0 },
];

describe('XML stream event driver identity', () => {
  it.each(events)('assigns $kind to the exact driver after an earlier prefix match', ({ stream, count }) => {
    const drivers = [driver('Ann Smithson'), driver('Ann Smith')];
    parseStreamEvents(stream, drivers);
    expect(drivers.map(count)).toEqual([0, 1]);
    const owned = drivers[1];
    expect((owned.incidents?.length ? owned.incidents : owned.trackLimits?.length ? owned.trackLimits : owned.penalties)?.[0].lapNumber).toBe(2);
    expect(drivers[0].incidents).toBeUndefined();
    expect(drivers[0].trackLimits).toBeUndefined();
    expect(drivers[0].penalties).toBeUndefined();
  });

  it.each(events)('leaves $kind unattributed for duplicate normalized names', ({ stream, count }) => {
    const drivers = [driver('Ann Smith'), driver(' ann SMITH '), driver('Ann Smith#12(2)')];
    parseStreamEvents(stream, drivers);
    expect(drivers.map(count)).toEqual([0, 0, 0]);
  });

  it.each(['Ann', 'Ann Smithson', '', '   ', 'Unknown Driver'])('does not guess an owner for "%s"', name => {
    const drivers = [driver(''), driver('Ann Smith')];
    parseStreamEvents({ TrackLimits: { '@_Driver': name, '@_Lap': 1, '#text': 'Warning' } }, drivers);
    expect(drivers.map(d => d.trackLimits?.length ?? 0)).toEqual([0, 0]);
  });

  it('matches case, surrounding whitespace and stream decorations without changing display names', () => {
    const drivers = [driver('Ann Smith')];
    parseStreamEvents({ TrackLimits: { '@_Driver': ' ann SMITH#12(2) ', '@_Lap': 1, '#text': 'Warning' } }, drivers);
    expect(drivers[0].trackLimits).toHaveLength(1);
    expect(drivers[0].name).toBe('Ann Smith');
  });
});
