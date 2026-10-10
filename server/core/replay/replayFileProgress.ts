/** One file's progress across driver decodes, reserving each driver's final 5% for storage. */
export class ReplayFileProgress {
  private completed = 0;
  private lastPercent = 5;

  public constructor(private total: number) {}

  /** A primary decode can also satisfy a queued explicit driver slot. */
  public removeDuplicate(): void {
    this.total--;
  }

  /** If the primary worker fails, its explicit slot still needs its own attempt. */
  public restoreDuplicate(): void {
    this.total++;
  }

  public decoding(percent: number): number {
    return this.percent(Math.min(100, Math.max(0, percent)) * 0.95);
  }

  public saving(): number {
    return this.percent(95);
  }

  public complete(): number {
    this.completed++;
    return this.percent(0);
  }

  private percent(current: number): number {
    if (this.total <= 0 || this.completed >= this.total) return 100;
    this.lastPercent = Math.max(this.lastPercent, Math.min(99, Math.floor(5 + 95 * (this.completed + current / 100) / this.total)));
    return this.lastPercent;
  }
}
