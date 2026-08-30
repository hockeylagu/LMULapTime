export function formatTime(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds <= 0) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
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

