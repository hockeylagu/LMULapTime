/**
 * A call cut into its sentences: "Yellow, Turn 6. Car stopped, left. In your path." is "Yellow, Turn 6.",
 * "Car stopped, left." and "In your path." Clips are joined only at full stops: joined at commas too, each
 * piece kept a sentence's own end tone and sounded off against the whole call (driver, 2026-11-22).
 */
export function callSentences(text: string): string[] {
  return text.split(/(?<=\.)\s+/).map(piece => piece.trim()).filter(Boolean);
}

/** A clip's file name from its text: "Turn 6." is "turn-6-stop.wav". */
export function clipFile(text: string): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'blank'}${text.endsWith(',') ? '-comma' : text.endsWith('.') ? '-stop' : ''}.wav`;
}
