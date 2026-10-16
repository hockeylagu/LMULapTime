import { describe, expect, it } from 'vitest';
import { navigationProbe } from '../../../server/live/lmuNavigation.js';

describe('navigationProbe', () => {
  it('reads the main menu, a session loading with its progress, and anything else as a session', () => {
    expect(navigationProbe(JSON.stringify({ state: { navigationState: 'NAV_MAIN_MENU' } }))).toBe('menu');
    expect(navigationProbe(JSON.stringify({ state: { navigationState: 'NAV_EVENT' }, loadingStatus: { loading: true, percentage: 0.4567 } })))
      .toEqual({ loading: 0.46 });
    expect(navigationProbe(JSON.stringify({ loadingStatus: { loading: true, percentage: -1 } }))).toEqual({ loading: null });
    expect(navigationProbe(JSON.stringify({ state: { navigationState: 'NAV_EVENT' }, loadingStatus: { loading: false, percentage: -1 } }))).toBe('session');
    expect(navigationProbe('not json')).toBe('session');
  });
});
