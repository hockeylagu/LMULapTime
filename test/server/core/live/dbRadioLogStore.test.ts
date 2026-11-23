import { describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { logRadioCall, readSessionRadioCalls, settleRadioCall } from '../../../../server/core/live/dbRadioLogStore.js';

describe('radio call log', () => {
  it("keeps every call of a session's recordings in game-time order, settled once after it was sent", () => {
    const db = new SessionDatabase(':memory:').getDb();
    const entry = { runId: 'run', recordingId: 'rec', lap: 4, priority: 2 as const, family: 'strategy' as const, outcome: 'queued' as const };
    const late = logRadioCall(db, { ...entry, gameTime: 120, key: 'b', text: 'Second.' });
    const early = logRadioCall(db, { ...entry, gameTime: 60, key: 'a', text: 'First.' });
    logRadioCall(db, { ...entry, recordingId: 'other', gameTime: 10, key: 'c', text: 'Elsewhere.' });
    expect(settleRadioCall(db, early, 'sent')).toBe(true);
    expect(settleRadioCall(db, early, 'spoken')).toBe(true);
    // A second page, or a late report, never rewrites a settled call.
    expect(settleRadioCall(db, early, 'interrupted')).toBe(false);
    expect(settleRadioCall(db, late, 'expired')).toBe(true);
    expect(settleRadioCall(db, 999, 'spoken')).toBe(false);
    // Only recordings matched to the session count.
    const capture = db.prepare(`INSERT INTO live_capture_index(recording_id, filename, manifest_json, started_at, updated_at, session_id)
      VALUES(?, 'f', '{}', 0, 0, ?)`);
    capture.run('rec', 'S1');
    capture.run('other', 'S2');
    expect(readSessionRadioCalls(db, 'S1').map(row => [row.text, row.lap, row.outcome])).toEqual([
      ['First.', 4, 'spoken'], ['Second.', 4, 'expired'],
    ]);
  });
});
