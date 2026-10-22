import { describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { readPitLaneLoss, recordPitLaneLoss } from '../../../../server/core/live/dbPitLaneStore.js';

describe('pit lane loss store', () => {
  it('keeps the median of the newest 20 stops per layout and class, a stop stored again replaced', () => {
    const db = new SessionDatabase(':memory:').getDb();
    const stop = (key: string, lossSeconds: number, measuredAt: number, layoutKey = 'sarthe_full', carClass = 'Hyper') =>
      recordPitLaneLoss(db, { stopKey: key, layoutKey, carClass, lossSeconds, measuredAt });
    expect(readPitLaneLoss(db, 'sarthe_full', 'Hyper')).toBeNull();
    stop('a|13', 29.3, 1);
    stop('b|9', 31, 2);
    stop('c|20', 27, 3);
    expect(readPitLaneLoss(db, 'sarthe_full', 'Hyper')).toBe(29.3);
    // Another class and another layout of the facility never mix in.
    stop('d|5', 90, 4, 'sarthe_full', 'GT3');
    stop('e|5', 90, 5, 'sarthe_mulsanne', 'Hyper');
    expect(readPitLaneLoss(db, 'sarthe_full', 'Hyper')).toBe(29.3);
    // A backfill run again replaces its stop instead of counting it twice.
    stop('a|13', 33, 1);
    expect(readPitLaneLoss(db, 'sarthe_full', 'Hyper')).toBe(31);
    // Only the newest 20 count.
    for (let index = 0; index < 20; index += 1) stop(`new|${index}`, 40, 10 + index);
    expect(readPitLaneLoss(db, 'sarthe_full', 'Hyper')).toBe(40);
  });
});
