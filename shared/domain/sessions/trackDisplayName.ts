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
