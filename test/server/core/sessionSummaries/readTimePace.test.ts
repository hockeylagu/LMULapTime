import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetSessionDatabaseForTest } from '../../../../server/core/db.js';
import * as benchmarks from '../../../../server/benchmarks/referenceLaptimes.js';
import { LmuParser } from '../../../../server/sessions/parser.js';
import { rateSessionDetail } from '../../../../server/core/sessionSummaries/readTimePace.js';
import { queryCompactDashboard } from '../../../../server/core/sessionSummaries/dashboardQueries.js';

describe('benchmark pace at read time', () => {
  let dir: string | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    benchmarks.resetCachedReferenceLaptimes();
    resetSessionDatabaseForTest();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('ingests without rating and serves refreshed lap, best-lap and dashboard pace without reparsing', () => {
    const db = resetSessionDatabaseForTest(':memory:');
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-read-time-pace-'));
    fs.copyFileSync(path.join(process.cwd(), 'test/fixtures/results/2026_05_28_P1.xml'), path.join(dir, 'session.xml'));
    const cache = benchmarks.parseReferenceCsv('SpaLMH,Spa,1.4+,,2:00.000,2:01.200,2:02.400,2:03.600,2:04.800,2:06.000,2:07.200,2:08.400,Ferrari 499P,,,,LMH');
    db.saveReferenceLaptimes(cache);
    benchmarks.resetCachedReferenceLaptimes();
    const calculator = vi.spyOn(benchmarks, 'createPaceCalculator');
    const parser = new LmuParser(undefined, undefined, { detectPlayer: false, readReplayMetadata: false });
    const parse = vi.spyOn(parser, 'parseSessionXml');
    db.syncSessionsFromDir(dir, parser);
    expect(calculator).not.toHaveBeenCalled();
    const id = Array.from(db.iterateDetailedSessions())[0].id;
    const stored = db.getSessionById(id)!;
    expect(stored.drivers[0].bestLapPacePercentage).toBeUndefined();
    expect(stored.drivers[0].laps.every(lap => lap.target100Sec === undefined)).toBe(true);

    const detail = rateSessionDetail(stored);
    expect(detail.playerDriver).toBe(detail.drivers[0]);
    expect(detail.playerDriver?.bestLapPacePercentage).toBe(100.83);
    expect(detail.drivers[0].laps.map(lap => lap.pacePercentage)).toEqual([101.67, 100.83]);
    const dashboard = () => queryCompactDashboard(db.getDb(), { referenceEntries: db.getReferenceLaptimesCache()!.entries });
    expect(dashboard().metrics.bestTrackRefLaps).toMatchObject([
      { sessionId: id, percentage: 100.83, category: 'Competitive' },
    ]);
    expect(dashboard().trends.latestOuting?.pacePercentage).toBe(100.83);

    const refreshed = structuredClone(cache);
    refreshed.entries.spa_hyper.target100Sec = 121;
    db.saveReferenceLaptimes(refreshed);
    benchmarks.resetCachedReferenceLaptimes();
    expect(rateSessionDetail(db.getSessionById(id)!).playerDriver?.bestLapPacePercentage).toBe(100);
    const updated = dashboard();
    expect(updated.metrics.bestTrackRefLaps).toMatchObject([{ sessionId: id, percentage: 100, category: 'Alien' }]);
    expect(updated.metrics.averageBenchmarkPacePercentage).toBe(100);
    expect(updated.trends.latestOuting?.pacePercentage).toBe(100);
    expect(updated.trends.recentPaceTrend[0].pacePercentage).toBe(100);
    expect(updated.sessions[0].playerDriver?.bestLapPacePercentage).toBe(100);
    expect(parse).toHaveBeenCalledTimes(1);

    // A wet best remains unrated while the lap traces can still show their numerical pace.
    const wet = db.getSessionById(id)!;
    wet.drivers[0].bestLapWet = true;
    expect(rateSessionDetail(wet).playerDriver?.bestLapPacePercentage).toBeUndefined();
    expect(wet.drivers[0].laps[1].pacePercentage).toBe(100);

    db.saveReferenceLaptimes({ ...cache, entries: {}, entriesCount: 0 });
    benchmarks.resetCachedReferenceLaptimes();
    rateSessionDetail(detail);
    expect(detail.playerDriver?.bestLapPacePercentage).toBeUndefined();
    expect(detail.drivers[0].laps.every(lap => lap.target100Sec === undefined && lap.pacePercentage === undefined)).toBe(true);
  });
});
