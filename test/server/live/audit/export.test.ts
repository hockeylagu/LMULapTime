import { describe, expect, it } from 'vitest';
import { exportLiveAudit } from '../../../../server/live/audit/export.js';
import type { LiveAuditRecord } from '../../../../shared/types/liveAudit.js';
import { liveSnapshot, liveStrategy } from '../../../helpers/liveSnapshot.js';

function record(): LiveAuditRecord {
  return { runId: 'recording-uuid', sequence: 42, modelVersion: 3, recordedAt: 1001, reason: 'sample',
    snapshot: liveSnapshot({ strategy: liveStrategy() }), observation: { fuel: null, ve: null }, comparison: null };
}

describe('recording strategy CSV', () => {
  it('streams one header and immutable checkpoint values from an asynchronous recording source', async () => {
    const item = record();
    async function* records() { yield item; yield { ...item, sequence: 43 }; }
    const lines: string[] = [];
    for await (const line of exportLiveAudit(records())) lines.push(line);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"estimated_use_per_lap"');
    expect(lines[1]).toContain('"recording-uuid","42"');
    expect(lines[2]).toContain('"recording-uuid","43"');
    expect(item.snapshot.strategy?.resource?.perLap).toBe(2.5);
  });

  it('escapes commas, quotes, newlines and spreadsheet formulas while keeping signed numeric errors', async () => {
    const item = record();
    item.snapshot.session!.vehicleName = '=CMD("x,y")\ncar';
    item.comparison = { lap: 1, forecastAtSeconds: 0, resourceKind: 've', source: 'game',
      predictedPerLap: 3, actualPerLap: 2.5, errorPerLap: -0.5, errorPercent: -16.667,
      actualRatio: 0.8, recommendedRatio: 0.81, ratioError: -0.01, garageRatio: 0.85, nextStopRatio: 0.82 };
    const lines: string[] = [];
    for await (const line of exportLiveAudit([item])) lines.push(line);
    const csv = lines.join('');
    expect(csv).toContain('"\'=CMD(""x,y"")\ncar"');
    expect(csv).toContain('"-0.5"');
    expect(csv).toContain('"0.85","0.82"');
  });
});
