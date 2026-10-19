/** Short, bounded run-on between scoring frames. Source corrections never move the same lap backwards. */
export class LapDisplayClock {
  private lap: number | null = null;
  private source: number | null = null;
  private shown: number | null = null;
  private anchor = 0;
  private anchorAt = 0;
  private changedAt = 0;
  private running = true;

  public update(lap: number, seconds: number | null | undefined, now: number, running: boolean): void {
    const valid = seconds != null && Number.isFinite(seconds) && seconds >= 0;
    if (!valid) { this.lap = null; this.source = null; this.shown = null; return; }
    if (lap !== this.lap || this.source === null) {
      this.lap = lap; this.source = seconds; this.shown = seconds;
      this.anchor = seconds; this.anchorAt = now; this.changedAt = now; this.running = running;
      return;
    }
    this.read(now);
    if (seconds > this.source) { this.source = seconds; this.changedAt = now; }
    this.anchor = Math.max(this.shown ?? seconds, seconds);
    this.anchorAt = now;
    this.running = running;
  }

  public read(now: number): number | null {
    if (this.source === null || this.shown === null) return null;
    const elapsed = this.running ? Math.max(0, Math.min(now, this.changedAt + 250) - this.anchorAt) / 1000 : 0;
    this.shown = Math.max(this.shown, Math.min(this.source + 0.25, this.anchor + elapsed));
    return this.shown;
  }

  public advancing(now: number): boolean {
    return this.running && this.source !== null && now < this.changedAt + 250;
  }
}
