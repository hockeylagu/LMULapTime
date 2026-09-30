import React from 'react';

export interface LoadErrorProps {
  message: string;
  /** Loads again; the notice has no button without it. */
  onRetry?: () => void;
}

/** A part of the leaderboard page that could not load: the server's message and a way to try again. */
export const LoadError: React.FC<LoadErrorProps> = ({ message, onRetry }) => (
  <div role="alert" className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-lmu-loss-strong/30 bg-lmu-loss-strong/10 text-sm">
    <p className="min-w-0 break-words text-lmu-loss-soft">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded text-xs font-bold text-lmu-text-soft underline underline-offset-4 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent"
      >
        Try again
      </button>
    )}
  </div>
);
