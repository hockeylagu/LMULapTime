import { FOCUS_RING } from '../buttonStyles.js';

/**
 * The one dropdown family (DESIGN.md, Dropdowns): an `lmu-bg` well with a hairline and 8px corners (12px in 36px filter rows). Hover and
 * the open state lift it one tonal step and move the hairline to `lmu-rule`; red is kept for keyboard focus.
 */
const TRIGGER_BASE =
  `inline-flex min-w-0 items-center gap-2 border border-lmu-border bg-lmu-bg font-semibold text-white transition-colors hover:border-lmu-rule hover:bg-lmu-card aria-expanded:border-lmu-rule aria-expanded:bg-lmu-card disabled:text-lmu-faint disabled:hover:border-lmu-border disabled:hover:bg-lmu-bg ${FOCUS_RING}`;

/** 32px trigger: headers, settings and the fullscreen lap and trace controls. */
export const DROPDOWN_TRIGGER = `${TRIGGER_BASE} h-8 rounded-lg px-2.5 text-xs`;

/** 36px trigger for list filter rows, level with the 36px, 12px-radius session search field beside it. */
export const DROPDOWN_TRIGGER_FILTER = `${TRIGGER_BASE} h-9 rounded-xl px-3 text-xs`;

/** 24px trigger for rows that cannot take 32px: trace titles and the telemetry toolbar. */
export const DROPDOWN_TRIGGER_COMPACT = `${TRIGGER_BASE} h-6 rounded-lg px-2 text-[11px]`;

/** The single muted chevron; decorative, so screen readers skip it. */
export const DROPDOWN_CHEVRON = 'h-3.5 w-3.5 shrink-0 text-lmu-muted';

/** A muted caption inside a trigger ("Sort:", "Driver"). */
export const DROPDOWN_CAPTION = 'shrink-0 font-medium text-lmu-muted';

/** The open panel: opaque card, hairline, 8px corners, one overlay shadow. Lists add DROPDOWN_LIST_INSET. */
export const DROPDOWN_PANEL = 'rounded-lg border border-lmu-border bg-lmu-card shadow-xl animate-pop-in';

/** Inset of an option list; informational and settings panels use DROPDOWN_CONTENT_INSET. */
export const DROPDOWN_LIST_INSET = 'p-1';
export const DROPDOWN_CONTENT_INSET = 'p-3';

/** An option row: at least 32px, neutral raised hover; the selected row also carries a white check. */
export const DROPDOWN_OPTION =
  'flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-lmu-text-soft hover:bg-lmu-raised hover:text-white';
export const DROPDOWN_OPTION_SELECTED = 'bg-lmu-raised font-semibold text-white';

/** Uppercase caption of an option group. */
export const DROPDOWN_GROUP_LABEL = 'px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-lmu-muted';
