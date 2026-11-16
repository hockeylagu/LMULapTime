import { useEffect, useState, type RefObject } from 'react';
import type { RaceClock } from '../../race/raceClock.js';
import type { RaceStandingsIndex } from '../../race/raceStandings.js';
import { RaceCarTooltip } from '../../race/RaceCarTooltip.js';
import type { RaceSceneHandle } from './raceScene.js';

interface Props {
  /** The element the scene draws into: the pointer is followed over it. */
  host: RefObject<HTMLDivElement | null>;
  scene: RefObject<Pick<RaceSceneHandle, 'pick'> | null>;
  clock: RaceClock;
  index: RaceStandingsIndex;
  /** False while the view is kept loaded behind the 2D map. */
  active: boolean;
}

interface Hover {
  slot: number;
  /** The pointer, CSS pixels from the host's top left corner, and the host's size. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pixels between the pointer and the tooltip, and the room the tooltip needs right of and below the pointer (else it goes the other side). */
const OFFSET_PX = 14, ROOM_X_PX = 280, ROOM_Y_PX = 100;

/**
 * The race map's tooltip for the car of the 3D race view under the pointer, beside the pointer. The car is looked for again as the
 * pointer moves and as the clock moves the cars; none while a button is down (the pointer orbits the camera).
 */
export function RaceCarHover({ host, scene, clock, index, active }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || !active) return;
    let pointer: { x: number; y: number } | null = null;
    const look = () => {
      const at = pointer, slot = at ? scene.current?.pick(at.x, at.y) ?? null : null;
      setHover(current => {
        if (!at || slot === null) return null;
        if (current?.slot === slot && current.x === at.x && current.y === at.y) return current;
        return { slot, x: at.x, y: at.y, width: element.clientWidth, height: element.clientHeight };
      });
    };
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointer = event.buttons ? null : { x: event.clientX - rect.left, y: event.clientY - rect.top };
      look();
    };
    const leave = () => { pointer = null; look(); };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', leave);
    const unsubscribe = clock.subscribe(look);
    return () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', leave);
      unsubscribe();
      setHover(null);
    };
  }, [host, scene, clock, active]);
  if (!hover) return null;
  const right = hover.x < hover.width - ROOM_X_PX, below = hover.y < hover.height - ROOM_Y_PX;
  return (
    <div className="pointer-events-none absolute z-20" style={{
      ...(right ? { left: hover.x + OFFSET_PX } : { right: hover.width - hover.x + OFFSET_PX }),
      ...(below ? { top: hover.y + OFFSET_PX } : { bottom: hover.height - hover.y + OFFSET_PX }),
    }}>
      <RaceCarTooltip index={index} clock={clock} slot={hover.slot} />
    </div>
  );
}
