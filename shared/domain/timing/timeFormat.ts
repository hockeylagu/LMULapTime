export function formatTime(seconds: number | string | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === '') return '--:--.---';
  const num = typeof seconds === 'number' ? seconds : parseFloat(String(seconds));
  if (isNaN(num) || num <= 0) return '--:--.---';
  if (!Number.isFinite(num)) return '--:--.---';
  const ms = Math.round(num * 1000);
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
}

export function formatElapsedSeconds(seconds: number | string | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === '') return '--:--';
  const num = typeof seconds === 'number' ? seconds : parseFloat(String(seconds));
  if (isNaN(num) || num < 0) return '--:--';
  if (!Number.isFinite(num)) return '--:--';
  const tenths = Math.round(num * 10);
  const hours = Math.floor(tenths / 36000);
  const remainder = tenths % 36000;
  const mins = Math.floor(remainder / 600);
  const secs = ((remainder % 600) / 10).toFixed(1);
  const formattedSecs = secs.padStart(4, '0');
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${formattedSecs}`;
  }
  return `${mins}:${formattedSecs}`;
}

export function parseTimeStringToSeconds(timeStr: string | number): number | null {
  if (typeof timeStr === 'number') return isNaN(timeStr) || timeStr <= 0 ? null : timeStr;
  if (!timeStr) return null;
  const str = String(timeStr).trim();
  if (str === '--.----' || str === '--.---' || str === '--:--.---' || str === '') return null;
  
  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length === 2) {
      const mins = parseFloat(parts[0]);
      const secs = parseFloat(parts[1]);
      if (!isNaN(mins) && !isNaN(secs) && mins >= 0 && secs >= 0) {
        const total = mins * 60 + secs;
        return total > 0 ? total : null;
      }
    } else if (parts.length === 3) {
      const hours = parseFloat(parts[0]);
      const mins = parseFloat(parts[1]);
      const secs = parseFloat(parts[2]);
      if (!isNaN(hours) && !isNaN(mins) && !isNaN(secs) && hours >= 0 && mins >= 0 && secs >= 0) {
        const total = hours * 3600 + mins * 60 + secs;
        return total > 0 ? total : null;
      }
    }
    return null;
  }
  
  const val = parseFloat(str);
  return isNaN(val) || val <= 0 ? null : val;
}

/** The time a pit stop cost against the driver's clean lap pace, e.g. "+13.4s". */
export function formatPitStopDuration(seconds: number): string {
  return `+${seconds.toFixed(1)}s`;
}
