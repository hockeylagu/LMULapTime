import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { LmuParser } from '../../../server/sessions/parser.js';

describe('local player identity in multiplayer XML', () => {
  it.each([
    { names: ['Remote', 'Samuel Lague'], configured: 'Samuel Lague', expected: 'Samuel Lague' },
    { names: ['Remote', 'Samuel Lague'], configured: 'Samuel', expected: undefined },
    { names: ['Samuel Lague', 'Samuel Lague'], configured: 'Samuel Lague', expected: undefined },
    { names: ['Remote', 'Samuel Lague'], configured: '', expected: undefined },
  ])('resolves only a unique exact local identity: $configured / $names', ({ names, configured, expected }) => {
    const xml = `<rFactorXML><RaceResults><TrackVenue>Road Atlanta</TrackVenue><Race>
      ${names.map(name => `<Driver><Name>${name}</Name><isPlayer>1</isPlayer><CarClass>LMGT3</CarClass>
        <CarType>Ferrari 296 LMGT3</CarType><Lap num="1">82</Lap><Lap num="2">81</Lap></Driver>`).join('')}
      </Race></RaceResults></rFactorXML>`;
    const read = vi.spyOn(fs, 'readFileSync').mockReturnValue(xml);
    try {
      const parser = new LmuParser(undefined, undefined, { detectPlayer: false, readReplayMetadata: false });
      parser.configuredPlayerName = configured;
      const session = parser.parseSessionXml('multiplayer.xml');
      expect(session?.playerDriver?.name).toBe(expected);
      expect(session?.drivers.filter(driver => driver.isPlayer)).toHaveLength(expected ? 1 : 0);
      if (expected) expect(session?.playerDriver).toBe(session?.drivers[1]);
    } finally { read.mockRestore(); }
  });
});
