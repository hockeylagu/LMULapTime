import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { initDbSchema } from '../../../server/core/dbSchema.js';
import { createLiveAuditWriter, iterateLiveAudit, pruneLiveAudit, readLiveAudit } from '../../../server/core/live/dbLiveAuditStore.js';
import { exportLiveAudit } from '../../../server/live/audit/export.js';
import { createLiveRouter } from '../../../server/routes/liveRoutes.js';
import { LiveService } from '../../../server/live/liveService.js';
import type { ServerContext } from '../../../server/core/serverContext.js';
import type { LiveAuditRecord } from '../../../shared/types/liveAudit.js';
import { liveSnapshot, liveStrategy } from '../../helpers/liveSnapshot.js';

function record(sequence: number, runId = 'run-1'): LiveAuditRecord {
  return { runId, sequence, modelVersion: 1, recordedAt: 1000 + sequence, reason: 'sample',
    snapshot: liveSnapshot({ strategy: liveStrategy() }), observation: { fuel: null, ve: null }, comparison: null };
}
const databases: Database.Database[] = [];
function setup() {
  const db = new Database(':memory:');
  databases.push(db);
  initDbSchema(db);
  const save = createLiveAuditWriter(db);
  const app = express();
  app.use('/api', createLiveRouter({ sessionDb: { getDb: () => db } } as unknown as ServerContext, new LiveService()));
  return { db, save, app };
}
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

describe('persistent live strategy history', () => {
  it('keeps independent runs, bounds JSON history, and preserves the original values', () => {
    const { db, save } = setup();
    const original = record(1);
    save(original);
    original.snapshot.strategy!.resource!.perLap = 90;
    save(record(2)); save(record(1, 'run-2'));
    expect(readLiveAudit(db, 'run-1', 1)).toMatchObject([{ sequence: 2 }]);
    expect(readLiveAudit(db, 'run-1')[1].snapshot.strategy?.resource?.perLap).toBe(2.5);
    expect([...iterateLiveAudit(db, null)]).toHaveLength(3);
    expect(() => save(record(1))).toThrow(/UNIQUE/);
    initDbSchema(db);
    expect(readLiveAudit(db, null)).toHaveLength(3);
  });

  it('keeps only the most recent captures, pruned when the writer is created', () => {
    const { db, save } = setup();
    ['old', 'mid', 'new'].forEach((run, index) => {
      for (const sequence of [1, 2]) save({ ...record(sequence, run), recordedAt: (index + 1) * 1000 + sequence });
    });
    expect(pruneLiveAudit(db, 2)).toBe(2);
    expect(new Set([...iterateLiveAudit(db, null)].map(item => item.runId))).toEqual(new Set(['mid', 'new']));
    createLiveAuditWriter(db);
    expect([...iterateLiveAudit(db, null)]).toHaveLength(4);
  });

  it('returns saved history and a downloadable CSV, validates run IDs and scopes exports', async () => {
    const { app, save } = setup();
    save(record(1)); save(record(1, 'run-2'));
    const json = await request(app).get('/api/live/audit?runId=run-1');
    expect(json.status).toBe(200);
    expect(json.body).toHaveLength(1);
    const csv = await request(app).get('/api/live/audit.csv?runId=run-1');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-disposition']).toContain('lmu-strategy-run-1.csv');
    expect(csv.text).toContain('"estimated_use_per_lap"');
    expect(csv.text).toContain('"run-1"');
    expect(csv.text).not.toContain('run-2');
    expect((await request(app).get('/api/live/audit.csv?runId[]=oops')).status).toBe(400);
    expect((await request(app).get('/api/live/audit?runId=unknown')).body).toEqual([]);
  });

  it('escapes commas, quotes, newlines and spreadsheet formulas while keeping signed numeric errors', () => {
    const item = record(1);
    item.snapshot.session!.vehicleName = '=CMD("x,y")\ncar';
    item.comparison = { lap: 1, forecastAtSeconds: 0, resourceKind: 've', source: 'game',
      predictedPerLap: 3, actualPerLap: 2.5, errorPerLap: -0.5, errorPercent: -16.667,
      actualRatio: 0.8, recommendedRatio: 0.81, ratioError: -0.01, garageRatio: 0.85, nextStopRatio: 0.82 };
    const csv = [...exportLiveAudit([item])].join('');
    expect(csv).toContain('"\'=CMD(""x,y"")\ncar"');
    expect(csv).toContain('"-0.5"');
    expect(csv).toContain('"0.85","0.82"');
  });
});
