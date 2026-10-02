import React from 'react';
import { CheckCircle2, Settings, X } from 'lucide-react';
import { Link } from 'react-router';
import { FOCUS_RING } from './buttonStyles.js';

export interface ReferenceLaptimeUpdateToastProps {
  updatedCount: number;
  onDismiss: () => void;
}

export const ReferenceLaptimeUpdateToast: React.FC<ReferenceLaptimeUpdateToastProps> = ({ updatedCount, onDismiss }) => (
  <div
    role="status"
    className="fixed bottom-5 right-5 z-[60] w-[min(26rem,calc(100vw-2.5rem))] rounded-xl border border-lmu-gain/40 bg-lmu-card p-4 text-white shadow-2xl shadow-black/40"
  >
    <div className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-lmu-gain" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Reference lap times updated</p>
        <p className="mt-1 text-xs text-lmu-muted">
          {updatedCount} existing benchmark{updatedCount === 1 ? '' : 's'} changed.
        </p>
        <Link
          to="/settings?section=reference-benchmarks"
          onClick={onDismiss}
          className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-lmu-text-soft hover:text-white hover:underline ${FOCUS_RING}`}
        >
          <Settings className="h-3.5 w-3.5" />
          Review in Settings
        </Link>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss reference lap time update notification"
        className={`rounded-md p-1 text-lmu-muted transition-colors hover:bg-lmu-border/50 hover:text-white ${FOCUS_RING}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  </div>
);