/**
 * What the 3D scene has done towards its first frame, each step from 0 to 1. The steps overlap in time (the scenery, the cars and
 * the lighting load together); the label names the first one still running.
 */
export interface SceneLoadProgress {
  /** The track layout and car bodies, fetched before the scene starts. */
  track: number;
  /** The scenery chunks under the first view: resident of total. */
  scenery: {resident: number; total: number};
  cars: number;
  lighting: number;
  /** Shader compiles and GPU uploads of what the first frame draws. */
  shaders: number;
  /** The whole circuit's scenery chunks, which keep streaming in after the first frame: done of total. */
  circuit: {resident: number; total: number};
  /** The scenery textures sharpening to full detail after the first frame: sharp of those queued so far. */
  textures: {sharp: number; total: number};
  /** Car models loading behind a shown scene (a new lap's cars, the race's field): loaded of those asked for so far. */
  carModels: {loaded: number; total: number};
}

export const NO_LOAD_PROGRESS: SceneLoadProgress = {track: 0, scenery: {resident: 0, total: 0}, cars: 0, lighting: 0, shaders: 0, circuit: {resident: 0, total: 0}, textures: {sharp: 0, total: 0},
  carModels: {loaded: 0, total: 0}};

/**
 * Each step's share of the bar, roughly its share of the wait. One Barcelona load (2026-11-12) took 0.24 s for the track, 1.85 s
 * for the scenery (the car and lighting finished inside it) and 0.5 s for graphics; Le Mans spends longer still on scenery.
 * App assumption: they only pace the bar; nothing else reads them.
 */
const STEPS = [
  {key: 'track', weight: 0.1},
  {key: 'scenery', weight: 0.55},
  {key: 'cars', weight: 0.1},
  {key: 'lighting', weight: 0.05},
  {key: 'shaders', weight: 0.2},
] as const;

function stepDone(progress: SceneLoadProgress, key: (typeof STEPS)[number]['key']): number {
  if (key !== 'scenery') return Math.max(0, Math.min(1, progress[key]));
  const {resident, total} = progress.scenery;
  return total > 0 ? Math.min(1, resident / total) : 0;
}

/** The share of the load done (0 to 1) and what it is doing now. */
export function describeLoad(progress: SceneLoadProgress): {fraction: number; label: string} {
  const fraction = STEPS.reduce((sum, step) => sum + step.weight * stepDone(progress, step.key), 0);
  const running = STEPS.find(step => stepDone(progress, step.key) < 1)?.key;
  const {resident, total} = progress.scenery;
  switch (running) {
    case 'track': return {fraction, label: 'Fetching the track and car'};
    case 'scenery': return {fraction, label: total > 0 ? `Loading scenery · ${resident} of ${total}` : 'Loading scenery'};
    case 'cars': return {fraction, label: 'Preparing the car'};
    case 'lighting': return {fraction, label: 'Lighting the scene'};
    case 'shaders': return {fraction, label: 'Preparing graphics'};
    case undefined: return {fraction: 1, label: 'Starting'};
  }
}
