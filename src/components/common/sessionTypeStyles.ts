/**
 * One look per session type, rising with the stakes: practice stays neutral, qualifying is amber,
 * the race is red (the one use of red outside identity and selection). Purple stays with
 * best laps and alien pace, gold with P1. The chip is the same tinted badge as the pace categories.
 */
export interface SessionTypeStyle {
  chip: string;
  dot: string;
}

export const SESSION_TYPE_STYLES: Record<'Practice' | 'Qualifying' | 'Race', SessionTypeStyle> = {
  Practice: { chip: 'bg-lmu-raised text-lmu-text-soft border-lmu-rule', dot: 'bg-lmu-muted' },
  Qualifying: { chip: 'bg-lmu-warn-deep/60 text-lmu-warn-soft border-lmu-warn-strong/40', dot: 'bg-lmu-warn' },
  Race: { chip: 'bg-lmu-accent/20 text-lmu-accent-text border-lmu-accent/40', dot: 'bg-lmu-accent' },
};

/** The style of a session's type; a qualifying session is sometimes only named so. Null for anything else (warm-up). */
export const getSessionTypeStyle = (sessionType?: string | null, sessionName?: string | null): SessionTypeStyle | null => {
  if (sessionType === 'Practice' || sessionType === 'Qualifying' || sessionType === 'Race') return SESSION_TYPE_STYLES[sessionType];
  if (sessionName?.toLowerCase().includes('quali')) return SESSION_TYPE_STYLES.Qualifying;
  return null;
};
