import { describe, it, expect } from 'vitest';
import { formatDuration } from '../../../src/components/settings/replays/replayModel.js';

describe('formatDuration', () => {
  it('rounds the total before splitting so seconds never read 60', () => {
    expect(formatDuration(59.5)).toBe('1:00');
    expect(formatDuration(839.6)).toBe('14:00');
    expect(formatDuration(839.4)).toBe('13:59');
  });

  it('shows minutes past an hour without an hours column', () => {
    expect(formatDuration(3600)).toBe('60:00');
  });

  it('shows a dash for missing or unusable values', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
  });
});

describe('visibleReplays error search', () => {
  it('finds a replay by the text of its error', async () => {
    const { visibleReplays, DEFAULT_REPLAY_SORT } = await import('../../../src/components/settings/replays/replayModel.js');
    const list = [
      { filename: 'Good.Vcr', error: null } as never,
      { filename: 'Bad.Vcr', error: 'Truncated stream' } as never,
    ];
    const filtered = visibleReplays(list, { text: 'truncated', show: 'all', sort: DEFAULT_REPLAY_SORT });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].filename).toBe('Bad.Vcr');
  });
});

describe('countReplays', () => {
  it('leaves out a file that could not be read: nothing of it is cached', async () => {
    const { countReplays } = await import('../../../src/components/settings/replays/replayModel.js');
    const counts = countReplays([
      { filename: 'Cached.Vcr', replayVersion: 'v7', isOnDisk: true, fileSizeBytes: 10, compressedSizeBytes: 5 } as never,
      { filename: 'Broken.Vcr', error: 'invalid header', replayVersion: 'v7', isOnDisk: true, fileSizeBytes: 10, compressedSizeBytes: 5 } as never,
      { filename: 'Unread.Vcr', error: 'not a replay', isOnDisk: true, fileSizeBytes: 99, compressedSizeBytes: 0 } as never,
    ]);
    expect(counts).toMatchObject({ total: 2, onDisk: 2, fileSizeBytes: 20 });
  });
});
