import { Sun } from 'lucide-react';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { setSceneTimeOfDay, useSceneTimeOfDay } from './timeOfDay.js';

/**
 * Switches the 3D scene between the session's own time of day (a night race is dark, as driven) and a fixed midday (easy to see),
 * the same in every view (timeOfDay.ts).
 */
export function TimeOfDayButton() {
  const daylight = useSceneTimeOfDay() === 'daylight';
  const title = daylight ? 'Daylight on: midday instead of the session time' : 'Daylight: show midday instead of the session time';
  return (
    <button type="button" onClick={() => setSceneTimeOfDay(daylight ? 'session' : 'daylight')}
      aria-label="Daylight" aria-pressed={daylight} title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
        daylight ? 'bg-lmu-accent text-lmu-text' : 'bg-lmu-raised/40 hover:bg-lmu-raised text-lmu-muted hover:text-lmu-text'
      } ${FOCUS_RING}`}>
      <Sun className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  );
}
