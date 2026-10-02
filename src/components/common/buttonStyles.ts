/** One focus ring for every control: 2px, offset, in the red text step (DESIGN.md, Focus). */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text';

/**
 * Primary button (DESIGN.md): red fill, 12px radius, bold uppercase tracked label, 10px x 20px.
 * Disabled turns neutral rather than fading the red; a running action sets `data-busy="true"` and keeps full strength.
 */
export const PRIMARY_BUTTON =
  `inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-lmu-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-lmu-accent/90 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:bg-lmu-raised disabled:text-lmu-faint disabled:hover:bg-lmu-raised disabled:data-[busy=true]:cursor-default disabled:data-[busy=true]:bg-lmu-accent disabled:data-[busy=true]:text-white ${FOCUS_RING}`;

/** Secondary button: a neutral 32px `lmu-card` button with a hairline, sentence-case label. */
export const SECONDARY_BUTTON =
  `inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-lmu-card border border-lmu-rule text-lmu-text-soft font-semibold text-xs hover:bg-lmu-card-hover hover:text-white transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-lmu-faint disabled:hover:bg-lmu-card disabled:hover:text-lmu-faint ${FOCUS_RING}`;
