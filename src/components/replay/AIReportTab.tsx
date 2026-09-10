import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, RefreshCw, Sparkles } from 'lucide-react';
import { AiAnalyzeResponse, AiErrorCode, ReplayLapSummary, ReplayTrajectoryData } from '../../../server/types.js';
import { LapSegmentComparison } from '../../utils/cornerAnalysis.js';
import { buildAiLapEvidence } from '../../utils/aiReportPayload.js';

interface AIReportTabProps {
  trajectory: ReplayTrajectoryData | null;
  baselineTrajectory: ReplayTrajectoryData | null | undefined;
  baselineLapNumber: number | null;
  segments: LapSegmentComparison[];
  carClass?: string;
  carModel?: string;
  currentLapSummary?: ReplayLapSummary | null;
}

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

export const AIReportTab: React.FC<AIReportTabProps> = ({
  trajectory,
  baselineTrajectory,
  baselineLapNumber,
  segments,
  currentLapSummary,
  carClass,
  carModel,
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
    try {
      return buildAiLapEvidence({
        trajectory,
        baselineTrajectory,
        currentLapSummary,
        baselineLapSummary,
        segments,
        carClass,
        carModel,
      });
    } catch {
      return null;
    }
  }, [trajectory, baselineTrajectory, baselineLapNumber, currentLapSummary, segments, carClass, carModel]);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setErrorCode(null);
    setErrorMessage(null);
    void fetch('/api/ai/settings')
      .then(response => response.json())
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
      const response = await fetch('/api/ai/analyze-lap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRegenerate, evidence }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        const requestError = new Error(data.errorCode || 'upstream_error') as Error & { detail?: string };
        requestError.detail = typeof data.error === 'string' ? data.error : undefined;
        if (data.requestId) requestError.detail = `${requestError.detail || 'Request failed.'} (Request ID: ${data.requestId})`;
        throw requestError;
      }
      setReport(data as AiAnalyzeResponse);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      const code = cause instanceof Error && cause.message in errorMessages ? cause.message as AiErrorCode : 'upstream_error';
      setErrorCode(code);
      setErrorMessage(cause instanceof Error && 'detail' in cause ? (cause as Error & { detail?: string }).detail || null : null);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  };

  if (!trajectory || !evidence) {
    return <div className="flex-1 p-5 text-sm text-lmu-muted">Select a completed lap to generate an AI report.</div>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <div className="rounded-xl border border-lmu-border bg-lmu-dark/70 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-lmu-accent" />
          <h3 className="text-sm font-bold text-white">AI Lap Report</h3>
        </div>
        <p className="text-xs leading-relaxed text-lmu-muted">Lap analytics and driver names used in this comparison will be sent to Google Gemini.</p>
        {configured === false && <p className="text-xs text-amber-300">Configure a Gemini API key in Settings before generating a report.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void generate(false)} disabled={configured !== true || isLoading} className="inline-flex items-center gap-1.5 rounded-lg bg-lmu-accent px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" /> {isLoading ? 'Generating...' : 'Generate AI Report'}
          </button>
          {report && <button type="button" onClick={() => void generate(true)} disabled={isLoading} className="inline-flex items-center gap-1.5 rounded-lg border border-lmu-border px-3 py-2 text-xs font-semibold text-lmu-muted hover:text-white disabled:opacity-50">
            <RefreshCw className="h-3.5 w-3.5" /> Regenerate
          </button>}
        </div>
      </div>

      {errorCode && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{errorMessages[errorCode]}{errorMessage && <span className="mt-1 block text-xs text-red-200/70">{errorMessage}</span>}</div>}

      {report && <div className="space-y-3">
        <section className="rounded-xl border border-lmu-border bg-lmu-card/60 p-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-lmu-accent">Overall Summary</h4>
          <p className="text-sm leading-relaxed text-white">{report.report.overallSummary}</p>
        </section>
        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-lmu-accent">Key Improvements</h4>
          {report.report.improvements.map((item, index) => <article key={`${item.title}-${index}`} className="rounded-xl border border-lmu-border bg-lmu-card/60 p-4">
            <h5 className="text-sm font-bold text-white">{item.title}</h5>
            <div className="mt-3 space-y-2 text-sm leading-relaxed">
              <p><strong className="text-emerald-300">Action:</strong> <span className="text-white">{item.action}</span></p>
              <p><strong className="text-lmu-accent">Why:</strong> <span className="text-lmu-muted">{item.why}</span></p>
              <p><strong className="text-lmu-accent">Next lap:</strong> <span className="text-lmu-muted">{item.executionCue}</span></p>
              <p><strong className="text-lmu-accent">Verify:</strong> <span className="text-lmu-muted">{item.verify}</span></p>
            </div>
            {item.estimatedGainSec !== undefined && <span className="mt-2 inline-block text-xs font-semibold text-emerald-300">Potential lap-time gain: {item.estimatedGainSec.toFixed(3)}s</span>}
          </article>)}
        </section>
        <p className="text-right text-[11px] text-lmu-muted">{report.cached ? 'Cached report' : 'Generated now'}{report.tokensUsed ? ` · ${report.tokensUsed.total} tokens` : ''}</p>
      </div>}
    </div>
  );
};
