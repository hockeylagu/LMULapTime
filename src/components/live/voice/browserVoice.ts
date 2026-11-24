/** The browser's own voice (`speechSynthesis`): it needs no prepared clips, and plays on the Windows default output only. */
export const radioVoiceSupported = (): boolean =>
  typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';

/** Speaks one text in the browser's English voice at `volume` percent; null when the browser refused it. */
export function speakRadio(text: string, volume: number, onError?: () => void): SpeechSynthesisUtterance | null {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB';
  utterance.rate = 1;
  utterance.volume = Math.min(1, Math.max(0, volume / 100));
  if (onError) utterance.onerror = onError;
  try { window.speechSynthesis.speak(utterance); }
  catch { return null; }
  return utterance;
}
