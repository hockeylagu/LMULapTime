import { describe, expect, it } from 'vitest';
import { navigationProbe } from '../../../server/live/lmuNavigation.js';

describe('navigationProbe', () => {
  it('lets explicit load activity override a stale main-menu navigation label', () => {
    expect(navigationProbe(JSON.stringify({ state: { navigationState: 'NAV_MAIN_MENU' },
      loadingStatus: { loading: true, percentage: 1 } }))).toEqual({ loading: 1 });
    expect(navigationProbe(JSON.stringify({ state: { navigationState: 'NAV_MAIN_MENU', internalStateCode: 'OP_TO_REALTIME' },
      loadingStatus: { loading: false } }))).toEqual({ loading: null });
  });
  it('reads the main menu, a session loading with its progress, and anything else as a session', () => {
    expect(navigationProbe(JSON.stringify({ state: { navigationState: 'NAV_MAIN_MENU' } }))).toBe('menu');
    expect(navigationProbe(JSON.stringify({ state: { navigationState: 'NAV_EVENT' }, loadingStatus: { loading: true, percentage: 0.4567 } })))
      .toEqual({ loading: 0.46 });
    expect(navigationProbe(JSON.stringify({ loadingStatus: { loading: true, percentage: -1 } }))).toEqual({ loading: null });
    expect(navigationProbe(JSON.stringify({ state: { navigationState: 'NAV_EVENT' }, loadingStatus: { loading: false, percentage: -1 } }))).toBe('session');
    expect(navigationProbe(JSON.stringify({ state: { navigationState: 'NAV_EVENT', settingMode: 'SETTING_REPLAY_PLAYBACK' } }))).toBe('replay');
    expect(navigationProbe('not json')).toBe('busy');
  });

  it('keeps loading while LMU finishes the load after clearing its loading flag', () => {
    for (const gameState of ['GSTATE_INIT', 'GSTATE_RESTART']) {
      expect(navigationProbe(JSON.stringify({
        state: { navigationState: 'NAV_EVENT', gameState, internalStateCode: 'OP_TO_REALTIME' },
        loadingStatus: { loading: false, percentage: -1 },
      }))).toEqual({ loading: null });
    }
    expect(navigationProbe(JSON.stringify({
      state: { navigationState: 'NAV_EVENT', gameState: 'GSTATE_DYN', internalStateCode: 'OP_RAN_REALTIME_PASS' },
      loadingStatus: { loading: false, percentage: -1 },
    }))).toBe('session');
  });
});
