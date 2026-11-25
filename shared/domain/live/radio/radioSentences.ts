import { LAYOUT_TURN_LISTS } from '../../circuitTurns/turnLists.js';
import { SAFETY_CAR_CLASS, VEHICLE_MODELS } from '../../vehicleMapping.js';
import { classWord, countWord, spokenBrand } from './field/spokenCar.js';
import { passSeconds } from './field/trafficCalls.js';
import { SAVE_TO_FINISH_MAX_PERCENT } from './racePlanMode.js';

/** A turn as said on the radio: "Turn 6", "Turn 10A", or its name where the source gives no number. */
export const spokenTurn = (turn: { number?: number; suffix?: string; name?: string }): string | null =>
  (turn.number !== undefined ? `Turn ${turn.number}${turn.suffix ?? ''}` : turn.name ?? null);

const range = (from: number, to: number, step = 1): number[] =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => from + index * step);
const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const WHEELS = ['Front left', 'Front right', 'Rear left', 'Rear right'];
/** The pit menu's tyre settings as `liveCalls` says them. */
const TYRES = ['no tyre change', 'new soft', 'new medium', 'new hard', 'new wet'];
const SECTORS = [1, 2, 3];
/** Counts said in a group of cars: two to six. */
const GROUPS = range(2, 6).map(countWord);
/** Seconds to a pass, as the traffic calls round them. */
const PASS_SECONDS = range(1, 3);
/** Hybrid deployment settings in kW across the data package's cars, and the game's map positions. */
const DEPLOYMENT_KW = [...range(0, 50, 10), ...range(60, 200, 20)];
const DEPLOYMENT_MAPS = range(0, 10);
/** Seconds as the damage call says them: the nearest 5, to 5 minutes. */
const DAMAGE_SECONDS = range(5, 300, 5);
/** Litres a stop loads, whole. */
const LITRES = range(0, 120);
/** Class places said on the rejoin call. */
const PLACES = range(1, 60);

function fixed(): string[] {
  return [
    'Box this lap.', 'Box in 2 laps.', 'Box next lap.',
    ...WHEELS.flatMap(wheel => [`${wheel} puncture.`, `${wheel} wheel lost.`]),
    'Penalty pending.', 'Penalty.', 'No service on this stop.',
    'Pit menu energy too low.', 'Pit menu fuel too low.', 'Fuel ratio too low.', 'Pit menu has no tyre change.', 'Set new tyres.',
    "Tyres won't reach the flag.", "Tyres won't reach the stop.", 'Plan a change.',
    'Fuel runs out before energy.', 'Check your fuel ratio.', 'Suspension damage.', 'Damage.', 'Stay out.',
    'Energy use too high.', 'Fuel use too high.', 'Save to keep our pit lap.',
    'Ten minutes to go.', 'Last lap.', 'One more lap after this.', 'Last lap, push.',
    ...SECTORS.flatMap(sector => [`Yellow, sector ${sector}.`, `Green, sector ${sector}.`, `Sector ${sector}.`, `Sector ${sector} clear.`]),
    ...TYRES.map(tyres => `${capital(tyres)}.`),
    'Car rejoining, careful.', 'Car off left.', 'Car off right.',
    ...GROUPS.flatMap(count => ['left', 'right', 'both sides'].map(side => `${capital(count)} cars off ${side}.`)),
  ];
}

/** What is on the track and which side: "Car stopped, left." and "In your path." */
function incidents(): string[] {
  const one = ['Car stopped', 'Slow car'].flatMap(what => ['left', 'right'].map(side => `${what}, ${side}.`));
  const several = GROUPS.flatMap(count => ['stopped', 'slow'].flatMap(state =>
    ['left', 'right', 'both sides'].map(side => `${capital(count)} cars ${state}, ${side}.`)));
  return [...one, ...several, 'In your path.'];
}

