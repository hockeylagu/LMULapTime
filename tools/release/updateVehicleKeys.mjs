import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Adds LMU's vehicle files and entry names to the VEHICLE_KEYS block of shared/domain/vehicleMapping.ts. Sources:
// a saved `GET /rest/sessions/getAllVehicles` answer (.json) and folders of installed .veh files (any depth). A car
// is the `Classes` token that names a VEHICLE_MODELS row; keys are only added, so older game versions keep resolving.
/** @typedef {{carName: string, carClass: string}} VehicleRow
 * @typedef {{source: string, keys: string[], classes: string[]}} VehicleEntry
 * @typedef {{rows: VehicleRow[], keys: Map<string, Set<string>>}} VehicleMapping
 */
/** @type {Record<string, string>} */
const CLASS_TOKENS = {GT3: 'GT3', Hypercar: 'Hyper', LMP2: 'LMP2', LMP2_ELMS: 'LMP2_ELMS', LMP3: 'LMP3', GTE: 'GTE'};
const BLOCK = /(\/\/ <vehicle-keys>[^\n]*\n(?:[^\n]*\n)*?const VEHICLE_KEYS[^\n]*\{\n)((?:[^\n]*\n)*?)(\};\n\/\/ <\/vehicle-keys>)/;

/** @param {unknown} value */
export const vehicleKey = value => (String(value).split(/[\\/]/).pop() ?? '').trim().replace(/\.veh$/i, '').replace(/\s+\d+(?:\.\d+)+$/, '').toUpperCase();

/** The `class/car name` rows of the mapping source, and the keys it already holds.
 * @param {string} source @returns {VehicleMapping}
 */
export function readMapping(source) {
  const rows = [...source.matchAll(/\{ carName: '([^']+)', carClass: '([^']+)'/g)].map(m => ({carName: m[1], carClass: m[2]}));
  const block = source.match(BLOCK);
  if (!block) throw Error('No vehicle-keys block');
  /** @type {Map<string, Set<string>>} */
  const keys = new Map();
  for (const m of block[2].matchAll(/^ {2}"([^"]+)": \[\n((?:(?! {2}\]).*\n)*?) {2}\],$/gm)) {
    const values = /** @type {unknown} */ (JSON.parse(`[${m[2].trim().replace(/,$/, '')}]`));
    if (!Array.isArray(values) || !values.every(value => typeof value === 'string')) throw Error('Invalid vehicle keys');
    keys.set(m[1], new Set(values));
  }
  return {rows, keys};
}

/** Entries from getAllVehicles answers and .veh files: their keys and `Classes` tokens.
 * @param {string[]} inputs @returns {VehicleEntry[]}
 */
export function readEntries(inputs) {
  const entries = [];
  /** @type {(dir: string) => string[]} */
  const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const input of inputs) {
    if (fs.statSync(input).isDirectory()) {
      for (const file of walk(input).filter(f => /\.veh$/i.test(f))) {
        const text = fs.readFileSync(file, 'latin1');
        /** @param {string} name */
        const field = name => text.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]*)"`, 'mi'))?.[1] ?? '';
        entries.push({source: file, keys: [vehicleKey(file), vehicleKey(field('Description'))], classes: field('Classes').split(',').map(t => t.trim())});
      }
    } else {
      const rows = /** @type {unknown} */ (JSON.parse(fs.readFileSync(input, 'utf8')));
      if (!Array.isArray(rows)) throw Error('Expected vehicle catalog array');
      for (const value of /** @type {unknown[]} */ (rows)) {
        if (!value || typeof value !== 'object' || !('vehFile' in value) || !('desc' in value) || !('classes' in value)
          || !Array.isArray(value.classes) || !value.classes.every(token => typeof token === 'string')) throw Error('Invalid vehicle catalog entry');
        const row = value;
        entries.push({source: input, keys: [vehicleKey(row.vehFile), vehicleKey(row.desc)], classes: row.classes});
      }
    }
  }
  return entries;
}

/** The mapping keys with the entries added; throws on an entry no row (or two rows) names, or a key in two rows.
 * @param {VehicleMapping} mapping @param {VehicleEntry[]} entries @returns {Map<string, Set<string>>}
 */
export function mergeKeys({rows, keys}, entries) {
  const merged = new Map(rows.map(row => [`${row.carClass}/${row.carName}`, new Set(keys.get(`${row.carClass}/${row.carName}`) ?? [])]));
  /** @type {Map<string, string>} */
  const owner = new Map();
  for (const [id, set] of merged) for (const key of set) owner.set(key, id);
  const problems = [];
  for (const entry of entries) {
    const tokens = entry.classes.filter(Boolean);
    const carClass = tokens.map(t => CLASS_TOKENS[t]).find(Boolean);
    const matches = rows.filter(row => tokens.includes(row.carName) && (!carClass || row.carClass === carClass));
    if (matches.length !== 1) { problems.push(`${matches.length ? 'Two rows' : 'No row'} for ${tokens.join(', ')} (${entry.source})`); continue; }
    const id = `${matches[0].carClass}/${matches[0].carName}`;
    for (const key of entry.keys.filter(Boolean)) {
      const prior = owner.get(key);
      if (prior && prior !== id) { problems.push(`Key ${key} in ${prior} and ${id}`); continue; }
      owner.set(key, id);
      merged.get(id).add(key);
    }
  }
  if (problems.length) throw Error([...new Set(problems)].join('\n'));
  return merged;
}

/** The mapping source with its keys block rewritten (sorted, wrapped at 120 columns).
 * @param {string} source @param {Map<string, Set<string>>} merged
 */
export function writeMapping(source, merged) {
  const body = [...merged].filter(([, set]) => set.size).map(([id, set]) => {
    const lines = [];
    let line = '   ';
    for (const key of [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      const item = ` ${JSON.stringify(key)},`;
      if (line.length + item.length > 120) { lines.push(line); line = '   '; }
      line += item;
    }
    lines.push(line);
    return `  ${JSON.stringify(id)}: [\n${lines.join('\n')}\n  ],\n`;
  }).join('');
  return source.replace(BLOCK, (/** @type {string} */ _, /** @type {string} */ open, /** @type {string} */ _old, /** @type {string} */ close) => open + body + close);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputs = process.argv.slice(2);
  if (!inputs.length) { console.error('Usage: node tools/release/updateVehicleKeys.mjs <getAllVehicles.json | .veh folder>...'); process.exit(1); }
  const file = path.resolve(import.meta.dirname, '../../shared/domain/vehicleMapping.ts');
  const source = fs.readFileSync(file, 'utf8');
  const mapping = readMapping(source);
  const before = [...mapping.keys.values()].reduce((n, set) => n + set.size, 0);
  const merged = mergeKeys(mapping, readEntries(inputs));
  fs.writeFileSync(file, writeMapping(source, merged));
  console.log(`Vehicle keys: ${before} → ${[...merged.values()].reduce((n, set) => n + set.size, 0)}`);
}
