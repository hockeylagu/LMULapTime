import http from 'node:http';
import type { LiveVehicleCondition } from '../../shared/domain/live/liveCarCondition.js';
import type { LiveForecastNode } from '../../shared/domain/live/liveForecast.js';
import type { LiveRestUpdate, LiveSelectedTyres } from '../../shared/domain/live/liveStrategyTracker.js';
import type { LivePitMenu, LivePitState } from '../../shared/types/liveStrategy.js';

/**
 * LMU's local REST reads for the pit data (docs/LMU_REST_API.md section 4.3) and their parsers. `127.0.0.1`, never
 * `localhost` (IPv6 first, about 2 s). Every parser takes the parsed JSON body and returns null for a shape it
 * does not know, so a changed game build shows nothing rather than something wrong.
 */
export const LMU_REST_ORIGIN = 'http://127.0.0.1:6397';
export const REST_TIMEOUT_MS = 1000;

export type RestAnswer = { ok: true; body: unknown } | { ok: false; reason: 'status' | 'timeout' | 'error' };
export type RestGet = (path: string) => Promise<RestAnswer>;

/** One GET; never throws. A non-200, an unreadable body, a refusal or an answer slower than 1 s is not ok. */
export const lmuGet: RestGet = path => new Promise(resolve => {
  const request = http.get(`${LMU_REST_ORIGIN}${path}`, { timeout: REST_TIMEOUT_MS }, response => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk: string) => { body += chunk; });
    response.on('end', () => {
      if (response.statusCode !== 200) { resolve({ ok: false, reason: 'status' }); return; }
      try { resolve({ ok: true, body: JSON.parse(body) as unknown }); } catch { resolve({ ok: false, reason: 'error' }); }
    });
  });
  request.on('timeout', () => { request.destroy(); resolve({ ok: false, reason: 'timeout' }); });
  request.on('error', () => resolve({ ok: false, reason: 'error' }));
});

type Json = Record<string, unknown>;
const record = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : null;
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const numbers = (value: unknown): number[] | null =>
  Array.isArray(value) && value.every(item => num(item) !== null) ? value as number[] : null;
/** The leading number of a game text such as `50% (20.1 laps)`, `43.0L` or `50% 20 laps`. */
const leadingNumber = (text: unknown): number | null => {
  const match = typeof text === 'string' ? /^\s*(-?\d+(?:\.\d+)?)/.exec(text) : null;
  return match ? Number(match[1]) : null;
};

const PIT_STATES: Record<string, LivePitState> = {
  NONE: 'none', REQUEST: 'request', ENTERING: 'entering', STOPPED: 'stopped', EXITING: 'exiting',
};

/** `GET /rest/watch/standings`: the player's row. */
export function parseStandings(body: unknown): Extract<LiveRestUpdate, { type: 'standings' }> | null {
  if (!Array.isArray(body)) return null;
  const row = body.map(record).find(item => item?.player === true);
  if (!row) return null;
  return {
    type: 'standings',
    veFraction: num(row.veFraction),
    fuelFraction: num(row.fuelFraction),
    pitState: PIT_STATES[String(row.pitState)] ?? 'none',
    penalties: num(row.penalties) ?? 0,
  };
}

/** `GET /rest/strategy/pitstop-estimate`: seconds per service part and the total. */
export function parseEstimate(body: unknown): Extract<LiveRestUpdate, { type: 'estimate' }> | null {
  const json = record(body);
  const total = num(json?.total);
  if (!json || total === null) return null;
  const part = (name: string): number => num(json[name]) ?? 0;
  return { type: 'estimate', total, damage: part('damage'), penalties: part('penalties'), fuel: part('fuel'), ve: part('ve'), tires: part('tires') };
}

/** `GET /rest/garage/UIScreen/RepairAndRefuel`: the random delays of the game's pit rules. */
export function parsePitStopTimes(body: unknown): Extract<LiveRestUpdate, { type: 'pitStopTimes' }> | null {
  const times = record(record(record(body)?.pitStopTimes)?.times);
  if (!times) return null;
  const delay = (name: string): number => Math.max(0, num(times[name]) ?? 0);
  return {
    type: 'pitStopTimes',
    fixRandom: delay('FixRandomDelay'),
    fuelRandom: delay('FuelRandomDelay'),
    tireRandom: delay('RandomTireDelay'),
    veRandom: delay('virtualEnergyRandomDelay'),
  };
}

/** The resource lines of the MFD: VE where the car has it, else the fuel line. */
const RESOURCE_LINES = ['VIRTUAL ENERGY:', 'FUEL:'];

/** `GET /rest/garage/PitMenu/receivePitMenu`: the lines `{name, currentSetting, settings[{text}]}`. */
export function parsePitMenu(body: unknown): LivePitMenu | null {
  if (!Array.isArray(body)) return null;
  const lines = new Map<string, string>();
  let fuelRatioOptions: number[] = [];
  for (const item of body.map(record)) {
    const name = item?.name;
    const index = num(item?.currentSetting);
    const settings = item?.settings;
    if (typeof name !== 'string' || index === null || !Array.isArray(settings)) continue;
    const text = record(settings[index])?.text;
    if (name.trim() === 'FUEL RATIO:') fuelRatioOptions = settings.map(setting => leadingNumber(record(setting)?.text)).filter((value): value is number => value !== null && value > 0);
    if (typeof text === 'string') lines.set(name.trim(), text.trim());
  }
  if (lines.size === 0) return null;
  const resourceName = RESOURCE_LINES.find(name => lines.has(name));
  const resourceText = resourceName ? lines.get(resourceName) ?? null : null;
  return {
    resourceValue: leadingNumber(resourceText),
    resourceText,
    tyres: lines.get('TIRES:') ?? null,
    repair: lines.get('DAMAGE:') ?? null,
    ...(fuelRatioOptions.length > 0 ? { fuelRatio: leadingNumber(lines.get('FUEL RATIO:')), fuelRatioOptions } : {}),
  };
}

