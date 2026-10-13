import type { WeatherCondition } from '../types/session.js';

/** Practice, qualifying or race: the session-type buckets of the lap pickers. */
export type SessionKind = 'practice' | 'quali' | 'race';

/** The canonical session type of each bucket; the one mapping shared by the lap pickers and their queries. */
export const SESSION_TYPE_BY_KIND: Record<SessionKind, string> = { practice: 'Practice', quali: 'Qualifying', race: 'Race' };

export function sessionKindOf(sessionType?: string | null): SessionKind | null {
  const entry = (Object.entries(SESSION_TYPE_BY_KIND) as Array<[SessionKind, string]>).find(([, type]) => type === sessionType);
  return entry ? entry[0] : null;
}

/** Lap condition of a recording: its weather, else wet when it rained, else dry. */
export function recordedCondition(weatherCondition?: WeatherCondition | null, hasRain?: boolean | null): WeatherCondition {
  return weatherCondition ?? (hasRain ? 'Wet' : 'Dry');
}

export const WEATHER_CONDITIONS: readonly WeatherCondition[] = ['Dry', 'Wet', 'Dynamic Weather'];

/** Order of the telemetry lap picker: fastest lap, newest session, or driver name. */
export const COMPARE_LAP_SORTS = ['lap', 'recent', 'driver'] as const;
export type CompareLapSort = typeof COMPARE_LAP_SORTS[number];
