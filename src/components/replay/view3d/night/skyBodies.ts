/**
 * The sun and the moon as the game's sky middleware places them (docs/SCENE_PACKAGE.md "Night"; the pipeline's night research traced the
 * series in the executable): low-precision ecliptic series (the moon geocentric, no parallax), the middleware's refraction (also below the
 * horizon), azimuth clockwise from north, which is the game world's bearing (atan2(x, z)). The night model works on these refracted
 * elevations.
 */

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const wrapDeg = (x: number) => ((x % 360) + 360) % 360;

/** Julian date of a local clock time (Meeus); `utcOffsetHours` includes any daylight saving hour. */
function julianDate(year: number, month: number, day: number, localHours: number, utcOffsetHours: number): number {
  let y = year, m = month;
  if (m < 3) { y -= 1; m += 12; }
  return Math.floor(30.6001 * (m + 1)) + Math.floor(365.25 * y) + 1720996.5 - Math.floor(0.01 * y) + Math.floor(0.0025 * y) + day + (localHours - utcOffsetHours) / 24;
}

/** The sun's ecliptic longitude (radians) at Julian centuries T from J2000. */
function sunLongitude(T: number): number {
  const M = 6.24 + 628.302 * T;
  return 4.895048 + 628.331951 * T + (0.033417 - 0.000084 * T) * Math.sin(M) + 0.000351 * Math.sin(2 * M);
}

/** The moon's ecliptic longitude and latitude (radians) at Julian centuries T from J2000. */
function moonEcliptic(T: number): {lon: number; lat: number} {
  const S = Math.sin, F = 1.628 + 8433.4663 * T, l = 2.3554 + 8328.6911 * T, D = 5.1985 + 7771.3772 * T, ls = 6.23 + 628.3019 * T;
  const lon = 3.8104 + 8399.7091 * T + 0.1098 * S(l) + 0.0222 * S(2 * D - l) + 0.0115 * S(2 * D) + 0.0037 * S(2 * l) - 0.0032 * S(ls)
    - 0.002 * S(2 * F) + 0.001 * (S(2 * D - 2 * l) + S(2 * D - ls - l)) + 0.0007 * S(l - ls) + 0.0008 * S(2 * D - ls) + 0.0009 * S(2 * D + l)
    - 0.0006 * S(D) - 0.0005 * S(l + ls);
  const lat = 0.0895 * S(F) + 0.0049 * S(l + F) + 0.0048 * S(l - F) + 0.003 * S(2 * D - F) + 0.001 * S(2 * D + F - l)
    + 0.0008 * S(2 * D - F - l) + 0.0006 * S(2 * D + F);
  return {lon, lat};
}

/** An elevation (degrees) with the middleware's refraction added, also below the horizon. */
export function refracted(h: number): number {
  const r = h * RAD;
  let R = 0;
  if (r > 1.4835298625) R = 0;
  else if (r >= 0.0872664625) { const t = Math.tan(r); R = 0.01613888888888889 / t - 1.9444444444444445e-5 / t ** 3 + 2.388888888888889e-8 / t ** 5; }
  else if (r >= -0.0100356431875) R = 0.48194444444444445 + h * (-0.14394444444444446 + h * (0.028722222222222225 + h * (-0.0035527777777777775 + h * 0.0001975)));
  else R = -0.005770555555555556 / Math.tan(r);
  return h + R;
}

export interface SkyPosition {elevationDeg: number; bearingDeg: number}

/** Refracted elevation and bearing (clockwise from north) of an ecliptic position (radians). */
function horizontal(lon: number, lat: number, J: number, T: number, latitudeDeg: number, longitudeDeg: number): SkyPosition {
  const eps = 0.409093 - 0.000227 * T;
  const x = Math.cos(lat) * Math.cos(lon), y = Math.cos(lat) * Math.sin(lon), z = Math.sin(lat);
  const ye = y * Math.cos(eps) - z * Math.sin(eps), ze = y * Math.sin(eps) + z * Math.cos(eps);
  const ra = Math.atan2(ye, x), dec = Math.asin(ze), phi = latitudeDeg * RAD;
  const gmst = 4.894961 + 230121.675315 * (J - 2451545) / 36525, ha = gmst + longitudeDeg * RAD - ra;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return {elevationDeg: refracted(el * DEG), bearingDeg: wrapDeg(az * DEG)};
}

export interface SkyBodies {
  sun: SkyPosition;
  /** `phaseAngleDeg`: the sun–moon–earth angle (0 full, 180 new). */
  moon: SkyPosition & {phaseAngleDeg: number};
}

/** Where a venue's scene is and its clock: the scene's own place and its UTC offset on the race date (the package's night scene). */
export interface SkyPlace {latitudeDeg: number; longitudeDeg: number; utcOffsetHours: number}

/** The sun and the moon at a place, a date (YYYY-MM-DD) and a local clock time in seconds of the day. */
export function skyBodies(place: SkyPlace, date: string, localSeconds: number): SkyBodies {
  const [year, month, day] = date.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) throw Error(`Sky bodies: unreadable date ${date}`);
  // The middleware's terrestrial time: 65 s after universal time.
  const J = julianDate(year, month, day, localSeconds / 3600, place.utcOffsetHours), T = (J + 65 / 86400 - 2451545) / 36525;
  const sunLon = sunLongitude(T), moon = moonEcliptic(T);
  const elongationDeg = DEG * Math.acos(Math.cos(moon.lon - sunLon) * Math.cos(moon.lat));
  return {
    sun: horizontal(sunLon, 0, J, T, place.latitudeDeg, place.longitudeDeg),
    moon: {...horizontal(moon.lon, moon.lat, J, T, place.latitudeDeg, place.longitudeDeg), phaseAngleDeg: 180 - elongationDeg},
  };
}
