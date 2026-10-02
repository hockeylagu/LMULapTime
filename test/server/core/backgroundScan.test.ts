import { describe, expect, it } from 'vitest';
import { pumpScanInBackground, ScanOutcome, ScanProgress, ScanRunStatus, startedScanStatus } from '../../../server/core/backgroundScan.js';

function settled<R>(iterator: AsyncIterator<ScanProgress, R, void>, status: ScanRunStatus<R>, seen: ScanProgress[] = []): Promise<ScanOutcome<R>> {
  return new Promise(resolve => {
    const recording: AsyncIterator<ScanProgress, R, void> = {
      next: async () => {
        const step = await iterator.next();
        if (!step.done) seen.push({ ...step.value });
        return step;
      },
    };
    pumpScanInBackground(recording, status, resolve);
  });
}

describe('pumpScanInBackground', () => {
  it('mirrors each progress step into the status and ends with the result', async () => {
    async function* scan(): AsyncGenerator<ScanProgress, { total: number }, void> {
      yield { processed: 1, total: 2, currentFile: 'a.xml', stage: 'parse', filePercent: 50 };
      yield { processed: 2, total: 2, currentFile: 'b.xml' };
      return { total: 2 };
    }
    const status: ScanRunStatus<{ total: number }> = startedScanStatus();
    const seen: ScanProgress[] = [];

    const outcome = await settled(scan(), status, seen);

    expect(seen).toHaveLength(2);
    expect(outcome).toEqual({ result: { total: 2 } });
    expect(status).toMatchObject({
      running: false, processed: 2, total: 2, currentFile: null, currentStage: null, filePercent: null,
      result: { total: 2 }, error: null,
    });
    expect(status.finishedAt).not.toBeNull();
  });

  it('stops on an error and records its message', async () => {
    async function* scan(): AsyncGenerator<ScanProgress, number, void> {
      yield { processed: 1, total: 3, currentFile: 'a.Vcr', stage: 'decode', filePercent: 10 };
      throw new Error('disk gone');
    }
    const status: ScanRunStatus<number> = startedScanStatus();

    const outcome = await settled(scan(), status);

    expect('error' in outcome).toBe(true);
    expect(status).toMatchObject({ running: false, processed: 1, error: 'disk gone', result: null, currentStage: null, filePercent: null });
  });

  it('does not run a step on the calling turn', () => {
    let steps = 0;
    const iterator: AsyncIterator<ScanProgress, number, void> = {
      next: async () => { steps++; return { done: true, value: 0 }; },
    };
    pumpScanInBackground(iterator, startedScanStatus(), () => undefined);
    expect(steps).toBe(0);
  });
});
