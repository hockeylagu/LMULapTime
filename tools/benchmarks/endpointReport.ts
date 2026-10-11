import type { BenchmarkCase, Endpoint } from './endpointInventory.js';

export interface Measurement extends BenchmarkCase {
  firstMs?: number; samplesMs?: number[]; medianMs?: number; p95Ms?: number; minMs?: number; maxMs?: number;
  bytes?: number; status?: number; error?: string; source?: string; pointsCount?: number;
}
export interface BenchmarkRun {
  schemaVersion: 1; timestamp: string; datasetHash: string; cohortHash: string;
  environment: { node: string; platform: string; architecture: string; cpu: string; hostname: string; pluginRevision: string | null };
  code: { commit: string; dirty: boolean; diffHash: string }; samples: number;
  dataset: Record<string, number>; endpoints: Endpoint[]; measurements: Measurement[];
}

export function summarize(samples: number[]) {
  if (!samples.length || samples.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Expected finite, non-negative timing samples.');
  const ordered = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return { medianMs: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2,
    p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1], minMs: ordered[0], maxMs: ordered[ordered.length - 1] };
}

export function comparisonReasons(current: BenchmarkRun, previous: BenchmarkRun): string[] {
  const reasons: string[] = [];
  if (current.schemaVersion !== previous.schemaVersion) reasons.push('report schema changed');
  if (current.datasetHash !== previous.datasetHash) reasons.push('database snapshot changed');
  if (current.cohortHash !== previous.cohortHash) reasons.push('request cohort changed');
  if (JSON.stringify(current.environment) !== JSON.stringify(previous.environment)) reasons.push('runtime, machine or geometry package changed');
  if (current.samples !== previous.samples) reasons.push('sample count changed');
  return reasons;
}

export function timingDelta(current: Measurement, previous?: Measurement) {
  if (!previous || current.error || previous.error || current.skip || previous.skip || current.url !== previous.url
    || current.medianMs === undefined || previous.medianMs === undefined || previous.medianMs <= 0) return null;
  const ms = current.medianMs - previous.medianMs;
  const percent = ms / previous.medianMs * 100;
  return { ms, percent, regression: ms > 5 && percent > 20 };
}

export function renderReport(run: BenchmarkRun, previous?: BenchmarkRun): string {
  const localTime = (value: string) => new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium', timeStyle: 'long', timeZone: 'America/Toronto',
  }).format(new Date(value));
  const reasons = previous ? comparisonReasons(run, previous) : [];
  const comparable = Boolean(previous && reasons.length === 0);
  const lines = [ '# Endpoint response times', '', `Run: ${localTime(run.timestamp)} (America/Toronto). Code: ${run.code.commit}${run.code.dirty ? ' (working tree changes)' : ''}.`, '',
    `Dataset: ${Object.entries(run.dataset).map(([name, count]) => `${count.toLocaleString('en-US')} ${name}`).join(', ')}. Snapshot: ${run.datasetHash.slice(0, 12)}.`, '',
    `${run.environment.cpu}; Node ${run.environment.node}; ${run.environment.platform}/${run.environment.architecture}.`, '',
    `Real local HTTP through production Express routers; full response-body receipt included. First request is measured separately; median/p95 use ${run.samples} subsequent sequential requests. First request is **not** a cold OS/disk-cache measurement. Browser rendering is excluded.`, '',
    'Each run uses a temporary database snapshot with scans and external refreshes disabled. GET cache/rival writes affect that snapshot only. Original replay files are not decoded. Traffic may build an index on the first request.', '',
    previous ? comparable ? `Compared with ${localTime(previous.timestamp)}. Regression flag: median increases by both >20% and >5 ms; rerun to confirm noise.`
      : `Previous run ${localTime(previous.timestamp)} is not directly comparable: ${reasons.join('; ')}. Deltas are withheld.` : 'First recorded run; no previous baseline.', '',
    '| Endpoint / scenario | First ms | Median ms | p95 ms | KB | Change |', '|---|---:|---:|---:|---:|---|',
  ];
  const ranked = [...run.measurements].sort((a, b) => (b.medianMs ?? -1) - (a.medianMs ?? -1));
  const number = (value?: number) => value === undefined ? '—' : value.toFixed(2);
  for (const item of ranked) {
    const delta = comparable ? timingDelta(item, previous?.measurements.find(old => old.id === item.id)) : null;
    const change = item.error ? `ERROR: ${item.error}` : item.skip ? `Skipped: ${item.skip}` : delta
      ? `${delta.ms >= 0 ? '+' : ''}${delta.ms.toFixed(2)} ms (${delta.percent >= 0 ? '+' : ''}${delta.percent.toFixed(1)}%)${delta.regression ? ' **REGRESSION**' : ''}` : '—';
    lines.push(`| ${item.id} · GET ${item.route} | ${number(item.firstMs)} | ${number(item.medianMs)} | ${number(item.p95Ms)} | ${number(item.bytes === undefined ? undefined : item.bytes / 1024)} | ${change.replace(/\|/g, '\\|')} |`);
  }
  lines.push('', '## Operations excluded from repeated timing', '', '| Endpoint | Reason |', '|---|---|');
  for (const endpoint of run.endpoints.filter(item => item.method !== 'GET')) lines.push(`| ${endpoint.method} ${endpoint.route} | ${endpoint.exclusion} |`);
  lines.push('', 'The JSON history retains every timing sample, exact request URLs, response status/size, code diff fingerprint, source/point count for telemetry, and environment identity. Results and cohort identifiers stay local.', '');
  return lines.join('\n');
}
