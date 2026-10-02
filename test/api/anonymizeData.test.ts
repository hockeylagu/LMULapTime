// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  anonymizeDriverName,
  anonymizePath,
  anonymizePayload,
  deanonymizeUrl,
  setDemoPlayerName,
} from '../../src/api/anonymizeData.js';

describe('anonymizeData', () => {
  it('anonymizes player driver name to Ricky Bobby', () => {
    setDemoPlayerName('Samuel Lague');
    expect(anonymizeDriverName('Samuel Lague')).toBe('Ricky Bobby');
  });

  it('anonymizes opponent names deterministically', () => {
    const anon1 = anonymizeDriverName('Fast Rival');
    const anon2 = anonymizeDriverName('Fast Rival');
    expect(anon1).toBe(anon2);
    expect(anon1).not.toBe('Fast Rival');
  });

  it('masks user filesystem paths to standard Steam installation paths', () => {
    const raw = 'C:\\Users\\Samuel\\AppData\\Local\\LMU\\UserData\\Replays';
    const masked = anonymizePath(raw);
    expect(masked).toContain('Steam\\steamapps\\common\\Le Mans Ultimate');
    expect(masked).not.toContain('Samuel');
  });

  it('deeply anonymizes payload objects and arrays', () => {
    const payload = {
      playerName: 'Samuel Lague',
      resultsDir: 'C:\\Users\\Samuel\\UserData\\LOG\\Results',
      drivers: [
        { name: 'Samuel Lague', carType: 'Ferrari 488 GTE' },
        { name: 'Kieran Kingery', carType: 'Duqueine D09' },
      ],
    };
    const anonymized = anonymizePayload(payload);
    expect(anonymized.playerName).toBe('Ricky Bobby');
    expect(anonymized.resultsDir).not.toContain('Samuel');
    expect(anonymized.drivers[0].name).toBe('Ricky Bobby');
    expect(anonymized.drivers[1].name).not.toBe('Kieran Kingery');
  });

  it('deanonymizes outgoing URLs for the server', () => {
    setDemoPlayerName('Samuel Lague');
    // Enable demo mode in window
    window.localStorage.setItem('lmu_demo_mode', 'true');
    const url = '/api/replays/x.Vcr/trajectory?driverName=Ricky%20Bobby&lap=8';
    expect(deanonymizeUrl(url)).toContain('Samuel%20Lague');
    window.localStorage.removeItem('lmu_demo_mode');
  });
});
