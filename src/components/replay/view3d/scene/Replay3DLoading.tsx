import { AlertTriangle } from 'lucide-react';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { LoadingState } from '../../../common/LoadingState.js';
import { describeLoad, NO_LOAD_PROGRESS, type SceneLoadProgress } from './loadProgress.js';

interface Props {
  progress?: SceneLoadProgress;
  error?: string;
  onRetry: () => void;
}

/** The 3D view's loading card, in the site's loading look with its rings tilted into 3D, plus a progress bar and the step it is on; or the failure with a retry. */
export function Replay3DLoading({progress = NO_LOAD_PROGRESS, error, onRetry}: Props) {
  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
        <div role="alert" className="pointer-events-auto w-full max-w-md rounded-2xl border border-lmu-border bg-lmu-card px-6 py-8 text-center">
          <AlertTriangle aria-hidden className="mx-auto mb-4 h-7 w-7 text-lmu-loss" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">3D replay unavailable</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-lmu-muted">{error}</p>
          <button type="button" onClick={onRetry} className={`mt-4 rounded bg-lmu-raised px-3 py-1.5 text-xs text-lmu-text hover:bg-lmu-card-hover ${FOCUS_RING}`}>
            Retry 3D scene
          </button>
        </div>
      </div>
    );
  }
  const {fraction, label} = describeLoad(progress), percent = Math.round(fraction * 100);
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
      <div role="status" aria-live="polite" className="w-full max-w-lg">
        <LoadingState size="compact" tilted title="Loading 3D replay" subtitle={label} dataTestId="replay-3d-loading">
          <div className="mt-4 flex w-56 items-center gap-2.5">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-lmu-bg" role="progressbar" aria-label="3D replay loading"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div className="h-full rounded-full bg-lmu-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{width: `${Math.max(2, percent)}%`}} />
            </div>
            <span className="w-8 text-right font-mono text-[11px] tabular-nums text-lmu-muted">{percent}%</span>
          </div>
        </LoadingState>
      </div>
    </div>
  );
}

/** The corner note while cars load, the scenery streams in and its textures sharpen behind a shown scene: a line each, gone once done. */
export function Replay3DStreaming({progress, className = ''}: {progress?: SceneLoadProgress; className?: string}) {
  const lines = [
    {label: 'Loading cars', done: progress?.carModels.loaded ?? 0, total: progress?.carModels.total ?? 0},
    {label: 'Streaming scenery', done: progress?.circuit.resident ?? 0, total: progress?.circuit.total ?? 0},
    {label: 'Sharpening textures', done: progress?.textures.sharp ?? 0, total: progress?.textures.total ?? 0},
  ].filter(line => line.total > 0 && line.done < line.total);
  if (lines.length === 0) return null;
  return (
    <div role="status" data-testid="replay-3d-streaming" className={`pointer-events-none absolute right-2 z-20 flex items-start gap-2 rounded-lg border border-lmu-border bg-lmu-card px-2.5 py-1.5 text-[11px] ${className}`}>
      <span aria-hidden className="mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 border-lmu-accent/20 border-t-lmu-accent animate-spin motion-reduce:animate-none" />
      <div className="grid grid-cols-[auto_3.5rem_auto] items-center gap-x-2 gap-y-1">
        {lines.map(({label, done, total}) => [
          <span key={`${label}-label`} className="text-lmu-muted">{label}</span>,
          <div key={`${label}-bar`} className="h-1 overflow-hidden rounded-full bg-lmu-bg">
            <div className="h-full rounded-full bg-lmu-accent transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{width: `${Math.round(done / total * 100)}%`}} />
          </div>,
          <span key={`${label}-count`} className="text-right font-mono tabular-nums text-lmu-text-soft">{done}/{total}</span>,
        ])}
      </div>
    </div>
  );
}