/** `GET /rest/garage/getVehicleCondition`. */
export function parseVehicleCondition(body: unknown): LiveVehicleCondition | null {
  const json = record(body);
  const damage = num(json?.vehicleDamage);
  const suspension = numbers(json?.suspensionDamage);
  const tires = numbers(json?.tireCondition);
  if (damage === null || !suspension || !tires) return null;
  return { body: damage, suspension, tires };
}

/** `GET /rest/garage/UIScreen/TireManagement`: the game's per-lap use (VE as a fraction) and the new sets left. */
export function parseTireManagement(body: unknown): Extract<LiveRestUpdate, { type: 'tireManagement' }> | null {
  const json = record(body);
  const usage = record(json?.expectedUsage);
  if (!usage) return null;
  const veFraction = num(usage.virtualEnergyFractionPerLap);
  return {
    type: 'tireManagement',
    vePerLap: veFraction !== null && veFraction > 0 ? veFraction * 100 : null,
    fuelPerLap: num(usage.fuelConsumption),
    newSets: num(record(json?.tireInventory)?.newTires),
    selected: parseSelectedTyres(json),
  };
}

/**
 * `tireInvGarageOptions.selectedTires`: the set the car goes out on, one entry per wheel (`isUsed`, `wearValue`
 * 0-100, `compoundIndex` into `optimalCompoundConditions.compounds`).
 */
function parseSelectedTyres(json: Json | null): LiveSelectedTyres | null {
  const selected = record(json?.tireInvGarageOptions)?.selectedTires;
  if (!Array.isArray(selected) || selected.length === 0) return null;
  const wheels = selected.map(record).filter((wheel): wheel is Json => wheel !== null);
  const wear = wheels.map(wheel => num(wheel.wearValue)).filter((value): value is number => value !== null);
  if (wear.length === 0) return null;
  const compounds = record(json?.optimalCompoundConditions)?.compounds;
  const index = num(wheels[0].compoundIndex);
  const compound = Array.isArray(compounds) && index !== null ? record(compounds[index])?.type : null;
  return {
    compound: typeof compound === 'string' ? compound : null,
    used: wheels.some(wheel => wheel.isUsed === true),
    wear: Math.min(...wear) / 100,
  };
}

/** `GET /rest/garage/getPlayerGarageData`: the start amounts set in the garage. */
export function parseGarageData(body: unknown): Extract<LiveRestUpdate, { type: 'garage' }> | null {
  const json = record(body);
  if (!json) return null;
  const ve = record(json.VM_VIRTUAL_ENERGY);
  const fuel = record(json.VM_FUEL_LEVEL);
  // With VE the fuel item is the fuel ratio ("0.86"); litres only show as "60.0L ...".
  const fuelText = fuel?.stringValue;
  return {
    type: 'garage',
    veStart: ve?.available === false ? null : leadingNumber(ve?.stringValue),
    fuelStart: typeof fuelText === 'string' && /\d\s*L/i.test(fuelText) ? leadingNumber(fuelText) : null,
    ...(ve?.available !== false && leadingNumber(ve?.stringValue) !== null && typeof fuelText === 'string' && !/L/i.test(fuelText)
      ? { fuelRatio: leadingNumber(fuelText) } : {}),
  };
}

/** Node keys of `sessions/weather` and their place in the session. */
const NODE_FRACTIONS: Record<string, number> = { START: 0, NODE_25: 0.25, NODE_50: 0.5, NODE_75: 0.75, FINISH: 1 };

/** `GET /rest/sessions/weather`: rain chance per forecast node, by session name (`PRACTICE`, `QUALIFY`, `RACE`). */
export function parseForecast(body: unknown): Extract<LiveRestUpdate, { type: 'forecast' }> | null {
  const json = record(body);
  if (!json) return null;
  const sessions: Record<string, LiveForecastNode[]> = {};
  for (const [name, value] of Object.entries(json)) {
    const nodes: LiveForecastNode[] = [];
    for (const [key, node] of Object.entries(record(value) ?? {})) {
      const chance = num(record(record(node)?.WNV_RAIN_CHANCE)?.currentValue);
      if (key in NODE_FRACTIONS && chance !== null) nodes.push({ fraction: NODE_FRACTIONS[key], rainChance: chance });
    }
    if (nodes.length > 0) sessions[name] = nodes.sort((a, b) => a.fraction - b.fraction);
  }
  return Object.keys(sessions).length > 0 ? { type: 'forecast', sessions } : null;
}

/**
 * `GetSessionsInfoForEvent`: `scheduledSessions[{ name, lengthTime }]` in minutes, the same list in every garage of the
 * event (read 2026-10-17: PRACTICE 5, QUALIFYING 10, RACE 5). The race entry is the one named RACE; none, or several
 * of different lengths, leave the race length unknown.
 */
export function parseSchedule(body: unknown): Extract<LiveRestUpdate, { type: 'schedule' }> | null {
  const sessions = record(body)?.scheduledSessions;
  if (!Array.isArray(sessions)) return null;
  const races = new Set<number>();
  for (const session of sessions) {
    const entry = record(session);
    const name = typeof entry?.name === 'string' ? entry.name.trim().toUpperCase() : '';
    const minutes = num(entry?.lengthTime);
    if (name.startsWith('RACE') && minutes !== null && minutes > 0) races.add(minutes);
  }
  return { type: 'schedule', raceMinutes: races.size === 1 ? [...races][0] : null };
}
