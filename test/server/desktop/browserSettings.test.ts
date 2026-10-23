import { describe, expect, it } from 'vitest';
import { readBrowserSettings, saveBrowserMonitor } from '../../../server/desktop/browserSettings.js';

describe.skipIf(process.platform !== 'win32')('native monitor settings protocol', () => {
  it('reads the connected displays without opening a browser or tray', async () => {
    const settings = await readBrowserSettings();
    expect(settings.supported).toBe(true);
    expect(settings.monitors.length).toBeGreaterThan(0);
    for (const monitor of settings.monitors) {
      expect(monitor.id).toMatch(/^\\\\\.\\DISPLAY\d+$/);
      expect(monitor.width).toBeGreaterThan(0);
      expect(monitor.height).toBeGreaterThan(0);
    }
  });

  it('rejects an invalid monitor and leaves the saved preference intact', async () => {
    const before = await readBrowserSettings();
    await expect(saveBrowserMonitor('not-a-display')).rejects.toThrow();
    expect((await readBrowserSettings()).monitor).toBe(before.monitor);
  });
});
