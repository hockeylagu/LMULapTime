/** The British male Kokoro voices offered for the race engineer. */
export const KOKORO_VOICES = [
  { id: 'bm_george', label: 'George' },
  { id: 'bm_lewis', label: 'Lewis' },
  { id: 'bm_daniel', label: 'Daniel' },
  { id: 'bm_fable', label: 'Fable' },
] as const;

export type KokoroVoiceId = (typeof KOKORO_VOICES)[number]['id'];

export type KokoroRequest =
  | { type: 'load' }
  | { type: 'say'; id: number; text: string; voice: KokoroVoiceId; speed: number; pauseMs: number | null };

export type KokoroResponse =
  | { type: 'progress'; file: string; percent: number }
  | { type: 'ready' }
  | { type: 'audio'; id: number; samples: Float32Array<ArrayBuffer>; sampleRate: number; ms: number }
  | { type: 'error'; id: number | null; message: string };
