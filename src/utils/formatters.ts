export function formatTime(seconds: number | string | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === '') return '--:--.---';
  const num = typeof seconds === 'number' ? seconds : parseFloat(String(seconds));
  if (isNaN(num) || num <= 0) return '--:--.---';
  const mins = Math.floor(num / 60);
  const secs = (num % 60).toFixed(3);
  const secsPadded = parseFloat(secs) < 10 ? `0${secs}` : secs;
  return `${mins}:${secsPadded}`;
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

  // If course is generic GP/Grand Prix/Full/WEC, omit layout string
  if (cNorm === 'gp' || cNorm === 'grand prix' || cNorm === 'full' || cNorm === 'wec') {
    return venue;
  }

  // If venue already includes the full course string
  if (vNorm.includes(cNorm)) {
    return venue;
  }

  let cleanCourse = course.trim();

  // Remove leading venue name or prefix e.g. "Paul Ricard - 1A-V2-Short" -> "1A-V2-Short"
  cleanCourse = cleanCourse.replace(/^[a-zA-Z\s]+-\s*/, (match) => {
    const matchNorm = match.toLowerCase();
    if (vNorm.split(' ').some(word => word.length > 2 && matchNorm.includes(word))) {
      return '';
    }
    return match;
  });

  // Filter out redundant venue location words from course string
  const venueWords = venue.split(/[\s\-_]+/).map(w => w.toLowerCase()).filter(w => w.length > 2);
  const courseWords = cleanCourse.split(/[\s\-_]+/);
  
  const filteredWords = courseWords.filter(word => {
    const wordLower = word.toLowerCase();
    return !venueWords.some(vw => vw === wordLower && !['circuit', 'course', 'layout'].includes(vw));
  });

  cleanCourse = filteredWords.join(' ').replace(/^-\s*/, '').trim();

  if (!cleanCourse) {
    return venue;
  }

  return `${venue} (${cleanCourse})`;
}

export function matchesSessionType(sessionType: string = '', sessionName: string = '', filterType: string = 'All'): boolean {
  if (!filterType || filterType === 'All') return true;
  const f = filterType.toLowerCase().trim();
  const t = (sessionType || '').toLowerCase().trim();
  const n = (sessionName || '').toLowerCase().trim();

  if (f === 'practice') {
    return t === 'practice' || n.startsWith('p') || n.includes('practice');
  }
  if (f === 'qualifying') {
    return t === 'qualifying' || t === 'qualify' || n.startsWith('q') || n.includes('qual');
  }
  if (f === 'race') {
    return t === 'race' || n.startsWith('r') || n.includes('race');
  }
  return t === f || n === f || n.includes(f) || t.includes(f);
}

export function parseDateStringToTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const clean = dateStr.replace(/\//g, '-');
  const time = new Date(clean).getTime();
  return isNaN(time) ? 0 : time;
}

export function computeTheoreticalBest(s1: number | null, s2: number | null, s3: number | null): number | null {
  if (s1 !== null && s2 !== null && s3 !== null) {
    return parseFloat((s1 + s2 + s3).toFixed(3));
  }
  return null;
}

