import { describe, expect, it } from 'vitest';
import path from 'node:path';
import type { DetailedSession, LapData } from '../../../../server/core/types.js';
import { canonicalSession } from '../../../../server/core/sessionRows/canonical.js';
import { readSession } from '../../../../server/core/sessionRows/reader.js';
import { writeSessionRows } from '../../../../server/core/sessionRows/writer.js';
import { LmuParser } from '../../../../server/sessions/parser.js';
import { driver, lap, memoryDb, roundTrip, session } from './builders.js';

const fixture = path.join(process.cwd(), 'test', 'fixtures', 'results', '2026_05_28_P1.xml');

function expectRoundTrip(input: DetailedSession): ReturnType<typeof roundTrip> {
  const result = roundTrip(input);
  expect(result.diffs).toEqual([]);
  expect(result.stored).toEqual(result.expected);
  return result;
}

describe('normalized session rows: round trip', () => {
  it('reads a parsed results XML back as its canonical form, with and without a player', () => {
    const parse = (player?: string) => {
      const parser = new LmuParser(undefined, undefined, { detectPlayer: false });
      if (player) parser.configuredPlayerName = player;
      return parser.parseSessionXml(fixture);
    };
    const anonymous = parse();
    expect(anonymous?.drivers.length).toBeGreaterThan(0);
    expectRoundTrip(anonymous as DetailedSession);
    const withPlayer = parse(anonymous?.drivers[0].name);
    expect(withPlayer?.playerDriver).toBeDefined();
    const { stored } = expectRoundTrip(withPlayer as DetailedSession);
    expect(stored?.playerDriver).toEqual(stored?.drivers.find(candidate => candidate.isPlayer));
  });

  it('keeps multiclass drivers and duplicate driver names apart by ordinal', () => {
    const twin = (position: number, bestLap: number) => driver('Same Name', [lap(1, { lapTime: bestLap })], { position, bestLapTime: bestLap, carClass: 'LMGT3', isPlayer: position === 2 });
    const input = session([driver('Leader', [lap(1), lap(2)]), twin(2, 105), twin(3, 109)]);
    const { stored } = expectRoundTrip(input);
    expect(stored?.drivers.map(candidate => candidate.carClass)).toEqual(['Hypercar', 'LMGT3', 'LMGT3']);
    expect(stored?.playerDriver?.bestLapTime).toBe(105);
  });

  it('keeps traffic with passes, following and pressured flags and absent neighbours', () => {
    const traffic: LapData['traffic'] = {
      ahead: { car: { name: 'Ahead', carClass: 'Hypercar', sameClass: true }, gapSec: 1.25 }, behind: null, following: true, pressured: false,
      passed: [{ name: 'A', carClass: 'LMGT3', sameClass: false }, { name: 'B', carClass: 'Hypercar', sameClass: true }],
      passedBy: [{ name: 'C', carClass: 'Hypercar', sameClass: true }],
    };
    const legacy: LapData['traffic'] = { ahead: null, behind: { car: { name: 'Back', carClass: 'LMP2', sameClass: false }, gapSec: 0.4 }, following: false, passed: [], passedBy: [] };
    expectRoundTrip(session([driver('P', [lap(1, { traffic }), lap(2, { traffic: legacy }), lap(3)], { isPlayer: true })]));
  });

  it('stores an event once: lap events are driver events, events without a lap stay on the driver, orders are kept', () => {
    const e1 = { type: 'contact' as const, description: 'Contact with X', lapNum: 2, elapsedSeconds: 200, force: 3.5, otherVehicle: 'X', isWallImpact: false };
    const e2 = { type: 'damage' as const, description: 'Damage', details: 'front', lapNum: 3, elapsedSeconds: 300, isWallImpact: true };
    const noLap = { type: 'other' as const, description: 'Unlocated' };
    const limit = { description: 'Cut', lapNum: 2, elapsedSeconds: 190, warningPoints: 1, currentPoints: 1, action: 'Warning' };
    const penalty = { penalty: 'Drive Thru', reason: 'Speeding', lapNum: 3, elapsedSeconds: 310, description: 'Speeding in pit' };
    const unlocatedLimit = { description: 'Cut somewhere' };
    const input = session([driver('P', [
      lap(1),
      // The lap list holds the driver's events in the opposite order.
      lap(2, { incidents: [e1], trackLimits: [limit], incidentCount: 1, trackLimitCount: 1 }),
      lap(3, { incidents: [e2], penalties: [penalty], penaltyCount: 1 }),
    ], { isPlayer: true, incidents: [noLap, e2, e1], trackLimits: [unlocatedLimit, limit], penalties: [penalty], totalIncidents: 3 })]);
    const db = memoryDb();
    const { stored } = roundTrip(input, db);
    expect(stored?.drivers[0].incidents).toEqual([noLap, e2, e1]);
    expect(stored?.drivers[0].laps[1].incidents).toEqual([e1]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM session_events').get()).toEqual({ count: 6 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM session_events WHERE lap_ordinal IS NULL').get()).toEqual({ count: 2 });
  });

  it('keeps a lap event that the driver list lacks and empty event lists', () => {
    const stray = { description: 'Only on the lap', lapNum: 1 };
    expectRoundTrip(session([driver('P', [lap(1, { trackLimits: [stray], incidents: [] }), lap(2)], { isPlayer: true, penalties: [] })]));
  });

  it('keeps wet laps with conditions, inferred laps, tyre wear and out-lap flags', () => {
    const laps = [
      lap(1, { conditions: { wetTyres: true, rain: 40 }, fCompound: 'Wet', rCompound: 'Wet', nonRepresentativeReason: 'offPace' }),
      lap(2, { conditions: { wetTyres: false } }),
      lap(3, { isInferred: true, lapTime: null, s1: null, s2: null, s3: null, topSpeed: null, isValid: false, lapTimeString: '--' }),
      lap(4, { isOutLap: false, isPitStop: true, pitStopDuration: 31.5, pitStopDurationString: '31.5s', elapsedSeconds: 412.5, elapsedTimeString: '06:52',
        gapToLeader: null, gapToLeaderString: '+4.215s', fuel: 55.5, fuelUsed: 3.2, virtualEnergy: null, virtualEnergyUsed: 2.1,
        flCompound: 'Soft', frCompound: 'Soft', rlCompound: 'Medium', rrCompound: 'Medium', tireWear: { fl: 90, fr: 89, rl: 92, rr: 91, avg: 90.5 } }),
      lap(5, { isOutLap: true }),
    ];
    const { stored } = expectRoundTrip(session([driver('P', laps, { isPlayer: true, bestLapWet: true, bestLapNum: null })]));
    expect(stored?.drivers[0].laps[2].lapTime).toBeNull();
    expect(stored?.drivers[0].laps[1].conditions).toEqual({ wetTyres: false });
    expect(stored?.drivers[0].laps[0].isOutLap).toBeUndefined();
    expect(stored?.drivers[0].laps[4].isOutLap).toBe(true);
  });

  it('turns an optional null into an absent property and never stores read-time fields', () => {
    const input = session([driver('P', [lap(1, { fuel: null, paceCategory: 'good' as never, pacePercentage: 101, target100Sec: 99, pitService: { } as never, lapOrdinal: 0 })],
      { isPlayer: true, avgLapTime: null, bestLapPaceCategory: 'good' as never, bestLapPacePercentage: 100.4, driverOrdinal: 0 })]);
    const { stored, expected } = expectRoundTrip(input);
    expect(stored?.drivers[0].laps[0]).not.toHaveProperty('fuel');
    expect(stored?.drivers[0].laps[0]).not.toHaveProperty('paceCategory');
    expect(stored?.drivers[0]).not.toHaveProperty('bestLapPaceCategory');
    expect(expected.drivers[0]).not.toHaveProperty('avgLapTime');
  });

  it('keeps weather, settings, best session lap, game version and the track length null', () => {
    const input = session([driver('P', [lap(1)], { isPlayer: true })], {
      trackLengthMeters: null, weatherInfo: 'Clear', weather: { condition: 'Wet', timeOfDay: 'Night', weatherString: 'Rain' }, gameVersion: '1.3',
      settings: { modeSetting: 'Multiplayer', serverName: 'Srv', damageMultiplier: 50, fuelMultiplier: 1, tireMultiplier: 2, tireWarmers: false, fixedSetups: true,
        freeSettings: 63, fixedUpgrades: false, parcFerme: 3, mechFailRate: 1, durationMinutes: 60, raceLaps: 20, raceTimeMinutes: 45, vehiclesAllowed: 'A,B,' },
      bestSessionLap: { driverName: 'P', carType: 'Ferrari 499P', lapTime: 101.5, lapTimeString: '1:41.500' }, totalLapsCount: 1,
    });
    const { stored } = expectRoundTrip(input);
    expect(stored?.trackLengthMeters).toBeNull();
    expect(stored?.settings?.tireWarmers).toBe(false);
  });

  it('reads an old numeric game version as its text', () => {
    const input = session([driver('P', [lap(1)])], { gameVersion: 1.3 as unknown as string });
    const { stored } = roundTrip(input);
    expect(stored?.gameVersion).toBe('1.3');
    expect(canonicalSession(input).gameVersion).toBe('1.3');
  });

  it('keeps a replay link with every field and a DuckDB file on the link and the session', () => {
    const input = session([driver('P', [lap(1)], { isPlayer: true })], {
      matchingReplayFile: { name: 'Replay_1', path: 'C:/Replays/Replay_1.Vcr', sizeBytes: 123456789, eventTitle: 'Spa', splitNo: 2, eventType: 'Race', durationSec: 3600.5,
        hasDuckDbTelemetry: true, duckdbFilename: 'spa.duckdb', hasRain: true, maxRainIntensity: 0.8, weatherCondition: 'Dynamic Weather', ambientTemp: 21.5, trackTemp: 30.25 },
      hasDuckDbTelemetry: true, duckdbFilename: 'spa.duckdb',
    });
    const { stored } = expectRoundTrip(input);
    expect(stored?.matchingReplayFile).toEqual(input.matchingReplayFile);
  });

  it('keeps a link whose DuckDB file the session does not carry yet, and a session whose flag is false', () => {
    expectRoundTrip(session([driver('P', [lap(1)])], { matchingReplayFile: { name: 'R', path: 'p', sizeBytes: 1, hasDuckDbTelemetry: true, duckdbFilename: 'a.duckdb' } }));
    expectRoundTrip(session([driver('P', [lap(1)])], { hasDuckDbTelemetry: false }));
  });

  it('records a stored player driver that matches no driver as a mismatch instead of inventing one', () => {
    const input = session([driver('P', [lap(1)], { isPlayer: true })]);
    input.playerDriver = { ...input.drivers[0], name: 'Someone Else' };
    const { diffs, stored } = roundTrip(input);
    expect(stored?.playerDriver).toBeUndefined();
    expect(diffs.some(diff => diff.startsWith('$.playerDriver'))).toBe(true);
  });

  it('keeps a session with no player and an empty session', () => {
    expectRoundTrip(session([driver('A', [lap(1)]), driver('B', [])]));
    const { stored } = expectRoundTrip(session([], { id: 'empty', driversCount: 0 }));
    expect(stored?.drivers).toEqual([]);
  });

  it('replaces the rows of a session on every write and leaves other sessions alone', () => {
    const db = memoryDb();
    const first = session([driver('P', [lap(1), lap(2)], { isPlayer: true, incidents: [{ type: 'contact', description: 'x', lapNum: 1 }] })]);
    const other = session([driver('Q', [lap(1)])], { id: 'session-b' });
    roundTrip(first, db);
    roundTrip(other, db);
    const changed = session([driver('P', [lap(1)], { isPlayer: true })]);
    writeSessionRows(db, changed);
    expect(readSession(db, 'session-a')).toEqual(canonicalSession(changed));
    expect(readSession(db, 'session-b')).toEqual(canonicalSession(other));
    expect(db.prepare("SELECT COUNT(*) AS count FROM session_events WHERE session_id = 'session-a'").get()).toEqual({ count: 0 });
  });

  it('reads nothing for an unknown session and refuses to write one without a sessions row', () => {
    const db = memoryDb();
    expect(readSession(db, 'missing')).toBeNull();
    expect(() => writeSessionRows(db, session([]))).toThrow(/unknown session/);
  });

  it('names an unmodeled field as a mismatch', () => {
    const input = session([driver('P', [lap(1)])]);
    (input.drivers[0].laps[0] as unknown as Record<string, unknown>).newParserField = 7;
    expect(roundTrip(input).diffs).toEqual(['$.drivers[0].laps[0].newParserField: 7 vs undefined']);
  });
});
