import React, { useEffect, useRef, useState } from 'react';
import type { LiveLearningReadiness } from '../../../../shared/types/liveLearning.js';
import { apiErrorMessage, fetchJson, isAbortError } from '../../../api/apiClient.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { exclusionSummary, LEARNING_GATE_LABELS } from './readinessCopy.js';
import { SettingsPanel } from '../SettingsPanel.js';

/** Manual, off-track evidence review; opening Settings never starts evaluation or polling. */
export const LiveLearningPanel: React.FC = () => {
  const [report, setReport] = useState<LiveLearningReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const check = async () => {
    active.current?.abort();
    const request = new AbortController(); active.current = request;
    setLoading(true); setError(null); setReport(null);
    try {
      const result = await fetchJson<LiveLearningReadiness>('/api/live/learning', { signal: request.signal });
      if (!request.signal.aborted) setReport(result);
    } catch (failure) {
      if (!request.signal.aborted && !isAbortError(failure)) setError(apiErrorMessage(failure, 'Unable to check learning evidence.'));
    } finally { if (!request.signal.aborted && active.current === request) setLoading(false); }
  };
  const data = report?.state === 'evaluated' ? report : null;
  const exclusions = data ? exclusionSummary(data.dataset.exclusions) : [];
  const failed = data?.sources.find(source => source.state === 'failed')?.count ?? 0;
  const stale = data?.sources.find(source => source.state === 'stale')?.count ?? 0;

  return <SettingsPanel sectionId="learning" aside={
    <button type="button" className={SECONDARY_BUTTON} disabled={loading} onClick={() => void check()}>
        {loading ? 'Checking evidence…' : report || error ? 'Check again' : 'Check evidence'}
    </button>
  }>
    <p className="text-xs leading-relaxed text-lmu-muted max-w-prose">
      Fuel and virtual energy learning runs automatically after sessions. Keep driving normally; this check only refreshes the status.
    </p>
    {loading && <p role="status" className="text-xs text-lmu-muted">Checking recorded evidence outside the live capture process…</p>}
    {error && <p role="alert" className="text-xs text-lmu-loss">{error}</p>}
    {report?.state === 'deferred' && <p role="status" className="text-xs text-lmu-muted">{report.message}</p>}
    {data && <>
      <p className="text-xs text-lmu-muted">{!data.automaticLearning.enabled ? 'Automatic corrections are disabled by server configuration.'
        : `${data.automaticLearning.active} validated corrections available · ${data.automaticLearning.validating} awaiting fresh sessions. Corrections require an exact match and a verified XML game patch from this game run.`}</p>
      <p role="status" className="text-xs text-lmu-text-soft">
        <span className="font-mono">{data.dataset.eligible}</span> usable measurements · <span className="font-mono">{data.captures.verified}</span> of{' '}
        <span className="font-mono">{data.captures.indexed}</span> recordings matched to sessions.
        {data.dataset.eligible === 0 && (data.processing.pending > 0
          ? ' Recorded evidence is waiting for processing or reprocessing.'
          : data.captures.indexed > data.captures.verified ? ' Recordings need a verified session match.'
            : ' New clean laps with recorded lap-start forecasts are needed.')}
      </p>
      {(failed > 0 || stale > 0) && <p className="text-xs text-lmu-warn">
        Processing failures: <span className="font-mono">{failed}</span> · Awaiting reprocessing: <span className="font-mono">{stale}</span>.
      </p>}
      {data.captures.unavailable > 0 && <p className="text-xs text-lmu-muted">
        Raw recordings unavailable: <span className="font-mono">{data.captures.unavailable}</span>. Retained eligible measurements can still count.
      </p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <caption className="text-left text-lmu-muted pb-2">
            Chronological split: <span className="font-mono">{data.sessions.training}</span> earlier sessions and{' '}
            <span className="font-mono">{data.sessions.heldOut}</span> later sessions.
          </caption>
          <thead className="text-lmu-muted"><tr className="border-b border-lmu-border">
            <th scope="col" className="py-2 pr-4 font-medium">Resource</th>
            <th scope="col" className="py-2 pr-4 font-medium">Earlier measurements</th>
            <th scope="col" className="py-2 pr-4 font-medium">Later measurements</th>
            <th scope="col" className="py-2 font-medium">Offline checks by matching group</th>
          </tr></thead>
          <tbody>{data.resources.map(resource => <tr key={resource.kind} className="border-b border-lmu-border text-lmu-text-soft">
            <th scope="row" className="py-2 pr-4 font-medium">{resource.kind === 'fuel' ? 'Fuel' : 'Virtual energy'}</th>
            <td className="py-2 pr-4 font-mono">{resource.trainingExamples}</td>
            <td className="py-2 pr-4 font-mono">{resource.heldOutExamples}</td>
            <td className="py-2 leading-relaxed">
              {resource.trainingExamples + resource.heldOutExamples === 0 ? 'No eligible evidence' : <>
                Passing: <span className="font-mono">{resource.passingCohorts}</span> · Rejected: <span className="font-mono">{resource.rejectedCohorts}</span> ·{' '}
                Need more evidence: <span className="font-mono">{resource.insufficientCohorts}</span>
              </>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      {exclusions.length > 0 && <div className="space-y-1">
        <h4 className="text-xs font-semibold text-lmu-text">Excluded evidence: <span className="font-mono">{data.dataset.excluded}</span> measurements</h4>
        <ul className="text-xs text-lmu-muted space-y-1">{exclusions.slice(0, 6).map(reason =>
          <li key={reason.label} className="flex justify-between gap-4"><span>{reason.label}</span><span className="font-mono">{reason.count}</span></li>)}</ul>
        <p className="text-xs text-lmu-muted">Reason counts can overlap.{exclusions.length > 6 && ' Showing the six most common reasons.'}</p>
      </div>}
      <details className="text-xs text-lmu-muted">
        <summary className={`cursor-pointer ${FOCUS_RING}`}>Minimum evidence and offline checks</summary>
        <div className="mt-2 space-y-2 max-w-prose leading-relaxed">
          <p>Each matching group needs at least <span className="font-mono">{data.minimumEvidence.trainSessions}</span> earlier sessions with{' '}
            <span className="font-mono">{data.minimumEvidence.trainExamples}</span> measurements, plus{' '}
            <span className="font-mono">{data.minimumEvidence.testSessions}</span> later sessions with{' '}
            <span className="font-mono">{data.minimumEvidence.testExamples}</span> measurements.</p>
          <p>Groups keep layout, car, driver, game patch, weather, tyres and predictor version/source separate. After offline checks, fixed corrections must improve predictions on two fresh sessions with at least 20 measurements before automatic use. Later regressions withdraw them.</p>
          {data.resources.filter(resource => Object.keys(resource.gates).length > 0).map(resource => <div key={resource.kind}>
            <h4 className="font-semibold text-lmu-text-soft">{resource.kind === 'fuel' ? 'Fuel' : 'Virtual energy'}: checks still unmet</h4>
            <ul className="mt-1 space-y-1">{Object.entries(resource.gates).map(([gate, count]) => <li key={gate}>
              {LEARNING_GATE_LABELS[gate] ?? 'Other offline checks'} · <span className="font-mono">{count}</span> matching group{count === 1 ? '' : 's'}
            </li>)}</ul>
          </div>)}
        </div>
      </details>
      <p className="text-xs text-lmu-muted">Checked {new Date(data.generatedAt).toLocaleString()}. Check again after new recordings are processed.</p>
    </>}
  </SettingsPanel>;
};
