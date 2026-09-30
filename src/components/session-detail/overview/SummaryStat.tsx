import React from 'react';

export interface SummaryStatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** The value's color, white unless it carries a signal (gain, loss, P1). */
  valueClass?: string;
  title?: string;
  className?: string;
}

/** One summary figure: a quiet label, the value in white mono, an optional muted hint. No box. */
export const SummaryStat: React.FC<SummaryStatProps> = ({ label, value, hint, valueClass = 'text-white', title, className = '' }) => (
  <div className={`min-w-0 ${title ? 'cursor-help' : ''} ${className}`} title={title}>
    <p className="text-[10px] uppercase tracking-wider font-semibold text-lmu-muted truncate">{label}</p>
    <p className={`mt-0.5 font-mono text-base font-bold whitespace-nowrap ${valueClass}`}>{value}</p>
    {hint && <div className="text-[11px] text-lmu-muted truncate">{hint}</div>}
  </div>
);