/** Every turn the layouts' lists name, as the incident calls place it. */
function turns(): string[] {
  const names = [...new Set(Object.values(LAYOUT_TURN_LISTS).flatMap(list => list.turns.map(spokenTurn)).filter(name => name !== null))];
  return names.flatMap(name => [`${name}.`, `Yellow, ${name}.`, `${name} clear.`]);
}

/** A car of another class, as the traffic calls name it: "Hyper Porsche", or the class word alone when the car is unknown. */
function cars(): string[] {
  const models = VEHICLE_MODELS.filter(model => model.carClass !== SAFETY_CAR_CLASS);
  return [...new Set([
    ...models.map(model => { const brand = spokenBrand(model.model); return brand ? `${classWord(model.carClass)} ${brand}` : classWord(model.carClass); }),
    ...models.map(model => classWord(model.carClass)),
  ])];
}

/** A group of cars: "Hypers", "GT3s", or "cars" when the classes are mixed or the player's own. */
function groups(): string[] {
  return [...new Set(VEHICLE_MODELS.filter(model => model.carClass !== SAFETY_CAR_CLASS).map(model => `${classWord(model.carClass)}s`)), 'cars'];
}

function traffic(): string[] {
  const named = cars();
  const words = groups();
  return [
    ...PASS_SECONDS.map(seconds => `${passSeconds(seconds)}.`),
    ...named.map(car => `${car} behind.`),
    ...GROUPS.flatMap(count => words.map(word => `${capital(count)} ${word} behind.`)),
    ...named.map(car => `${car} ahead.`),
  ];
}

/** Where the stop puts the player: the class place, and the cars around the pit exit (the player's class by its make alone). */
function rejoin(): string[] {
  const makes = VEHICLE_MODELS.filter(model => model.carClass !== SAFETY_CAR_CLASS).map(model => spokenBrand(model.model)).filter(make => make !== null);
  const named = [...new Set([...makes, 'car', ...cars()])];
  return [
    ...PLACES.map(place => `Rejoin P${place}.`),
    ...named.flatMap(car => [`Behind the ${car}.`, `Ahead of the ${car}.`]),
    ...GROUPS.flatMap(count => groups().map(word => `Ahead of ${count} ${word}.`)),
  ];
}

/**
 * Every sentence of the radio calls (`liveCalls`, `radio/field/`) that a prepared clip can cover, the most useful
 * first: the engineer's clip library (`tools/dev/prepareVoiceClips.ts`). A call plays from clips when each of its
 * sentences is here, and the calls are worded so that each is (numbers and names in short sentences of their own).
 * Only a value past these ranges keeps the browser's voice: more than six cars in a group, a pit lap past 200, a
 * load past 120 litres, a class place past 60. A wording change in the call modules is copied here.
 */
export function radioSentences(): string[] {
  const percents = range(0, 100);
  return [...new Set([
    ...fixed(),
    ...incidents(),
    ...turns(),
    ...LITRES.map(setting => `Set ${setting}.`),
    ...range(1, 200).map(lap => `Save to pit on lap ${lap}.`),
    // Saving is advised only up to `SAVE_TO_FINISH_MAX_PERCENT` (`racePlanMode`).
    ...range(1, SAVE_TO_FINISH_MAX_PERCENT).map(percent => `Save ${percent} percent to finish.`),
    ...traffic(),
    ...rejoin(),
    ...DAMAGE_SECONDS.flatMap(seconds => [`Repair ${seconds} seconds.`, `Costs ${seconds} seconds to the flag.`, `Stop ${seconds} seconds.`]),
    'Repair over 5 minutes.', 'Costs over 5 minutes to the flag.', 'Stop over 5 minutes.',
    ...LITRES.map(litres => `Fuel ${litres} litres.`),
    ...range(50, 150).map(ratio => `Set ${(ratio / 100).toFixed(2)}.`),
    ...DEPLOYMENT_KW.map(kw => `Set deployment ${kw}.`),
    ...DEPLOYMENT_MAPS.map(map => `Set deployment map ${map}.`),
    ...percents.map(percent => `Energy ${percent} percent.`),
  ])];
}
