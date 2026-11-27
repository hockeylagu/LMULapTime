import { describe, expect, it } from 'vitest';
import type { LiveCall } from '../../../../../shared/domain/live/radio/liveCalls.js';
import { FieldWatch } from '../../../../../shared/domain/live/radio/field/fieldCalls.js';
import { FieldTrack } from '../../../../../shared/domain/live/radio/field/fieldTrack.js';
import { rejoinText } from '../../../../../shared/domain/live/radio/field/rejoinCall.js';
import { spokenCar } from '../../../../../shared/domain/live/radio/field/spokenCar.js';
import type { LiveFieldCar, LivePrivateSessions } from '../../../../../shared/types/liveField.js';
import type { LiveSnapshot } from '../../../../../shared/types/live.js';
import { liveSnapshot, liveStrategy } from '../../../../helpers/liveSnapshot.js';

const LENGTH = 3000;
const HZ = 5;
const PORSCHE = { vehicleClass: 'Hyper', vehicleName: 'Porsche 963 Custom Team 2025 #397', vehFilename: '397_25_963' };
const GENESIS = { vehicleClass: 'Hyper', vehicleName: 'Genesis Custom Team 2026 #397', vehFilename: '397_26_GMR001' };
const LEXUS = { vehicleClass: 'GT3', vehicleName: 'Lexus Custom Team 2026 #397', vehFilename: '397_26_LEXUS' };

/** A car the test drives: where it is and how fast it goes from here; `stop` parks it. */
interface Driven { car: LiveFieldCar; speed: (car: LiveFieldCar) => number }

const car = (id: number, lapDist: number, patch: Partial<LiveFieldCar> = {}): LiveFieldCar => ({
  id, isPlayer: false, place: id, ...LEXUS, totalLaps: 3, sector: 1, lapDist, speed: 50, pathLateral: -1, trackEdge: -6,
  inPits: false, inGarage: false, control: 2, finishStatus: 0, ...patch,
});

/** A race on a 3 km lap: the cars move at their speed, the watch reads them five times a second. */
function race(cars: Driven[], snapshot: LiveSnapshot = liveSnapshot({ audit: { runId: 'run', status: 'recording' } }),
  privateSessions: LivePrivateSessions | null = null) {
  const watch = new FieldWatch();
  let t = 0;
  let flags: [number, number, number] = [11, 11, 11];
  const heard: LiveCall[] = [];
  const step = (seconds: number) => {
    for (let index = 0; index < Math.round(seconds * HZ); index += 1) {
      t += 1 / HZ;
      for (const driven of cars) {
        const speed = driven.speed(driven.car);
        let lapDist = driven.car.lapDist + speed / HZ;
        let totalLaps = driven.car.totalLaps;
        if (lapDist >= LENGTH) { lapDist -= LENGTH; totalLaps += 1; }
        const sector = lapDist < 1000 ? 1 : lapDist < 2000 ? 2 : 0;
        driven.car = { ...driven.car, lapDist, totalLaps, speed, sector };
      }
      const calls = watch.observe(t, LENGTH, 5, { sectorFlags: flags, cars: cars.map(driven => driven.car) }, {
        snapshot, pitLaneSeconds: 30, privateSessions, turnAt: lapDist => (lapDist > 1400 && lapDist < 1600 ? 'Turn 6' : null),
      });
      for (const call of calls) if (!heard.some(entry => entry.key === call.key)) heard.push(call);
    }
  };
  return { step, heard, texts: () => heard.map(call => call.text), setFlags: (next: [number, number, number]) => { flags = next; } };
}

const steady = (speed: number) => () => speed;

