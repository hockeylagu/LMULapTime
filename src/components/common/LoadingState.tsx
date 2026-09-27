import React, { useMemo } from 'react';
import { Radio } from 'lucide-react';
import { getRandomLoadingQuote } from './loadingQuotes.js';

export interface LoadingStateProps {
  /**
   * Primary title displayed prominently in bold uppercase.
   * Defaults to 'Loading Telemetry & Timing Data'.
   */
  title?: string;
  /**
   * Technical context or subtitle describing the ongoing operation.
   */
  subtitle?: string;
  /**
   * Layout sizing: 'page' for full screen/route transitions, 'compact' for embedded cards/charts.
   * Defaults to 'page'.
   */
  size?: 'page' | 'compact';
  /**
   * Whether to display the randomized humorous pit radio quote.
   * Defaults to true.
   */
  showQuote?: boolean;
  /**
   * Optional manual override for the quote text.
   */
  quote?: string;
  /**
   * Custom CSS classes applied to the root container.
   */
  className?: string;
  /**
   * Optional data-testid attribute for testing.
   */
  dataTestId?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title = 'Loading Telemetry & Timing Data',
  subtitle,
  size = 'page',
  showQuote = true,
  quote: explicitQuote,
  className = '',
  dataTestId = 'loading-state',
}) => {
  // Stable quote selection for the lifecycle of this loading mount
  const activeQuote = useMemo(() => explicitQuote || getRandomLoadingQuote(), [explicitQuote]);

  const isPage = size === 'page';

  return (
    <div
      data-testid={dataTestId}
      className={`w-full flex flex-col items-center justify-center text-center bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] rounded-2xl select-none ${
        isPage ? 'py-16 sm:py-24 px-6 min-h-[300px]' : 'py-8 sm:py-12 px-4 min-h-[160px]'
      } ${className}`}
    >
      {/* Motorsport Dual-Ring Tachometer Spinner */}
      <div className="relative mb-5 flex items-center justify-center">
        {/* Subtle Ambient Pulse Background */}
        <div
          className={`absolute rounded-full bg-lmu-accent/15 blur-md animate-pulse ${
            isPage ? 'w-16 h-16' : 'w-12 h-12'
          }`}
        />

        {/* Outer Rotating Track Accent Ring */}
        <div
          className={`border-4 border-lmu-accent/20 border-t-lmu-accent rounded-full animate-spin ${
            isPage ? 'w-12 h-12' : 'w-9 h-9'
          }`}
        />

        {/* Inner Tachometer Center Point */}
        <div className="absolute w-2 h-2 rounded-full bg-lmu-accent shadow-[0_0_8px_rgba(230,57,70,0.8)]" />
      </div>

      {/* Main Title */}
      <h3
        className={`font-bold text-white uppercase tracking-wider ${
          isPage ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
        }`}
      >
        {title}
      </h3>

      {/* Technical Subtitle */}
      {subtitle && (
        <p className="text-xs text-lmu-muted mt-1.5 max-w-lg leading-relaxed">
          {subtitle}
        </p>
      )}

      {/* Pit Wall Team Radio Funny Quote */}
      {showQuote && activeQuote && (
        <div
          data-testid="loading-quote-badge"
          className="mt-4 sm:mt-5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lmu-strip/90 border border-white/10 text-[11px] sm:text-xs font-mono text-sky-300/90 shadow-sm max-w-xl animate-fadeIn"
        >
          <Radio className="w-3.5 h-3.5 text-lmu-accent shrink-0 animate-pulse" />
          <span className="text-lmu-muted font-sans font-semibold tracking-wide uppercase text-[10px]">
            Pit Radio:
          </span>
          <span className="truncate italic">
            &ldquo;{activeQuote}&rdquo;
          </span>
        </div>
      )}
    </div>
  );
};
