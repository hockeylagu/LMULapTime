import type { FieldTrack } from './fieldTrack.js';
import { carClassOf, classWord, countWord, spokenCar } from './spokenCar.js';

/** Cars arriving at the pit exit within this many seconds of the player are named. */
const EXIT_S = 3;

/**
 * Where the player rejoins after a stop costing `lossSeconds` (pit lane loss plus service): the class place and the
 * cars around the exit, "Rejoin P6. Behind the BMW. Ahead of two Hypers." Each car's gap behind the player in seconds
 * is its distance behind over the player's lap; a same-class car within the loss passes the player. Null without the
 * player's lap time.
 */
export function rejoinText(track: FieldTrack, lossSeconds: number): string | null {
  const player = track.player;
  const lap = track.lapSeconds();
  if (!player || lap === null || track.length <= 0) return null;
  const playerClass = carClassOf(player.car);
  const progress = (laps: number, lapDist: number) => laps * track.length + lapDist;
  const playerProgress = progress(player.car.totalLaps, player.car.lapDist);
  const running = [...track.cars.values()].filter(motion => !motion.car.isPlayer && !motion.car.inPits && !motion.car.inGarage
    && motion.car.finishStatus === 0);
  const sameClass = (motion: (typeof running)[number]) => carClassOf(motion.car) === playerClass;
  const gaps = running.map(motion => ({ motion, gap: (playerProgress - progress(motion.car.totalLaps, motion.car.lapDist)) / track.length * lap }));
  const classPlace = 1 + running.filter(motion => sameClass(motion) && motion.car.place > 0 && motion.car.place < player.car.place).length;
  const place = classPlace + gaps.filter(entry => sameClass(entry.motion) && entry.gap > 0 && entry.gap < lossSeconds).length;
  const before = gaps.filter(entry => entry.gap > lossSeconds - EXIT_S && entry.gap <= lossSeconds).sort((a, b) => b.gap - a.gap)[0];
  const after = gaps.filter(entry => entry.gap > lossSeconds && entry.gap <= lossSeconds + EXIT_S);
  const name = (entry: (typeof gaps)[number]) => `the ${spokenCar(entry.motion.car, playerClass)}`;
  // A sentence each: the engineer's clips join at full stops.
  const parts = [`Rejoin P${place}.`];
  if (before) parts.push(`Behind ${name(before)}.`);
  if (after.length === 1) parts.push(`Ahead of ${name(after[0])}.`);
  if (after.length > 1) {
    const classes = new Set(after.map(entry => carClassOf(entry.motion.car)));
    const only = classes.size === 1 ? [...classes][0] : null;
    parts.push(`Ahead of ${countWord(after.length)} ${only && only !== playerClass ? `${classWord(only)}s` : 'cars'}.`);
  }
  return parts.join(' ');
}
