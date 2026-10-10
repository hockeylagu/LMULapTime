import { Database as DatabaseType } from 'better-sqlite3';
import { AiReportRecord, AiReportHistoryEntry, AiLapReport } from './types.js';

export function getAiReport(db: DatabaseType, cacheKey: string): AiReportRecord | null {
  const row = db.prepare('SELECT * FROM ai_reports WHERE cache_key = ?').get(cacheKey) as {
    cache_key: string;
    session_id: string | null;
    driver_ordinal: number | null;
    lap_ordinal: number | null;
    lap_number: number;
    baseline_session_id: string | null;
    baseline_driver_ordinal: number | null;
    baseline_lap_ordinal: number | null;
    baseline_lap_number: number | null;
    model: string;
    prompt_version: number;
    report_json: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    generated_at: number;
  } | undefined;
  if (!row) return null;
  return {
    cacheKey: row.cache_key,
    sessionId: row.session_id,
    driverOrdinal: row.driver_ordinal,
    lapOrdinal: row.lap_ordinal,
    lapNumber: row.lap_number,
    baselineSessionId: row.baseline_session_id,
    baselineDriverOrdinal: row.baseline_driver_ordinal,
    baselineLapOrdinal: row.baseline_lap_ordinal,
    baselineLapNumber: row.baseline_lap_number,
    model: row.model,
    promptVersion: row.prompt_version,
    report: JSON.parse(row.report_json) as AiReportRecord['report'],
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    generatedAt: row.generated_at,
  };
}

export function getAiReportsList(db: DatabaseType, limit = 200): AiReportHistoryEntry[] {
  const rows = db.prepare(`
    SELECT cache_key, session_id, driver_ordinal, lap_ordinal, lap_number, baseline_session_id, baseline_driver_ordinal, baseline_lap_ordinal, baseline_lap_number,
           model, prompt_tokens, completion_tokens, total_tokens, generated_at, report_json
    FROM ai_reports
    ORDER BY generated_at DESC
    LIMIT ?
  `).all(limit) as {
    cache_key: string;
    session_id: string | null;
    driver_ordinal: number | null;
    lap_ordinal: number | null;
    lap_number: number;
    baseline_session_id: string | null;
    baseline_driver_ordinal: number | null;
    baseline_lap_ordinal: number | null;
    baseline_lap_number: number | null;
    model: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    generated_at: number;
    report_json: string;
  }[];

  return rows.map(row => {
    let overallSummary: string | undefined;
    try {
      overallSummary = (JSON.parse(row.report_json) as AiLapReport).overallSummary;
    } catch {
      overallSummary = undefined;
    }
    return {
      cacheKey: row.cache_key,
      sessionId: row.session_id,
      driverOrdinal: row.driver_ordinal,
      lapOrdinal: row.lap_ordinal,
      lapNumber: row.lap_number,
      baselineSessionId: row.baseline_session_id,
      baselineDriverOrdinal: row.baseline_driver_ordinal,
      baselineLapOrdinal: row.baseline_lap_ordinal,
      baselineLapNumber: row.baseline_lap_number,
      model: row.model,
      overallSummary,
      tokensUsed: row.total_tokens != null ? {
        prompt: row.prompt_tokens ?? 0,
        completion: row.completion_tokens ?? 0,
        total: row.total_tokens,
      } : undefined,
      generatedAt: row.generated_at,
    };
  });
}

export function saveAiReport(db: DatabaseType, record: AiReportRecord): void {
  db.prepare(`
    INSERT INTO ai_reports (
      cache_key, session_id, driver_ordinal, lap_ordinal, lap_number, baseline_session_id, baseline_driver_ordinal, baseline_lap_ordinal, baseline_lap_number,
      model, prompt_version, report_json, prompt_tokens, completion_tokens, total_tokens, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      report_json = excluded.report_json,
      prompt_tokens = excluded.prompt_tokens,
      completion_tokens = excluded.completion_tokens,
      total_tokens = excluded.total_tokens,
      generated_at = excluded.generated_at
  `).run(
    record.cacheKey,
    record.sessionId,
    record.driverOrdinal,
    record.lapOrdinal,
    record.lapNumber,
    record.baselineSessionId ?? null,
    record.baselineDriverOrdinal ?? null,
    record.baselineLapOrdinal ?? null,
    record.baselineLapNumber ?? null,
    record.model,
    record.promptVersion,
    JSON.stringify(record.report),
    record.promptTokens ?? null,
    record.completionTokens ?? null,
    record.totalTokens ?? null,
    record.generatedAt,
  );
}
