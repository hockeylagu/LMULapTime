import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionDatabase } from '../../../server/core/db.js';
import { DB_PARSER_VERSION } from '../../../server/core/dbSessionSync.js';
import { LmuParser } from '../../../server/sessions/parser.js';

describe('session parser-version migration writes', () => {
  let tempDir: string | null = null;
  let db: SessionDatabase | null = null;

  afterEach(() => {
    db?.close();
    db = null;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
    vi.restoreAllMocks();
  });

  it('keeps the old version on a failed batch and reparses every file on the next ordinary scan', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-session-batch-retry-'));
    const database = new SessionDatabase(':memory:');
    tempDir = dir;
    db = database;
    const fixture = path.join(process.cwd(), 'test', 'fixtures', 'results', '2026_05_28_P1.xml');
    const xml = fs.readFileSync(fixture);
    for (let index = 0; index < 10; index++) {
      fs.writeFileSync(path.join(dir, `migration-${index}.xml`), xml);
    }
    const parser = new LmuParser(undefined, undefined, { detectPlayer: false });
    database.syncSessionsFromDir(dir, parser);
    const originalSessions = database.getAllSessions();
    expect(originalSessions).toHaveLength(10);
    database.setMetadata('parser_version', 'older-parser-version');

    const writeSpy = vi.spyOn(database, 'upsertSession').mockImplementationOnce(() => {
      throw new Error('temporary write failure');
    });
    expect(() => database.syncSessionsFromDir(dir, parser)).toThrow('temporary write failure');
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(database.getMetadata('parser_version')).toBe('older-parser-version');
    expect(database.getAllSessions()).toEqual(originalSessions);

    writeSpy.mockRestore();
    const parseSpy = vi.spyOn(parser, 'parseSessionXml');
    const retry = database.syncSessionsFromDir(dir, parser);

    expect(parseSpy).toHaveBeenCalledTimes(10);
    expect(retry).toMatchObject({ added: 0, updated: 10, total: 10 });
    expect(database.getMetadata('parser_version')).toBe(DB_PARSER_VERSION);
    expect(database.getAllSessions()).toHaveLength(10);
  });
});
