import React from 'react';
import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';

export interface PathFieldProps {
  id: string;
  /** Short caption; the longer explanation goes in `help`. */
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
  /** The path the server is using now, and whether it found it. */
  savedValue?: string;
  exists?: boolean;
  placeholder?: string;
  /** Free text (a driver name) rather than a folder path. */
  plain?: boolean;
}

/** One labelled input. A folder shows a single status: Detected, Not found, or edited and waiting for a rescan. */
export const PathField: React.FC<PathFieldProps> = ({
  id,
  label,
  help,
  value,
  onChange,
  icon,
  savedValue,
  exists,
  placeholder,
  plain = false,
}) => {
  const isEdited = !plain && !!savedValue && value.trim() !== savedValue.trim();
  const showStatus = !plain && !isEdited;
  const found = exists === true;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5 min-h-5">
        <label htmlFor={id} className="text-xs font-semibold text-lmu-muted uppercase tracking-wider">
          {label}
        </label>
        {showStatus && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${found ? 'text-lmu-gain' : 'text-lmu-loss'}`}>
            {found ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <AlertCircle className="w-4 h-4" aria-hidden="true" />}
            {found ? 'Detected' : 'Not found'}
          </span>
        )}
        {isEdited && (
          <span className="inline-flex items-center gap-2 text-xs text-lmu-muted">
            Changed, rescan to check
            <button
              type="button"
              onClick={() => onChange(savedValue ?? '')}
              className="inline-flex items-center gap-1 font-semibold text-lmu-text-soft hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Reset
              <span className="sr-only"> {label} to the saved path</span>
            </button>
          </span>
        )}
      </div>
      <div className="relative">
        <span className="absolute left-3.5 top-3 text-lmu-muted pointer-events-none">{icon}</span>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className={`w-full bg-lmu-bg border border-lmu-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:border-lmu-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text ${plain ? 'font-sans' : 'font-mono'}`}
        />
      </div>
      <p className="text-[11px] text-lmu-muted mt-1">{help}</p>
    </div>
  );
};
