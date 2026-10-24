import fs from 'node:fs';
import path from 'node:path';

export interface Endpoint { method: string; route: string; exclusion?: string; }
export interface BenchmarkCase {
  id: string; route: string; url?: string; skip?: string;
  requiredCollection?: 'entries' | 'sessions' | 'laps';
}

const prefixes: Record<string, string> = { aiRoutes: '/api/ai', dataPluginRoutes: '/api/data-plugin', peripheralRoutes: '/api/peripherals' };
const exclusions: Record<string, string> = {
  '/api/ai/settings': 'Changes AI configuration.',
  '/api/ai/analyze-lap': 'Calls a paid external AI service; latency needs a separate controlled benchmark.',
  '/api/cache/clear': 'Destroys the benchmark dataset.',
  '/api/scan': 'Starts ingestion and changes the dataset.',
  '/api/reference-laptimes/refresh': 'Calls Google Sheets and changes benchmark targets.',
  '/api/rivals/pin': 'Changes the selected rival.',
  '/api/live/settings': 'Changes the live dashboard settings.',
  '/api/desktop/browser': 'Changes the desktop-local browser monitor preference.',
  '/api/peripherals/:id/settings': 'Changes peripheral settings.',
  '/api/peripherals/:id/health/refresh': 'Reads live vendor health and updates its cache; no hardware writes.',
  '/api/peripherals/:id/presets/refresh': 'Reads a live vendor service and changes the local preset catalog.',
  '/api/peripherals/:id/mappings': 'Changes saved car-to-preset mappings.',
  '/api/peripherals/:id/mappings/suggest': 'Requires a configured device catalog; covered by deterministic fixture tests.',
  '/api/peripherals/:id/apply': 'Changes physical device presets; never benchmark hardware writes.',
};

/** Discover literal API routes so newly added endpoints cannot silently escape the sweep. */
export function endpointInventory(root: string): Endpoint[] {
  const directory = path.join(root, 'server/routes');
  return fs.readdirSync(directory, { recursive: true }).filter((file): file is string => typeof file === 'string' && file.endsWith('Routes.ts')).flatMap(file => {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    const prefix = prefixes[path.basename(file).slice(0, -3)] ?? '/api';
    return [...source.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(match => {
      const method = match[1].toUpperCase();
      const route = (prefix + match[2]).replace(/\/$/, '');
      return { method, route, ...(method === 'GET' ? {} : { exclusion: exclusions[route] }) };
    });
  }).sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
}

export function coverageErrors(endpoints: Endpoint[], cases: BenchmarkCase[]): string[] {
  const errors: string[] = [];
  for (const endpoint of endpoints) {
    if (endpoint.method === 'GET' && !cases.some(item => item.route === endpoint.route)) {
      errors.push(`Missing benchmark case: GET ${endpoint.route}`);
    } else if (endpoint.method !== 'GET' && !endpoint.exclusion) {
      errors.push(`Classify the effects of ${endpoint.method} ${endpoint.route} before benchmarking it.`);
    }
  }
  const ids = new Set<string>();
  for (const item of cases) {
    if (ids.has(item.id)) errors.push(`Duplicate case id: ${item.id}`);
    ids.add(item.id);
    if (!endpoints.some(endpoint => endpoint.method === 'GET' && endpoint.route === item.route)) {
      errors.push(`Benchmark refers to a removed endpoint: ${item.id}`);
    }
    if (Boolean(item.url) === Boolean(item.skip)) errors.push(`Case needs either a URL or a skip reason: ${item.id}`);
  }
  return errors;
}
