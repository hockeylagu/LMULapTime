/**
 * The game's night light from the sun and the moon (skyBodies.ts) and the package's night model (docs/SCENE_PACKAGE.md "Night"): the
 * twilight's scattered light, the moon's light and its scattered share, the ambient as the game maps it, the fog and the light level that
 * switches the track lights. Every number comes from the package; the moon and the fog are fitted on the night captures there.
 */
import type { ScenerySkyNight } from '../../../../../shared/packageContract/index.js';
import type { SkyBodies } from './skyBodies.js';

type Rgb = [number, number, number];
type Rows = readonly [Rgb, Rgb, Rgb];

const RAD = Math.PI / 180;
const luminance = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const times = (rows: Rows, v: readonly number[]) => rows.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]) as Rgb;

/** The twilight's luminance (CIE Y, before the ambient mapping) at a refracted sun elevation: the table's lerp, ends held. */
export function twilightLuminance(model: ScenerySkyNight, sunElevationDeg: number): number {
  const {sunElevationDeg: degrees, illuminance, scale, sunScatteringScale, hdrScale} = model.twilight, last = degrees.length - 1;
  const e = Math.min(degrees[last], Math.max(degrees[0], sunElevationDeg));
  let i = 0;
  while (i < last - 1 && degrees[i + 1] <= e) i++;
  const f = (e - degrees[i]) / (degrees[i + 1] - degrees[i]);
  return ((1 - f) * illuminance[i] + f * illuminance[i + 1]) * scale / Math.PI * sunScatteringScale * hdrScale;
}

/** The twilight's linear RGB before the mapping, at its chromaticity, through the sky's XYZ to RGB rows. */
function twilightColour(model: ScenerySkyNight, xyzToRgb: Rows, sunElevationDeg: number): Rgb {
  const Y = twilightLuminance(model, sunElevationDeg), [x, y] = model.twilight.chromaticity;
  return times(xyzToRgb, [x * Y / y, Y, (1 - x - y) * Y / y]);
}

/** The game's ambient mapping of a light colour: lightColorToAmbient · c + (1 − it) · its length (the green where `useIntensity` is off). */
export function mapAmbient(model: ScenerySkyNight, colour: Rgb): Rgb {
  const {lightColorToAmbient: k, useIntensity} = model.ambientMapping, length = useIntensity ? Math.hypot(...colour) : colour[1];
  return colour.map(c => k * c + (1 - k) * length) as Rgb;
}

/** The share of the sun's direct light left at a refracted elevation: clamp(e − zeroDeg, 0, 1)^exponent. At zero the moon is the light. */
export function sunDirectShare(model: ScenerySkyNight, sunElevationDeg: number): number {
  return Math.min(1, Math.max(0, sunElevationDeg - model.sunDirect.zeroDeg)) ** model.sunDirect.exponent;
}

/** Atmospheric transmission toward a body at a refracted elevation (Kasten–Young air mass), 0 at and below the horizon. */
function transmission(opticalDepth: number, elevationDeg: number): number {
  if (elevationDeg <= 0) return 0;
  const airMass = 1 / (Math.sin(elevationDeg * RAD) + 0.50572 * (elevationDeg + 6.07995) ** -1.6364);
  return Math.exp(-opticalDepth * (airMass - 1));
}

/** The moon's brightness against full at a phase angle in degrees (Allen's magnitude law). */
const phaseBrightness = (alphaDeg: number) => 10 ** (-0.4 * (0.026 * Math.abs(alphaDeg) + 4e-9 * alphaDeg ** 4));

export interface NightLight {
  /** The game's ambient (`lightColor[0]`): the mapped twilight and the moon's scattered light. Its red against the night level is the night switch. */
  ambient: Rgb;
  /** The moon's light (the directional light once the sun's direct share is zero; zero with the moon below the horizon) and the direction toward it, native frame. */
  moonLight: Rgb; moonDirection: Rgb;
  fog: Rgb;
  /** The night sky dome's zenith luminance (CIE Y): the twilight's and the zenith share of the moon's scattered light. */
  zenithLuminance: number;
}

/** The night light of a moment; `xyzToRgb` is the sky's (the package's `sky.hosek.xyzToRgb`). */
export function nightLight(model: ScenerySkyNight, xyzToRgb: Rows, bodies: SkyBodies): NightLight {
  const {moon} = model, {reference} = moon, sunDeg = bodies.sun.elevationDeg;
  const moonScale = transmission(moon.opticalDepth, bodies.moon.elevationDeg) / transmission(moon.opticalDepth, reference.elevationDeg)
    * phaseBrightness(bodies.moon.phaseAngleDeg) / phaseBrightness(reference.phaseAngleDeg);
  const moonLight = reference.rgb.map(c => c * moonScale) as Rgb;
  const moonScatter = moon.scatterColour.map(c => c * moon.scatterShare * luminance(moonLight)) as Rgb;
  const twilightOnly = twilightColour(model, xyzToRgb, sunDeg);
  // The scattered moonlight's luminance, through the inverse of the sky's rows (its Y row).
  const yRow = inverseRows(xyzToRgb)[1];
  const el = bodies.moon.elevationDeg * RAD, az = bodies.moon.bearingDeg * RAD;
  return {
    ambient: mapAmbient(model, twilightOnly.map((c, i) => c + moonScatter[i]) as Rgb),
    moonLight, moonDirection: [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)],
    fog: model.fog.hue.map(c => c * model.fog.twilightShare * luminance(mapAmbient(model, twilightOnly))) as Rgb,
    zenithLuminance: twilightLuminance(model, sunDeg) + moon.zenithShare * (yRow[0] * moonScatter[0] + yRow[1] * moonScatter[1] + yRow[2] * moonScatter[2]),
  };
}

function inverseRows([a, b, c]: Rows): Rows {
  const cross = (u: Rgb, v: Rgb): Rgb => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const bc = cross(b, c), ca = cross(c, a), ab = cross(a, b), det = a[0] * bc[0] + a[1] * bc[1] + a[2] * bc[2];
  // The inverse's columns are the cofactor rows over the determinant.
  return [0, 1, 2].map(i => [bc[i] / det, ca[i] / det, ab[i] / det]) as unknown as Rows;
}

/**
 * The game's light level at a local clock second: clamp(base + sinScale · sin e, 0, 1) at the half-hourly samples around it (e the refracted
 * sun elevation then, from `sunAt`), linear between them. The game also darkens it by the clouds by a rule not traced; this leaves that out.
 */
export function lightLevel(model: ScenerySkyNight, localSeconds: number, sunAt: (localSeconds: number) => number): number {
  const {base, sinScale, stepS} = model.lightLevel, before = Math.floor(localSeconds / stepS) * stepS, f = (localSeconds - before) / stepS;
  const at = (second: number) => Math.min(1, Math.max(0, base + sinScale * Math.sin(sunAt(second) * RAD)));
  return f === 0 ? at(before) : (1 - f) * at(before) + f * at(before + stepS);
}

/** Whether the track lights are on: the scene's threshold above the light level. */
export const trackLightsOn = (threshold: number, level: number): boolean => threshold > level;

