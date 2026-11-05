/**
 * One lap of the 3D replay frame-time benchmark against an already running app (see README.md; `suite.ts` runs the reference
 * laps on a production build).
 *
 *   npm run benchmark:replay3d -- --session <id> --driver <ordinal> --lap <ordinal> [--seconds 40] [--label name]
 *     [--base http://localhost:5173] [--width 1920 --height 1080] [--skip-offscreen-draws] [--cpu-profile]
 */
import { measureLap } from './measure.js';

const args = process.argv.slice(2);
const option = (name: string, fallback?: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const required = (name: string): string => {
  const value = option(name);
  if (value === undefined) throw Error(`Missing --${name}. Usage: npm run benchmark:replay3d -- --session <id> --driver <n> --lap <n>`);
  return value;
};
const session = required('session'), driver = Number(required('driver')), lap = Number(required('lap'));
const seconds = Number(option('seconds', '40')), width = Number(option('width', '1920')), height = Number(option('height', '1080'));
if (![driver, lap].every(Number.isInteger) || !(seconds > 0) || !(width > 0) || !(height > 0)) throw Error('Invalid numeric option');

const {result, file} = await measureLap({
  session, driver, lap, seconds, width, height, label: option('label', session)!, base: option('base', 'http://localhost:5173')!,
  skipOffscreenDraws: args.includes('--skip-offscreen-draws'), cpuProfile: args.includes('--cpu-profile'),
});
console.log(JSON.stringify(result, null, 1));
console.log(`Saved ${file}`);
