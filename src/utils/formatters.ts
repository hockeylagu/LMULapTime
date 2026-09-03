export function formatTime(seconds: number | string | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === '') return '--:--.---';
  const num = typeof seconds === 'number' ? seconds : parseFloat(String(seconds));
  if (isNaN(num) || num <= 0) return '--:--.---';
  const mins = Math.floor(num / 60);
  const secs = (num % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
}

export function formatElapsedSeconds(seconds: number | string | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === '') return '--:--';
  const num = typeof seconds === 'number' ? seconds : parseFloat(String(seconds));
  if (isNaN(num) || num < 0) return '--:--';
  const hours = Math.floor(num / 3600);
  const remainder = num % 3600;
  const mins = Math.floor(remainder / 60);
  const secs = (remainder % 60).toFixed(1);
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
      if (!isNaN(mins) && !isNaN(secs)) {
        return mins * 60 + secs;
      }
    }
  }
  
  const val = parseFloat(str);
  return isNaN(val) || val <= 0 ? null : val;
}

export function isSessionEmpty(session: {
  playerDriver?: { lapsCount?: number; bestLapTime?: number | null };
  driversCount?: number;
}): boolean {
  if (!session.playerDriver) return (session.driversCount ?? 0) === 0;
  return (session.playerDriver.lapsCount ?? 0) === 0 || session.playerDriver.bestLapTime === null;
}

export function getDisplayTrackName(venue: string = '', course: string = ''): string {
  if (!course || course.trim() === '') {
    return venue;
  }

  const vNorm = venue.toLowerCase();
  const cNorm = course.toLowerCase().trim();

  // If course is generic GP/Grand Prix/Full/WEC/12h/24h/Road Course, omit layout string
  if (
    cNorm === 'gp' ||
    cNorm === 'grand prix' ||
    cNorm === 'full' ||
    cNorm === 'wec' ||
    cNorm === '12h' ||
    cNorm === '12 hours' ||
    cNorm === '24h' ||
    cNorm === '24 heures' ||
    cNorm === 'road course' ||
    vNorm.includes(cNorm)
  ) {
    return venue;
  }

  let cleanCourse = course.trim();

  // Remove leading venue name or prefix e.g. "Paul Ricard - 1A-V2-Short" -> "1A-V2-Short"
  cleanCourse = cleanCourse.replace(/^[a-zA-Z\s]+-\s*/, (match) => {
    const matchNorm = match.toLowerCase();
    return vNorm.split(' ').some(word => word.length > 2 && matchNorm.includes(word)) ? '' : match;
  });

  // Filter out redundant venue location words from course string
  const venueWords = venue.split(/[\s\-_]+/).map(w => w.toLowerCase()).filter(w => w.length > 2);
  const courseWords = cleanCourse.split(/[\s\-_]+/);
  
  const filteredWords = courseWords.filter(word => {
    const wordLower = word.toLowerCase();
    return !venueWords.some(vw => vw === wordLower && !['circuit', 'course', 'layout'].includes(vw));
  });

  cleanCourse = filteredWords.join(' ').replace(/^-\s*/, '').trim();
  return cleanCourse ? `${venue} (${cleanCourse})` : venue;
}

export function matchesSessionType(sessionType: string = '', sessionName: string = '', filterType: string = 'All'): boolean {
  if (!filterType || filterType === 'All') return true;
  const f = filterType.toLowerCase().trim();
  const t = (sessionType || '').toLowerCase().trim();
  const n = (sessionName || '').toLowerCase().trim();

  switch (f) {
    case 'practice':
      return t === 'practice' || n.startsWith('p') || n.includes('practice');
    case 'qualifying':
      return t === 'qualifying' || t === 'qualify' || n.startsWith('q') || n.includes('qual');
    case 'race':
      return t === 'race' || n.startsWith('r') || n.includes('race');
    default:
      return t === f || n === f || n.includes(f) || t.includes(f);
  }
}

export function parseDateStringToTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const time = new Date(dateStr.replace(/\//g, '-')).getTime();
  return isNaN(time) ? 0 : time;
}

export function computeTheoreticalBest(s1: number | null, s2: number | null, s3: number | null): number | null {
  if (s1 !== null && s2 !== null && s3 !== null && s1 > 0 && s2 > 0 && s3 > 0) {
    return parseFloat((s1 + s2 + s3).toFixed(3));
  }
  return null;
}

/**
 * Returns chronological weight for session types and names.
 * Practice (100-199) < Qualifying (200-299) < Warmup (250) < Race (300-399).
 * Higher weight means later in the weekend / newer.
 */
export function getSessionTypeWeight(sessionType?: string, sessionName?: string): number {
  const type = (sessionType || '').toLowerCase();
  const name = (sessionName || '').toLowerCase();

  // Practice: 100 - 199
  if (type.includes('practice') || name.startsWith('p') || name.startsWith('fp')) {
    const num = parseInt(name.replace(/\D/g, ''), 10);
    return 100 + (isNaN(num) ? 1 : Math.min(num, 99));
  }

  // Qualifying: 200 - 299
  if (type.includes('qualif') || name.startsWith('q') || name.includes('hyperpole')) {
    const num = parseInt(name.replace(/\D/g, ''), 10);
    return 200 + (isNaN(num) ? 1 : Math.min(num, 99));
  }

  // Warmup: 250
  if (type.includes('warmup') || name.startsWith('w')) {
    return 250;
  }

  // Race: 300 - 399
  if (type.includes('race') || name.startsWith('r')) {
    const num = parseInt(name.replace(/\D/g, ''), 10);
    return 300 + (isNaN(num) ? 1 : Math.min(num, 99));
  }

  return 0;
}

export interface SessionComparable {
  timeString?: string;
  dateString?: string;
  timestamp?: number;
  sessionType?: string;
  sessionName?: string;
  id?: string;
}

/**
 * Compares two sessions chronologically.
 * When dates/timestamps are equal or in the same event, Race is after Qualifying (so newer).
 */
export function compareSessions(
  a: SessionComparable,
  b: SessionComparable,
  direction: 'desc' | 'asc' = 'desc'
): number {
  const timeA = a.timestamp || parseDateStringToTimestamp(a.timeString || a.dateString);
  const timeB = b.timestamp || parseDateStringToTimestamp(b.timeString || b.dateString);

  // If timestamps differ by more than 1 second, sort by timestamp
  if (Math.abs(timeA - timeB) >= 1000) {
    return direction === 'desc' ? timeB - timeA : timeA - timeB;
  }

  // Within the same second or identical dates, order by session type:
  // Race (300) > Quali (200) > Practice (100)
  const weightA = getSessionTypeWeight(a.sessionType, a.sessionName);
  const weightB = getSessionTypeWeight(b.sessionType, b.sessionName);

  if (weightA !== weightB) {
    return direction === 'desc' ? weightB - weightA : weightA - weightB;
  }

  if (timeA !== timeB) {
    return direction === 'desc' ? timeB - timeA : timeA - timeB;
  }

  const idA = a.id || '';
  const idB = b.id || '';
  return direction === 'desc' ? idB.localeCompare(idA) : idA.localeCompare(idB);
}

