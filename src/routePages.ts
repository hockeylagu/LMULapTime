import { createElement, use, type ComponentType } from 'react';

/**
 * Route pages load on demand so the first screen parses only its own page: the current route's page downloads
 * alongside the session data (`preloadRoutePage`) and the rest once the browser is idle (`prefetchRoutePages`).
 * Import pages from their own module, never from the components barrel, or the split is lost.
 *
 * Not `React.lazy`: lazy suspends on first render even when the module is already loaded, and React 19 then holds the
 * page behind its Suspense fallback for the reveal throttle (~300 ms). A loaded page here renders straight away.
 */
interface RoutePage<P extends object> {
  Page: ComponentType<P>;
  load: () => Promise<void>;
}

function routePage<M, P extends object>(importPage: () => Promise<M>, pick: (module: M) => ComponentType<P>): RoutePage<P> {
  let Loaded: ComponentType<P> | undefined;
  let pending: Promise<void> | undefined;
  const load = (): Promise<void> => {
    pending ??= importPage().then(
      (module) => { Loaded = pick(module); },
      (error: unknown) => { pending = undefined; throw error; },
    );
    return pending;
  };
  function Page(props: P) {
    if (!Loaded) use(load());
    return Loaded ? createElement(Loaded, props) : null;
  }
  return { Page, load };
}

const dashboard = routePage(() => import('./components/dashboard/Dashboard.js'), (m) => m.Dashboard);
const tracks = routePage(() => import('./components/track-summaries/TrackSummaries.js'), (m) => m.TrackSummaries);
const session = routePage(() => import('./components/session-detail/SessionDetail.js'), (m) => m.SessionDetail);
const track = routePage(() => import('./components/track-detail/TrackDetail.js'), (m) => m.TrackDetail);
const leaderboard = routePage(() => import('./components/leaderboard/LeaderboardPage.js'), (m) => m.LeaderboardPage);
const settings = routePage(() => import('./components/settings/Settings.js'), (m) => m.Settings);
const telemetry = routePage(() => import('./components/replay/ReplayInspectorPage.js'), (m) => m.ReplayInspectorPage);

/** Pages by the first segment of their route path. */
const pagesByRoute = { dashboard, tracks, session, track, leaderboard, settings, telemetry };

export const Dashboard = dashboard.Page;
export const TrackSummaries = tracks.Page;
export const SessionDetail = session.Page;
export const TrackDetail = track.Page;
export const LeaderboardPage = leaderboard.Page;
export const Settings = settings.Page;
export const ReplayInspectorPage = telemetry.Page;

/** Starts fetching the page for `pathname` (first segment, dashboard by default). */
export function preloadRoutePage(pathname: string): void {
  const segment = pathname.split('/')[1] ?? '';
  const page = segment in pagesByRoute ? pagesByRoute[segment as keyof typeof pagesByRoute] : dashboard;
  page.load().catch(() => undefined);
}

/** Fetches every page chunk; a failed fetch is retried when the page renders. */
export function prefetchRoutePages(): Promise<void> {
  return Promise.all(Object.values(pagesByRoute).map((page) => page.load().catch(() => undefined))).then(() => undefined);
}