describe('field calls', () => {
  it('calls the field in a public qualifying only, and in practice unless it is private', () => {
    const base = liveSnapshot({ audit: { runId: 'run', status: 'recording' } });
    const heard = (kind: 'qualifying' | 'practice', sessions: LivePrivateSessions | null) => {
      const player: Driven = { car: car(1, 300, { isPlayer: true, pathLateral: -1.5 }), speed: steady(50) };
      const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
      const stopped: Driven = { car: car(30, 800, { pathLateral: -2 }), speed: steady(0) };
      const radio = race([player, ...others, stopped], { ...base, session: { ...base.session!, kind, sessionCode: kind === 'qualifying' ? 5 : 1 } }, sessions);
      radio.setFlags([11, 1, 11]);
      radio.step(140);
      return radio.texts().length;
    };
    // Private qualifying (Sebring 2026-11-22): every car in the scoring data, none on the player's track.
    expect(heard('qualifying', { qualifying: true, practice: false })).toBe(0);
    // Not read yet: counted as private.
    expect(heard('qualifying', null)).toBe(0);
    expect(heard('qualifying', { qualifying: false, practice: false })).toBeGreaterThan(0);
    expect(heard('practice', null)).toBeGreaterThan(0);
    expect(heard('practice', { qualifying: true, practice: true })).toBe(0);
  });

  it('calls a slow car only within 8 s, where a stopped car is called from 15 s', () => {
    let slow = false;
    const player: Driven = { car: car(1, 100, { isPlayer: true, pathLateral: -1.5 }), speed: steady(50) };
    const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
    const victim: Driven = { car: car(30, 400, { pathLateral: -2 }), speed: () => (slow ? 10 : 50) };
    const radio = race([player, ...others, victim]);
    radio.step(130);
    // 600 m ahead (12 s at the player's pace), closing at 40 m/s.
    slow = true;
    victim.car = { ...victim.car, lapDist: 700 };
    player.car = { ...player.car, lapDist: 100 };
    radio.step(4);
    expect(radio.texts()).toEqual([]);
    radio.step(3);
    expect(radio.texts()).toEqual([expect.stringMatching(/Slow car, /)]);
  });

  it('starts a call with a capital where no turn is named and no yellow is out', () => {
    let stopped = false;
    const player: Driven = { car: car(1, 100, { isPlayer: true, pathLateral: -1.5 }), speed: steady(50) };
    const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
    const victim: Driven = { car: car(30, 400, { pathLateral: -2 }), speed: () => (stopped ? 0 : 50) };
    const radio = race([player, ...others, victim]);
    radio.step(130);
    stopped = true;
    victim.car = { ...victim.car, lapDist: 800 };
    player.car = { ...player.car, lapDist: 300 };
    radio.step(3);
    stopped = false;
    radio.step(2);
    expect(radio.texts()).toEqual(['Sector 1. Car stopped, left. In your path.', 'Sector 1 clear.']);
  });

  it('names a car stopped on the player\'s line within 15 s, once, then the turn clearing', () => {
    let stopped = false;
    const player: Driven = { car: car(1, 100, { isPlayer: true, pathLateral: -1.5 }), speed: steady(50) };
    const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
    const victim: Driven = { car: car(30, 400, { pathLateral: -2 }), speed: () => (stopped ? 0 : 50) };
    const radio = race([player, ...others, victim]);
    radio.step(130);
    expect(radio.texts()).toEqual([]);
    // Parked in Turn 6, ahead of the player.
    stopped = true;
    victim.car = { ...victim.car, lapDist: 1500 };
    player.car = { ...player.car, lapDist: 1000 };
    radio.step(1);
    expect(radio.texts()).toEqual([]);
    radio.step(2);
    expect(radio.heard).toMatchObject([{ text: 'Turn 6. Car stopped, left. In your path.', priority: 1, family: 'incident' }]);
    // The car drives off before the player gets there.
    stopped = false;
    radio.step(2);
    expect(radio.texts()).toEqual(['Turn 6. Car stopped, left. In your path.', 'Turn 6 clear.']);
  });

  it('says cars stopped together as one call', () => {
    let stopped = false;
    const player: Driven = { car: car(1, 100, { isPlayer: true, pathLateral: -1.5 }), speed: steady(50) };
    const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
    const victims = [30, 31].map((id): Driven => ({ car: car(id, 400, { pathLateral: -2 }), speed: () => (stopped ? 0 : 50) }));
    const radio = race([player, ...others, ...victims]);
    radio.step(130);
    stopped = true;
    victims.forEach((victim, index) => { victim.car = { ...victim.car, lapDist: 1530 - index * 30 }; });
    player.car = { ...player.car, lapDist: 1000 };
    radio.step(3);
    expect(radio.texts()).toEqual(['Turn 6. Two cars stopped, left. In your path.']);
  });

  it('says cars off track as a P2, and the cars rejoining slowly close ahead as one P1', () => {
    let state: 'racing' | 'off' | 'back' = 'racing';
    const player: Driven = { car: car(1, 100, { isPlayer: true }), speed: steady(50) };
    const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
    const victims = [30, 31].map((id): Driven => ({ car: car(id, 700), speed: () => ({ racing: 50, off: 0, back: 10 })[state] }));
    const radio = race([player, ...others, ...victims]);
    radio.step(130);
    player.car = { ...player.car, lapDist: 1000 };
    victims.forEach((victim, index) => { victim.car = { ...victim.car, lapDist: 1450 + index * 30, pathLateral: 10, trackEdge: 6 }; });
    state = 'off';
    radio.step(3);
    expect(radio.heard).toMatchObject([{ text: 'Turn 6. Two cars off right.', priority: 2, family: 'incident' }]);
    state = 'back';
    for (const victim of victims) victim.car = { ...victim.car, pathLateral: 3 };
    radio.step(0.4);
    // The same cars coming back are not said again (Le Mans 2026-11-24: one car off, then on track, then rejoining).
    expect(radio.texts().filter(text => text.includes('Turn 6'))).toEqual(['Turn 6. Two cars off right.']);
  });

  it('says cars rejoining slowly close ahead as one P1 when they went off unsaid', () => {
    let state: 'racing' | 'off' | 'back' = 'racing';
    const player: Driven = { car: car(1, 100, { isPlayer: true }), speed: steady(50) };
    const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
    const victims = [30, 31].map((id): Driven => ({ car: car(id, 700), speed: () => ({ racing: 50, off: 0, back: 10 })[state] }));
    const radio = race([player, ...others, ...victims]);
    radio.step(130);
    // Off 27 s ahead: too far to say.
    player.car = { ...player.car, lapDist: 100 };
    victims.forEach((victim, index) => { victim.car = { ...victim.car, lapDist: 1450 + index * 30, pathLateral: 10, trackEdge: 6 }; });
    state = 'off';
    radio.step(3);
    expect(radio.texts()).toEqual([]);
    player.car = { ...player.car, lapDist: 1200 };
    state = 'back';
    for (const victim of victims) victim.car = { ...victim.car, pathLateral: 3 };
    radio.step(0.4);
    expect(radio.heard.filter(call => call.text.includes('rejoining'))).toMatchObject([{ text: 'Turn 6. Car rejoining, careful.', priority: 1 }]);
  });

  it('waits longer on a car that froze and jumped on before, and leaves a car far ahead for later', () => {
    let frozen = false;
    const player: Driven = { car: car(1, 100, { isPlayer: true }), speed: steady(50) };
    const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
    const lagging: Driven = { car: car(30, 500), speed: () => (frozen ? 0 : 50) };
    const radio = race([player, ...others, lagging]);
    radio.step(130);
    player.car = { ...player.car, lapDist: 100 };
    lagging.car = { ...lagging.car, lapDist: 400 };
    frozen = true;
    radio.step(3);
    const stopped = () => radio.texts().filter(text => text.includes('stopped'));
    expect(stopped()).toHaveLength(1);
    // It reappears 150 m on: a freeze, so its next stall waits 4.5 s.
    frozen = false;
    lagging.car = { ...lagging.car, lapDist: lagging.car.lapDist + 150 };
    radio.step(1);
    player.car = { ...player.car, lapDist: 100 };
    frozen = true;
    radio.step(3);
    expect(stopped()).toHaveLength(1);
  });

  it('calls the game\'s sector yellow when no car explains it, then green once it holds', () => {
    const player: Driven = { car: car(1, 100, { isPlayer: true }), speed: steady(50) };
    const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
    const radio = race([player, ...others]);
    radio.step(130);
    player.car = { ...player.car, lapDist: 600 };
    radio.setFlags([11, 1, 11]);
    radio.step(1);
    expect(radio.texts()).toEqual([]);
    radio.step(1.4);
    expect(radio.texts()).toEqual(['Yellow, sector 2.']);
    radio.setFlags([11, 11, 11]);
    radio.step(11);
    expect(radio.texts()).toEqual(['Yellow, sector 2.', 'Green, sector 2.']);
  });

  it('says no green for a sector already driven through, nor for a yellow never said', () => {
    // Spa race 2026-11-26: "Green, sector 3." with the player in sector 1, and for a yellow never heard.
    const player: Driven = { car: car(1, 100, { isPlayer: true }), speed: steady(50) };
    const others = Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: steady(50) }));
    const radio = race([player, ...others]);
    radio.step(130);
    player.car = { ...player.car, lapDist: 600 };
    radio.setFlags([11, 1, 11]);
    radio.step(2.4);
    expect(radio.texts()).toEqual(['Yellow, sector 2.']);
    // Through sector 2 and into sector 3 before the flag turns green.
    radio.step(28);
    radio.setFlags([11, 11, 11]);
    radio.step(11);
    expect(radio.texts()).toEqual(['Yellow, sector 2.']);
    // A car stopped too close to say in time under a yellow: neither the car nor its green is said.
    let stopped = false;
    const driver: Driven = { car: car(1, 100, { isPlayer: true }), speed: steady(50) };
    const victim: Driven = { car: car(30, 200), speed: () => (stopped ? 0 : 50) };
    const late = race([driver, ...others, victim]);
    late.step(130);
    driver.car = { ...driver.car, lapDist: 1000 };
    victim.car = { ...victim.car, lapDist: 1100 };
    stopped = true;
    late.setFlags([11, 1, 11]);
    late.step(3);
    expect(late.texts()).toEqual([]);
    late.setFlags([11, 11, 11]);
    late.step(11);
    expect(late.texts().filter(text => text.startsWith('Green'))).toEqual([]);
  });

  it('says a faster car catching into a corner, and a group of them as one call', () => {
    // A GT3 driver: flat out on the first half of the lap, 25 m/s through the second.
    const pace = (target: LiveFieldCar) => (target.lapDist < 1500 ? 50 : 25);
    const player: Driven = { car: car(1, 0, { isPlayer: true }), speed: pace };
    const cars = [player, ...Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: pace }))];
    const radio = race(cars);
    radio.step(130);
    const until = (from: number) => { while (!(player.car.lapDist >= from && player.car.lapDist < from + 20)) radio.step(0.2); };
    // 150 m behind, 25 m/s faster: six seconds out is too soon to say.
    until(1260);
    cars.push({ car: car(40, player.car.lapDist - 150, PORSCHE), speed: steady(75) });
    radio.step(0.4);
    expect(radio.heard).toEqual([]);
    // Three seconds out, the pass lands in the slow half: the car alone.
    radio.step(2.6);
    expect(radio.heard).toMatchObject([{ text: 'Hyper Porsche behind.', priority: 2, family: 'traffic', immediate: true }]);
    // Next lap, two of them together are one call, and a third joining the train says nothing new.
    cars.pop();
    radio.step(20);
    until(1400);
    cars.push({ car: car(41, player.car.lapDist - 70, PORSCHE), speed: steady(75) }, { car: car(42, player.car.lapDist - 85, GENESIS), speed: steady(80) });
    radio.step(0.4);
    expect(radio.texts().at(-1)).toBe('Two Hypers behind.');
    const heard = radio.heard.length;
    cars.push({ car: car(43, player.car.lapDist - 90, PORSCHE), speed: steady(80) });
    radio.step(3);
    expect(radio.heard).toHaveLength(heard);
    expect(spokenCar(car(40, 0, PORSCHE), 'GT3')).toBe('Hyper Porsche');
  });

  it('says nothing behind while the player crawls, as the faster cars lap them', () => {
    // Sebring race 2026-11-25: a puncture on the way to the pits, and 20 calls in 23 s as the P2s came by.
    let crawl = false;
    const pace = (target: LiveFieldCar) => (target.lapDist < 1500 ? 50 : 25);
    const player: Driven = { car: car(1, 0, { isPlayer: true }), speed: target => (crawl ? 10 : pace(target)) };
    const cars = [player, ...Array.from({ length: 10 }, (_, index): Driven => ({ car: car(10 + index, index * 300), speed: pace }))];
    const radio = race(cars);
    radio.step(130);
    crawl = true;
    while (!(player.car.lapDist >= 1600 && player.car.lapDist < 1620)) radio.step(0.2);
    cars.push({ car: car(40, player.car.lapDist - 60, PORSCHE), speed: steady(40) }, { car: car(41, player.car.lapDist - 80, GENESIS), speed: steady(45) });
    radio.step(3);
    expect(radio.heard.filter(call => call.family === 'traffic')).toEqual([]);
    expect(spokenCar(car(40, 0, PORSCHE), 'Hyper')).toBe('Porsche');
  });

  it('says where the player rejoins: the class place and the cars around the exit', () => {
    const track = new FieldTrack();
    const player = car(1, 0, { isPlayer: true, place: 5, totalLaps: 0, ...GENESIS });
    let t = 0;
    // Two laps of 100 s give the player's lap time.
    for (let lap = 0; lap < 3; lap += 1) {
      for (let index = 0; index < 100 * HZ; index += 1) {
        t += 1 / HZ;
        track.observe(t, LENGTH, [{ ...player, totalLaps: lap, lapDist: (index / (100 * HZ)) * LENGTH }]);
      }
    }
    const at = (seconds: number, patch: Partial<LiveFieldCar>) => car(0, 0, { ...patch, totalLaps: 2, lapDist: LENGTH - (seconds / 100) * LENGTH });
    track.observe(t + 0.2, LENGTH, [
      { ...player, totalLaps: 3, lapDist: 0 },
      at(10, { id: 2, place: 6, ...PORSCHE }),
      at(20, { id: 3, place: 7, ...PORSCHE }),
      at(28, { id: 8, place: 22, ...LEXUS }),
      at(29, { id: 4, place: 8, ...GENESIS }),
      at(31, { id: 5, place: 20, ...LEXUS }),
      at(32, { id: 6, place: 21, ...LEXUS }),
      at(15, { id: 7, place: 9, ...PORSCHE, inPits: true }),
    ]);
    // The Porsches at 10 and 20 s and the Genesis at 29 s pass during the stop; the car in the pits does not count.
    expect(rejoinText(track, 30)).toBe('Rejoin P4. Behind the Genesis. Ahead of two GT3s.');
    expect(rejoinText(new FieldTrack(), 30)).toBeNull();
  });

  it('stays silent off a green track, in the pits, and keeps traffic quiet on the race\'s first lap', () => {
    const watch = new FieldWatch();
    const context = { snapshot: liveSnapshot({ strategy: liveStrategy() }), pitLaneSeconds: null, turnAt: () => null };
    const field = { sectorFlags: [11, 11, 11] as [number, number, number], cars: [car(1, 0, { isPlayer: true })] };
    expect(watch.observe(1, LENGTH, 3, field, context)).toEqual([]);
    expect(watch.observe(1.2, LENGTH, 5, field, { ...context, snapshot: null })).toEqual([]);
    expect(watch.observe(1.4, LENGTH, 5, { ...field, cars: [car(1, 0, { isPlayer: true, inPits: true })] }, context)).toEqual([]);
  });
});
