import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, RefreshCw, Sparkles } from 'lucide-react';
import { AiAnalyzeResponse, AiErrorCode, ReplayLapSummary, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { LapSegmentComparison } from '../../../utils/cornerAnalysis.js';
import { buildAiLapEvidence } from '../../../utils/aiReportPayload.js';
import type { CornerConsistencyStat } from '../../../utils/cornerConsistency.js';
import { comparisonConfidence, rankDebriefCorners } from '../../../utils/sessionDebrief.js';
import { ApiError, fetchJson, isAbortError, postJson } from '../../../api/apiClient.js';

interface AIReportTabProps {
  trajectory: ReplayTrajectoryData | null;
  baselineTrajectory: ReplayTrajectoryData | null | undefined;
  baselineLapNumber: number | null;
  segments: LapSegmentComparison[];
  carClass?: string;
  carModel?: string;
  currentLapSummary?: ReplayLapSummary | null;
  /** The replay's laps timed through each corner, for how often each corner is lost. */
  cornerStats?: CornerConsistencyStat[];
}

/** The report explains at most this many ranked corners. */
const AI_PRIORITY_LIMIT = 4;

const errorMessages: Record<AiErrorCode, string> = {
  not_configured: 'Add a Gemini API key in Settings before generating a report.',
  invalid_request: 'This lap could not be prepared for analysis.',
  payload_too_large: 'The lap analysis data is too large to send.',
  invalid_key: 'Gemini rejected the API key. Check it in Settings.',
  invalid_model: 'The configured Gemini model is unavailable.',
  rate_limited: 'Gemini is rate-limiting requests. Try again shortly.',
  upstream_timeout: 'Gemini did not respond within 30 seconds.',
  upstream_unavailable: 'Gemini is temporarily unavailable. The app retried once; try again shortly.',
  upstream_error: 'Gemini could not complete the report.',
  malformed_model_response: 'Gemini returned a report in an unsupported format.',
};

/** The error code and detail line of a failed analyze-lap request (see server/routes/aiRoutes.ts). */
function describeAiFailure(cause: unknown): { code: AiErrorCode; detail: string | null } {
  if (!(cause instanceof ApiError)) return { code: 'upstream_error', detail: null };
  const body = cause.body && typeof cause.body === 'object' ? cause.body as Record<string, unknown> : {};
  const code = typeof body.errorCode === 'string' && body.errorCode in errorMessages ? body.errorCode as AiErrorCode : 'upstream_error';
  const detail = typeof body.error === 'string' ? body.error : null;
  const requestId = typeof body.requestId === 'string' ? body.requestId : null;
  return { code, detail: requestId ? `${detail || 'Request failed.'} (Request ID: ${requestId})` : detail };
}

export const AIReportTab: React.FC<AIReportTabProps> = ({
  trajectory,
  baselineTrajectory,
  baselineLapNumber,
  segments,
  currentLapSummary,
  carClass,
  carModel,
  cornerStats,
}) => {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [report, setReport] = useState<AiAnalyzeResponse | null>(null);
  const [errorCode, setErrorCode] = useState<AiErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestAbortRef = useRef<AbortController | null>(null);
  const contextKey = `${trajectory?.replayName ?? ''}|${trajectory?.currentLap ?? ''}|${baselineTrajectory?.replayName ?? ''}|${baselineLapNumber ?? ''}`;

  const evidence = useMemo(() => {
    if (!trajectory) return null;
    const baselineLapSummary = baselineTrajectory?.laps?.find(lap => lap.lapNumber === (baselineLapNumber ?? baselineTrajectory.currentLap));
    // The app ranks the corners (AGENTS.md rule C); the report only explains them.
    const priorities = baselineTrajectory
      ? rankDebriefCorners(segments, cornerStats?.length ? cornerStats : null, comparisonConfidence(trajectory, baselineTrajectory), AI_PRIORITY_LIMIT)
      : undefined;
    try {
      return buildAiLapEvidence({
        trajectory,
        baselineTrajectory,
        currentLapSummary,
        baselineLapSummary,
        segments,
        carClass,
        carModel,
        priorities,
      });
    } catch {
      return null;
    }
  }, [trajectory, baselineTrajectory, baselineLapNumber, currentLapSummary, segments, carClass, carModel, cornerStats]);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setErrorCode(null);
    setErrorMessage(null);
    void fetchJson<{ configured?: boolean }>('/api/ai/settings')
      .then(data => { if (!cancelled) setConfigured(Boolean(data.configured)); })
      .catch(() => { if (!cancelled) setConfigured(false); });
    return () => {
      cancelled = true;
      requestAbortRef.current?.abort();
    };
  }, [contextKey]);

  const generate = async (forceRegenerate: boolean) => {
    if (!evidence || isLoading) return;
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setIsLoading(true);
    setErrorCode(null);
    setErrorMessage(null);
    try {
      setReport(await postJson<AiAnalyzeResponse>('/api/ai/analyze-lap', { forceRegenerate, evidence }, { signal: controller.signal }));
    } catch (cause) {
      if (isAbortError(cause)) return;
      const failure = describeAiFailure(cause);
      setErrorCode(failure.code);
      setErrorMessage(failure.detail);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  };

  if (!trajectory || !evidence) {
    return <div className="flex-1 p-5 text-sm text-lmu-muted">Select a completed lap to generate an AI report.</div>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <div className="rounded-xl border border-lmu-border bg-lmu-card/80 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-lmu-accent" />
          <h3 className="text-sm font-bold text-white">AI Lap Report</h3>
        </div>
        <p className="text-xs leading-relaxed text-lmu-muted">Lap analytics and driver names used in this comparison will be sent to Google Gemini.</p>
        {configured === false && <p className="text-xs text-lmu-gold">Configure a Gemini API key in Settings before generating a report.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void generate(false)} disabled={configured !== true || isLoading} className="inline-flex items-center gap-1.5 rounded-lg bg-lmu-accent px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" /> {isLoading ? 'Generating...' : 'Generate AI Report'}
          </button>
          {report && <button type="button" onClick={() => void generate(true)} disabled={isLoading} className="inline-flex items-center gap-1.5 rounded-lg border border-lmu-border px-3 py-2 text-xs font-semibold text-lmu-muted hover:text-white disabled:opacity-50">
            <RefreshCw className="h-3.5 w-3.5" /> Regenerate
          </button>}
        </div>
      </div>

      {errorCode && <div role="alert" className="rounded-xl border border-lmu-accent/30 bg-lmu-accent/10 p-4 text-sm text-white">{errorMessages[errorCode]}{errorMessage && <span className="mt-1 block text-xs text-lmu-muted">{errorMessage}</span>}</div>}

      {report && <div className="space-y-3">
        <section className="rounded-xl border border-lmu-border bg-lmu-card/60 p-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-lmu-accent">Overall Summary</h4>
          <p className="text-sm leading-relaxed text-white">{report.report.overallSummary}</p>
        </section>
        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-lmu-accent">Key Improvements</h4>
          {report.report.improvements.map((item, index) => <article key={`${item.title}-${index}`} className="rounded-xl border border-lmu-border bg-lmu-card/60 p-4">
            <h5 className="text-sm font-bold text-white">
              {item.cornerNumber !== undefined && <span className="mr-1.5 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-amber-300">#{index + 1} T{item.cornerNumber}</span>}
              {item.title}
            </h5>
            <div className="mt-3 space-y-2 text-sm leading-relaxed">
              <p><strong className="text-emerald-300">Action:</strong> <span className="text-white">{item.action}</span></p>
              <p><strong className="text-lmu-accent">Why:</strong> <span className="text-lmu-muted">{item.why}</span></p>
              <p><strong className="text-lmu-accent">Next lap:</strong> <span className="text-lmu-muted">{item.executionCue}</span></p>
              <p><strong className="text-lmu-accent">Verify:</strong> <span className="text-lmu-muted">{item.verify}</span></p>
            </div>
            {item.evidence && item.evidence.length > 0 && (
              <div className="mt-3 border-t border-lmu-border/60 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-lmu-muted">Measured evidence</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-300">
                  {item.evidence.map((evidence, evidenceIndex) => <li key={`${index}-${evidenceIndex}`}>• {evidence}</li>)}
                </ul>
              </div>
            )}
            {item.estimatedGainSec !== undefined && <span className="mt-2 inline-block text-xs font-semibold text-emerald-300">Potential lap-time gain: {item.estimatedGainSec.toFixed(3)}s</span>}
          </article>)}
        </section>
        <p className="text-right text-[11px] text-lmu-muted">{report.cached ? 'Cached report' : 'Generated now'}{report.tokensUsed ? ` · ${report.tokensUsed.total} tokens` : ''}</p>
      </div>}
    </div>
  );
};
