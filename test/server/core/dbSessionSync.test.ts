import { lapEvents } from '../../../shared/domain/lapComparison.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionDatabase } from '../../../server/core/db.js';
import { DB_PARSER_VERSION } from '../../../server/core/dbSessionSync.js';
import { LmuParser } from '../../../server/sessions/parser.js';
import { initDbSchema } from '../../../server/core/dbSchema.js';

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

  it('skips stored write-once XMLs without stat or parsing, but supports an explicit reparse', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-session-immutable-'));
    tempDir = dir;
    const database = new SessionDatabase(':memory:');
    db = database;
    const fixture = path.join(process.cwd(), 'test', 'fixtures', 'results', '2026_05_28_P1.xml');
    const filePath = path.join(dir, 'immutable.xml');
    fs.copyFileSync(fixture, filePath);
    const parser = new LmuParser(undefined, undefined, { detectPlayer: false });
    database.syncSessionsFromDir(dir, parser);

    // Ordinary scans trust the stored path even if an external tool touches the file.
    fs.appendFileSync(filePath, '\n');
    const stat = vi.spyOn(fs, 'statSync');
    const parse = vi.spyOn(parser, 'parseSessionXml');
    expect(database.syncSessionsFromDir(dir, parser)).toMatchObject({ added: 0, updated: 0, total: 1 });
    expect(stat).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();

    expect(database.syncSessionsFromDir(dir, parser, true)).toMatchObject({ added: 0, updated: 1, total: 1 });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('repairs Fuji layouts and preserves them across startup (XML retained: %s)', (keepXml) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-fuji-repair-'));
    tempDir = dir;
    const database = new SessionDatabase(':memory:');
    db = database;
    const xml = fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'results', '2026_05_28_P1.xml'), 'utf8');
    const cases = [
      { name: 'classic', course: '', length: 4502, key: 'fuji_classic' },
      { name: 'chicane', course: '', length: 4535.8, key: 'fuji_chicane' },
      { name: 'grand-prix', course: 'Grand Prix', length: 4535.8, key: 'fuji_chicane' },
    ];
    for (const item of cases) {
      fs.writeFileSync(path.join(dir, `${item.name}.xml`), xml
        .replace('<TrackVenue>Spa</TrackVenue>', '<TrackVenue>Fuji Speedway</TrackVenue>')
        .replace('<TrackCourse>Grand Prix</TrackCourse>', `<TrackCourse>${item.course}</TrackCourse>`)
        .replace('<TrackLength>7004.0</TrackLength>', `<TrackLength>${item.length}</TrackLength>`));
    }
    const parser = new LmuParser(undefined, undefined, { detectPlayer: false });
    database.syncSessionsFromDir(dir, parser);
    const sql = database.getDb();
    const layouts = () => sql.prepare(`SELECT s.filename,s.layout_key,a.layout_key AS fact_layout_key
      FROM sessions s JOIN session_summary_facts a ON a.session_id=s.id ORDER BY s.filename`).all();
    const expected = cases.map(item => ({ filename: `${item.name}.xml`, layout_key: item.key, fact_layout_key: item.key }))
      .sort((left, right) => left.filename.localeCompare(right.filename));
    expect(layouts()).toEqual(expected);
    // Starting the schema repeatedly must preserve the correctly classified Classic session.
    initDbSchema(sql);
    expect(layouts()).toEqual(expected);

    // Simulate the historical threshold error and the unsafe migration's Classic overwrite.
    sql.exec(`UPDATE sessions SET layout_key=CASE WHEN filename='classic.xml' THEN 'fuji_chicane' ELSE 'fuji_classic' END;
      UPDATE session_summary_facts SET layout_key=(SELECT layout_key FROM sessions WHERE id=session_id)`);
    database.setMetadata('parser_version', '2.20_canonical_car_classes');
    if (!keepXml) for (const item of cases) fs.unlinkSync(path.join(dir, `${item.name}.xml`));
    const parse = vi.spyOn(parser, 'parseSessionXml');
    const result = database.syncSessionsFromDir(dir, parser);
    expect(result).toMatchObject({ added: 0, updated: keepXml ? 3 : 0, total: 3 });
    expect(parse).toHaveBeenCalledTimes(keepXml ? 3 : 0);
    expect(database.getMetadata('parser_version')).toBe(DB_PARSER_VERSION);
    expect(layouts()).toEqual(expected);
    initDbSchema(sql);
    expect(layouts()).toEqual(expected);
    parse.mockClear();
    database.syncSessionsFromDir(dir, parser);
    expect(parse).not.toHaveBeenCalled();
    expect(layouts()).toEqual(expected);
  });

  it('reparses old stream event ownership while preserving sessions whose XML was deleted', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-stream-identity-'));
    tempDir = dir;
    const database = new SessionDatabase(':memory:');
    db = database;
    const xml = `<rFactorXML><RaceResults><TrackVenue>Spa</TrackVenue><Race>
      <Stream><TrackLimits Driver="Ann Smith" Lap="1" et="150">Warning</TrackLimits></Stream>
      ${['Ann Smithson', 'Ann Smith'].map(name => `<Driver><Name>${name}</Name>
        <CarType>Test Car</CarType><CarClass>GT3</CarClass>
        <Lap num="1" et="120">120</Lap><Lap num="2" et="240">120</Lap>
      </Driver>`).join('')}
      </Race></RaceResults></rFactorXML>`;
    const parser = new LmuParser(undefined, undefined, { detectPlayer: false });
    for (const name of ['available.xml', 'deleted.xml']) fs.writeFileSync(path.join(dir, name), xml);
    database.syncSessionsFromDir(dir, parser);

    // Model the old substring matcher assigning the exact driver's event to the earlier prefix.
    for (const session of database.iterateDetailedSessions()) {
      const [prefix, exact] = session.drivers;
      prefix.trackLimits = exact.trackLimits;
      delete exact.trackLimits;
      database.upsertSession(session, path.join(dir, session.filename), 1, 1);
    }
    database.setMetadata('parser_version', '2.22_fuji_layout_repair_exact_player_identity');
    fs.rmSync(path.join(dir, 'deleted.xml'));
    const archived = Array.from(database.iterateDetailedSessions()).find(s => s.filename === 'deleted.xml');

    expect(database.syncSessionsFromDir(dir, parser)).toMatchObject({ updated: 1, total: 2 });
    const sessions = Array.from(database.iterateDetailedSessions());
    const repaired = sessions.find(s => s.filename === 'available.xml');
    expect(repaired?.drivers.map(d => d.trackLimits?.length ?? 0)).toEqual([0, 1]);
    expect(lapEvents(repaired!.drivers[1], 2).trackLimits).toHaveLength(1);
    expect(sessions.find(s => s.filename === 'deleted.xml')).toEqual(archived);
    expect(database.getMetadata('parser_version')).toBe(DB_PARSER_VERSION);
    expect(database.syncSessionsFromDir(dir, parser)).toMatchObject({ updated: 0, total: 2 });
  });

  it('does not store an XML that changed while it was read, and reads it again on the next scan', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-session-growing-'));
    tempDir = dir;
    const database = new SessionDatabase(':memory:');
    db = database;
    const filePath = path.join(dir, 'growing.xml');
    fs.copyFileSync(path.join(process.cwd(), 'test', 'fixtures', 'results', '2026_05_28_P1.xml'), filePath);
    const parser = new LmuParser(undefined, undefined, { detectPlayer: false });
    const parse = parser.parseSessionXml.bind(parser);
    // LMU appends to the file during the read.
    vi.spyOn(parser, 'parseSessionXml').mockImplementationOnce(file => {
      const parsed = parse(file);
      fs.appendFileSync(filePath, '\n');
      return parsed;
    });

    expect(database.syncSessionsFromDir(dir, parser)).toMatchObject({ added: 0, total: 0 });
    expect(database.getIngestErrors()).toMatchObject([{ sourceType: 'xml', sourcePath: filePath }]);
    expect(database.syncSessionsFromDir(dir, parser)).toMatchObject({ added: 1, total: 1 });
    expect(database.getIngestErrors()).toEqual([]);
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
    const originalSessions = Array.from(database.iterateDetailedSessions());
    expect(originalSessions).toHaveLength(10);
    database.setMetadata('parser_version', 'older-parser-version');

    const writeSpy = vi.spyOn(database, 'upsertSession').mockImplementationOnce(() => {
      throw new Error('temporary write failure');
    });
    expect(() => database.syncSessionsFromDir(dir, parser)).toThrow('temporary write failure');
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(database.getMetadata('parser_version')).toBe('older-parser-version');
    expect(Array.from(database.iterateDetailedSessions())).toEqual(originalSessions);

    writeSpy.mockRestore();
    const parseSpy = vi.spyOn(parser, 'parseSessionXml');
    const retry = database.syncSessionsFromDir(dir, parser);

    expect(parseSpy).toHaveBeenCalledTimes(10);
    expect(retry).toMatchObject({ added: 0, updated: 10, total: 10 });
    expect(database.getMetadata('parser_version')).toBe(DB_PARSER_VERSION);
    expect(Array.from(database.iterateDetailedSessions())).toHaveLength(10);
  });
});

