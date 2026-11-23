/** Silence below this level (peak amplitude in a 10 ms frame) counts as a pause. */
const SILENCE = 0.02;
const FRAME_S = 0.01;
/** Kept at the start and end so the first and last sounds are not clipped. */
const EDGE_S = 0.02;

/**
 * Race radio pacing: every pause inside a call is cut to `maxPauseMs`, the silence before and after it to 20 ms.
 * Speech is never touched, so the voice keeps its intonation; only the gaps at commas and full stops shrink.
 */
export function tightenPauses(samples: Float32Array<ArrayBuffer>, sampleRate: number, maxPauseMs: number): Float32Array<ArrayBuffer> {
  const frame = Math.max(1, Math.round(sampleRate * FRAME_S));
  const frames = Math.ceil(samples.length / frame);
  const silent = Array.from({ length: frames }, (_, index) => {
    let peak = 0;
    const end = Math.min(samples.length, (index + 1) * frame);
    for (let i = index * frame; i < end; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
    return peak < SILENCE;
  });
  const first = silent.indexOf(false);
  if (first < 0) return new Float32Array(0);
  const last = silent.lastIndexOf(false);
  const edge = Math.round(EDGE_S / FRAME_S);
  const keepPause = Math.max(1, Math.round(maxPauseMs / 1000 / FRAME_S));
  const kept: number[] = [];
  let run = 0;
  for (let index = Math.max(0, first - edge); index <= Math.min(frames - 1, last + edge); index += 1) {
    const inside = index >= first && index <= last;
    run = silent[index] && inside ? run + 1 : 0;
    if (run <= keepPause) kept.push(index);
  }
  const out = new Float32Array(kept.length * frame);
  let length = 0;
  for (const index of kept) {
    const piece = samples.subarray(index * frame, Math.min(samples.length, (index + 1) * frame));
    out.set(piece, length);
    length += piece.length;
  }
  return out.slice(0, length);
}
