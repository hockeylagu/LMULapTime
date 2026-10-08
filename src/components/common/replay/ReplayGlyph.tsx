import React from 'react';
import { FOCUS_RING } from '../buttonStyles.js';

export interface ReplayGlyphProps {
  /** The session also has the car's own telemetry: the trace is cut out of the triangle and it turns green. */
  telemetry?: boolean;
  /** Pixel size; 16 in buttons, 14 in dense rows. */
  size?: number;
  className?: string;
}

/**
 * The one replay icon: a solid play triangle, with a telemetry trace knocked out of it when the session has its own
 * telemetry. Both states keep the same silhouette, so a column of rows stays aligned.
 */
export const ReplayGlyph: React.FC<ReplayGlyphProps> = ({ telemetry = false, size = 16, className = '' }) => {
  const maskId = React.useId();
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={`shrink-0 ${telemetry ? REPLAY_TELEMETRY_TEXT : ''} ${className}`}
      data-replay-glyph={telemetry ? 'telemetry' : 'replay'}
    >
      {telemetry && (
        <mask id={maskId}>
          <rect width="16" height="16" fill="white" />
          {/* The cut stops short of the tip so the triangle reads whole */}
          <polyline points="2.5,8.2 5.4,8.2 6.6,5.8 8,10.4 9.1,8.2 10.4,8.2" fill="none" stroke="black"
            strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </mask>
      )}
      <path
        d={telemetry ? 'M3.6 2.4 L13.6 8 L3.6 13.6 Z' : 'M4 2.8 L13 8 L4 13.2 Z'}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={telemetry ? 1 : 1.2}
        strokeLinejoin="round"
        mask={telemetry ? `url(#${maskId})` : undefined}
      />
    </svg>
  );
};

/** Telemetry colour: the glyph and the label of a replay that brings the car's own telemetry. */
export const REPLAY_TELEMETRY_TEXT = 'text-lmu-gain';

/** A replay that opens: a neutral card button, white label; the glyph carries the colour. */
export const REPLAY_ACTION =
  `inline-flex items-center justify-center gap-2 rounded-lg border border-lmu-rule bg-lmu-card text-lmu-text text-xs font-bold hover:bg-lmu-cardHover hover:border-lmu-rule-strong transition-colors cursor-pointer ${FOCUS_RING}`;

/** A replay still decoding or failed: the same shape, muted, not clickable. */
export const REPLAY_BUSY =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-lmu-border text-lmu-muted text-xs font-semibold cursor-default';

/** Compact (rows) and labelled (headers) sizes. */
export const REPLAY_COMPACT = 'h-7 w-8 shrink-0';
export const REPLAY_LABELLED = 'h-8 px-3';
