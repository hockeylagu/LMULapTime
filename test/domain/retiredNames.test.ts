import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RETIRED = ['lapNum', 'bestLapNum', 'initialLapNum', 'averageLapTime', 'top3AvgLapTime', 'isOutlap',
  'benchmarkCategory', 'benchmarkPercentage', 'carModel', 'dateString', 'sizeBytes',
  // One fact, one place: the lists are the counts, the numbers are the strings, the session holds the telemetry file.
  'weatherInfo', 'incidentCount', 'trackLimitCount', 'penaltyCount', 'totalIncidents', 'totalTrackLimits', 'totalPenalties',
  'lapTimeString', 'bestLapTimeString', 'avgLapTimeString', 'theoreticalBestString', 'elapsedTimeString', 'gapToLeaderString',
  'pitStopDurationString', 's1String', 's2String', 's3String', 'bestS1String', 'bestS2String', 'bestS3String',
  'finishGapToLeaderString', 'bestSessionLapTimeString', 'oldAlienTimeString', 'newAlienTimeString', 'diffSec',
  'rawPointsCount', 'rawSampleRateHz', 'rivalEntry'];

/** Columns the session tables, the summary facts and reference_laptimes no longer have (session_drivers.lists_mask stays: it says which lists a driver has). */
const RETIRED_COLUMNS = ['driver_seq', 'lap_seq', 'incident_count', 'track_limit_count', 'penalty_count', 'total_incidents',
  'total_track_limits', 'total_penalties', 'weather_info', 'has_duckdb_telemetry', 'lap_time_string',
  'elapsed_time_string', 'pit_stop_duration_string', 'gap_to_leader_string', 'best_lap_time_string', 'theoretical_best_string',
  'avg_lap_time_string', 'finish_gap_to_leader_string', 'best_session_lap_time_string', 'target100_sec'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(name) ? [path] : [];
  });
}

describe('retired property names', () => {
  it('stay out of the shared type contracts', () => {
    const dir = join(process.cwd(), 'shared', 'types');
    const hits: string[] = [];
    for (const file of readdirSync(dir).filter(name => name.endsWith('.ts'))) {
      readFileSync(join(dir, file), 'utf8').split('\n').forEach((line, index) => {
        for (const name of RETIRED) if (new RegExp(String.raw`\b${name}\??\s*:`).test(line)) hits.push(`${file}:${index + 1} ${name}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('keep each fact in one place in the shared types', () => {
    const body = (file: string, name: string): string => {
      const text = readFileSync(join(process.cwd(), 'shared', 'types', file), 'utf8');
      const start = text.indexOf(`interface ${name} {`);
      return text.slice(start, text.indexOf('}', start));
    };
    expect(body('leaderboard.ts', 'Leaderboard')).not.toMatch(/\bplayer\??\s*:/);
    expect(body('sessionSummaries.ts', 'SessionAggregateProjection')).not.toMatch(/\b(player|timeString|trackLengthMeters)\??\s*:/);
    expect(body('reference.ts', 'ReferenceLaptimeEntry')).not.toMatch(/\btarget100Sec\??\s*:/);
    expect(body('replay.ts', 'ReplayEventInfo')).not.toMatch(/\b(sceneDesc|session)\??\s*:/);
    expect(body('replay.ts', 'ReplayMetadata')).not.toMatch(/\beventTitle\??\s*:/);
  });

  it('stay out of the server SQL', () => {
    const hits: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), 'server'))) {
      const text = readFileSync(file, 'utf8');
      for (const column of RETIRED_COLUMNS) if (new RegExp(String.raw`\b${column}\b`).test(text)) hits.push(`${file} ${column}`);
    }
    expect(hits).toEqual([]);
  });
});
