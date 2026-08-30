export function formatTime(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds <= 0) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  const secsPadded = parseFloat(secs) < 10 ? `0${secs}` : secs;
  return `${mins}:${secsPadded}`;
}

export function parseTimeStringToSeconds(timeStr: string | number): number | null {
  if (typeof timeStr === 'number') return isNaN(timeStr) || timeStr <= 0 ? null : timeStr;
  if (!timeStr || timeStr === '--.----' || timeStr === '--.---') return null;
  const val = parseFloat(timeStr);
  return isNaN(val) || val <= 0 ? null : val;
}

export function isSessionEmpty(session: {
  playerDriver?: { lapsCount?: number; bestLapTime?: number | null };
  driversCount?: number;
}): boolean {
  if (!session.playerDriver) return (session.driversCount ?? 0) === 0;
  return (session.playerDriver.lapsCount ?? 0) === 0 || session.playerDriver.bestLapTime === null;
}

