// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, postJson } from '../../src/api/apiClient.js';
import {
  anonymizeDriverName,
  anonymizePath,
  anonymizePayload,
  deanonymizeUrl,
  isDemoMode,
  setDemoPlayerName,
} from '../../src/api/anonymizeData.js';

describe('anonymizeData', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('limits anonymization to explicit demo URLs even after a previous demo visit', () => {
    window.localStorage.setItem('lmu_demo_mode', 'true');
    window.history.replaceState(null, '', '/#/settings');
    expect(isDemoMode()).toBe(false);
    window.history.replaceState(null, '', '/#/live?demo=1');
    expect(isDemoMode()).toBe(true);
    window.history.replaceState(null, '', '/#/settings');
    expect(isDemoMode()).toBe(false);
  });

  it.each(['/?demo=1', '/?anonymize=true', '/?other=1#/live?demo=1'])('recognizes explicit demo URL %s', url => {
    window.history.replaceState(null, '', url);
    expect(isDemoMode()).toBe(true);
  });

  it.each(['/?demo=false', '/?demo=0', '/?demo=1oops', '/?demo=true-no'])('does not enable demo for %s', url => {
    window.history.replaceState(null, '', url);
    expect(isDemoMode()).toBe(false);
  });

  it('returns the detected profile name on normal requests after leaving the demo', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify({ playerName: 'Samuel Lague' }), { status: 200 }),
    ));
    window.history.replaceState(null, '', '/#/live?demo=1');
    await expect(fetchJson('/api/status')).resolves.toEqual({ playerName: 'Ricky Bobby' });
    window.history.replaceState(null, '', '/#/settings');
    await expect(fetchJson('/api/status')).resolves.toEqual({ playerName: 'Samuel Lague' });
  });

  it('scans without saving demo aliases or masked folder paths', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(null, '', '/?demo=1#/settings');
    await postJson('/api/scan', { playerName: 'Ricky Bobby', resultsDir: 'C:/masked/Results' });
    expect(fetchMock).toHaveBeenCalledWith('/api/scan', expect.objectContaining({ method: 'POST', body: undefined }));
  });

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
    window.history.replaceState(null, '', '/?demo=1');
    const url = '/api/replays/x.Vcr/trajectory?driverName=Ricky%20Bobby&lap=8';
    expect(deanonymizeUrl(url)).toContain('Samuel%20Lague');
  });
});