describe('a file that cannot be read during a scan', () => {
  let tempDir: string | null = null;
  let db: SessionDatabase | null = null;

  afterEach(() => {
    db?.close();
    db = null;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
    vi.restoreAllMocks();
  });

  it('is read again at the next scan, even when it did not change, so a parser upgrade reaches it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-session-retry-unread-'));
    tempDir = dir;
    db = new SessionDatabase(':memory:');
    const fixture = path.join(process.cwd(), 'test', 'fixtures', 'results', '2026_05_28_P1.xml');
    for (const name of ['a.xml', 'b.xml']) fs.copyFileSync(fixture, path.join(dir, name));
    const parser = new LmuParser(undefined, undefined, { detectPlayer: false });
    db.syncSessionsFromDir(dir, parser);
    db.setMetadata('parser_version', 'older-parser-version');

    // During the upgrade, b.xml cannot be read (locked, or its worker died).
    const parse = parser.parseSessionXml.bind(parser);
    const spy = vi.spyOn(parser, 'parseSessionXml').mockImplementation(filePath => filePath.endsWith('b.xml') ? null : parse(filePath));
    expect(db.syncSessionsFromDir(dir, parser)).toMatchObject({ updated: 1 });
    expect(db.getMetadata('parser_version')).toBe(DB_PARSER_VERSION);

    spy.mockRestore();
    const reread = vi.spyOn(parser, 'parseSessionXml');
    expect(db.syncSessionsFromDir(dir, parser)).toMatchObject({ updated: 1 });
    expect(reread.mock.calls.map(([filePath]) => path.basename(filePath))).toEqual(['b.xml']);
    expect(db.getIngestErrors().filter(entry => entry.sourceType === 'xml')).toEqual([]);
  });
});

describe('session sync with the XML worker', () => {
  let tempDir: string | null = null;
  let db: SessionDatabase | null = null;

  afterEach(() => {
    db?.close();
    db = null;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it('reads a file on the main thread when the worker fails, so the session still shows', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-session-worker-fallback-'));
    tempDir = dir;
    db = new SessionDatabase(':memory:');
    const fixture = path.join(process.cwd(), 'test', 'fixtures', 'results', '2026_05_28_P1.xml');
    fs.copyFileSync(fixture, path.join(dir, '2026_10_05_21_22_50-68R1.xml'));
    const parser = new LmuParser(undefined, undefined, { detectPlayer: false });

    const iterator = db.syncSessionsAsyncIterator(dir, {
      setReplayLookup: lookup => parser.setReplayLookup(lookup),
      parseSessionXml: filePath => parser.parseSessionXml(filePath),
      parseSessionXmlAsync: () => Promise.reject(new Error('File ingest worker exited with code 1')),
    });
    let step = await iterator.next();
    while (!step.done) step = await iterator.next();

    expect(step.value).toMatchObject({ added: 1, total: 1 });
    expect(Array.from(db.iterateDetailedSessions())).toHaveLength(1);
  });
});
