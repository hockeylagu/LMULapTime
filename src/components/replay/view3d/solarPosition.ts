/**
 * The sun's elevation and compass bearing at a place and local clock time, by the standard NOAA solar-position approximation
 * (fractional-year series for the equation of time and declination). Accurate to a few hundredths of a degree, far below what a
 * shadow shows.
 */
export function solarPosition(latitudeDeg: number, longitudeDeg: number, date: string, minuteOfDay: number, utcOffsetHours: number): {elevationDeg: number; bearingDeg: number} {
  const [year, month, day] = date.split('-').map(Number);
  const dayOfYear = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  const gamma = 2 * Math.PI / 365 * (dayOfYear - 1 + (minuteOfDay / 60 - 12) / 24);
  const equationOfTimeMin = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.001480 * Math.sin(3 * gamma);
  const solarTimeMin = minuteOfDay + equationOfTimeMin + 4 * longitudeDeg - 60 * utcOffsetHours;
  const hourAngle = (solarTimeMin / 4 - 180) * Math.PI / 180, latitude = latitudeDeg * Math.PI / 180;
  const cosZenith = Math.min(1, Math.max(-1, Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)));
  const zenith = Math.acos(cosZenith);
  // Angle from due north toward the east, then mirrored for the afternoon (sun west of the meridian).
  const cosFromNorth = Math.min(1, Math.max(-1, (Math.sin(declination) - Math.sin(latitude) * cosZenith) / (Math.cos(latitude) * Math.sin(zenith))));
  const fromNorthDeg = Math.acos(cosFromNorth) * 180 / Math.PI;
  return {elevationDeg: 90 - zenith * 180 / Math.PI, bearingDeg: hourAngle > 0 ? 360 - fromNorthDeg : fromNorthDeg};
}
