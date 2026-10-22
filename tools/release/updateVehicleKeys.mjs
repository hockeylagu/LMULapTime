import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Adds LMU's vehicle files and entry names to the VEHICLE_KEYS block of shared/domain/vehicleMapping.ts. Sources:
// a saved `GET /rest/sessions/getAllVehicles` answer (.json) and folders of installed .veh files (any depth). A car
// is the `Classes` token that names a VEHICLE_MODELS row; keys are only added, so older game versions keep resolving.
const CLASS_TOKENS = {GT3: 'GT3', Hypercar: 'Hyper', LMP2: 'LMP2', LMP2_ELMS: 'LMP2_ELMS', LMP3: 'LMP3', GTE: 'GTE'};
const BLOCK = /(\/\/ <vehicle-keys>[^\n]*\n(?:[^\n]*\n)*?const VEHICLE_KEYS[^\n]*\{\n)((?:[^\n]*\n)*?)(\};\n\/\/ <\/vehicle-keys>)/;

export const vehicleKey = value => (String(value).split(/[\\/]/).pop() ?? '').trim().replace(/\.veh$/i, '').replace(/\s+\d+(?:\.\d+)+$/, '').toUpperCase();

/** The `class/car name` rows of the mapping source, and the keys it already holds. */
export function readMapping(source) {
  const rows = [...source.matchAll(/\{ carName: '([^']+)', carClass: '([^']+)'/g)].map(m => ({carName: m[1], carClass: m[2]}));
  const block = source.match(BLOCK);
  if (!block) throw Error('No vehicle-keys block');
  const keys = new Map();
  for (const m of block[2].matchAll(/^ {2}"([^"]+)": \[\n((?:(?! {2}\]).*\n)*?) {2}\],$/gm)) keys.set(m[1], new Set(JSON.parse(`[${m[2].trim().replace(/,$/, '')}]`)));
  return {rows, keys};
}

/** Entries from getAllVehicles answers and .veh files: their keys and `Classes` tokens. */
export function readEntries(inputs) {
  const entries = [];
  const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const input of inputs) {
    if (fs.statSync(input).isDirectory()) {
      for (const file of walk(input).filter(f => /\.veh$/i.test(f))) {
        const text = fs.readFileSync(file, 'latin1');
        const field = name => text.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]*)"`, 'mi'))?.[1] ?? '';
        entries.push({source: file, keys: [vehicleKey(file), vehicleKey(field('Description'))], classes: field('Classes').split(',').map(t => t.trim())});
      }
    } else {
      for (const row of JSON.parse(fs.readFileSync(input, 'utf8'))) {
        entries.push({source: input, keys: [vehicleKey(row.vehFile), vehicleKey(row.desc)], classes: row.classes});
      }
    }
  }
  return entries;
}

/** The mapping keys with the entries added; throws on an entry no row (or two rows) names, or a key in two rows. */
export function mergeKeys({rows, keys}, entries) {
  const merged = new Map(rows.map(row => [`${row.carClass}/${row.carName}`, new Set(keys.get(`${row.carClass}/${row.carName}`) ?? [])]));
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

/** The mapping source with its keys block rewritten (sorted, wrapped at 120 columns). */
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
  return source.replace(BLOCK, (_, open, _old, close) => open + body + close);
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
