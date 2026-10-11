import fs from 'node:fs';
import path from 'node:path';

export interface Endpoint { method: string; route: string; exclusion?: string; }
export interface BenchmarkCase { id: string; route: string; url?: string; skip?: string; }

const prefixes: Record<string, string> = { aiRoutes: '/api/ai', dataPluginRoutes: '/api/data-plugin' };
const exclusions: Record<string, string> = {
  '/api/ai/settings': 'Changes AI configuration.',
  '/api/ai/analyze-lap': 'Calls a paid external AI service; latency needs a separate controlled benchmark.',
  '/api/cache/clear': 'Destroys the benchmark dataset.',
  '/api/scan': 'Starts ingestion and changes the dataset.',
  '/api/reference-laptimes/refresh': 'Calls Google Sheets and changes benchmark targets.',
  '/api/rivals/pin': 'Changes the selected rival.',
};

/** Discover literal API routes so newly added endpoints cannot silently escape the sweep. */
export function endpointInventory(root: string): Endpoint[] {
  const directory = path.join(root, 'server/routes');
  return fs.readdirSync(directory).filter(file => file.endsWith('Routes.ts')).flatMap(file => {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    const prefix = prefixes[file.slice(0, -3)] ?? '/api';
    return [...source.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(match => {
      const method = match[1].toUpperCase();
      const route = prefix + match[2];
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
