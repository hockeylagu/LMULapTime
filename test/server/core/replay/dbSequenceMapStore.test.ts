import { describe, expect, it } from 'vitest';
import { listSequenceCandidateLaps } from '../../../../server/core/replay/dbSequenceMapStore.js';
import { memoryDatabase } from '../../../helpers/memoryDatabase.js';

const FILE = 'Track R1 1.Vcr';

describe('listSequenceCandidateLaps', () => {
  it("takes the parser's clean dry laps of a matched session, else the replay's own flags", () => {
    const db = memoryDatabase().getDb();
    const replayLap = db.prepare('INSERT INTO replay_laps (filename, driver_slot, lap_number, lap_time_sec, is_valid, is_out_lap, source_version) VALUES (?, ?, ?, ?, ?, 0, 1)');
    // Slot 0 is the session's driver: its laps go by the parser. Slot 1 is no session driver: by the replay.
    for (const lapNumber of [2, 3, 4]) replayLap.run(FILE, 0, lapNumber, 90 + lapNumber, 1);
    replayLap.run(FILE, 1, 1, 95, 1);
    replayLap.run(FILE, 1, 2, 94, 1);
    replayLap.run(FILE, 1, 3, 93, 0);
    db.prepare('INSERT INTO replay_driver_roster (filename, driver_name, driver_slot) VALUES (?, ?, ?)').run(FILE, 'Ann Driver', 0);
    db.prepare('INSERT INTO replay_driver_roster (filename, driver_name, driver_slot) VALUES (?, ?, ?)').run(FILE, 'Guest', 1);
    db.prepare('INSERT INTO session_recordings (session_id, recording_name) VALUES (?, ?)').run('s1', FILE);
    db.prepare('INSERT INTO drivers (driver_id, name, normalized_name) VALUES (?, ?, ?)').run(7, 'ann driver ', 'ann driver');
    db.prepare('INSERT INTO session_drivers (session_id, driver_ordinal, driver_id) VALUES (?, ?, ?)').run('s1', 0, 7);
    const sessionLap = db.prepare(`INSERT INTO session_laps (session_id, driver_ordinal, lap_ordinal, lap_number, is_clean, condition_group)
      VALUES ('s1', 0, ?, ?, ?, ?)`);
    sessionLap.run(0, 2, 1, 'dry');
    sessionLap.run(1, 3, 0, 'dry'); // a pit stop or other lap the parser does not count
    sessionLap.run(2, 4, 1, 'wet');
    const laps = listSequenceCandidateLaps(db, FILE).map(({ slot, lapNumber }) => `${slot}:${lapNumber}`).sort();
    expect(laps).toEqual(['0:2', '1:2']);
  });
});
