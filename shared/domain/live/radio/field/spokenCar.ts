import type { LiveFieldCar } from '../../../../types/liveField.js';
import { knownCarClass, resolveCarManufacturer, resolveVehicle } from '../../../vehicleMapping.js';

/** The class as said on the radio. */
const CLASS_WORDS: Record<string, string> = { Hyper: 'Hyper', LMP2: 'P2', LMP2_ELMS: 'P2', LMP3: 'P3', GTE: 'GTE', GT3: 'GT3' };
/** Faster classes rank higher. */
const CLASS_RANK: Record<string, number> = { Hyper: 5, LMP2: 4, LMP2_ELMS: 4, LMP3: 3, GTE: 2, GT3: 1 };
/** Long brands said short (driver, 2026-10-26). */
const SHORT_BRANDS: Record<string, string> = { 'Mercedes-AMG': 'Mercedes', 'Aston Martin': 'Aston', 'Isotta Fraschini': 'Isotta' };

export const carClassOf = (car: Pick<LiveFieldCar, 'vehicleClass'>): string | null => knownCarClass(car.vehicleClass);
export const classRank = (carClass: string | null): number | null => (carClass ? CLASS_RANK[carClass] ?? null : null);
export const classWord = (carClass: string | null): string => (carClass ? CLASS_WORDS[carClass] ?? 'car' : 'car');

/** The manufacturer, short, from the vehicle file (the entry name is the livery and names only a few cars). */
export function brandOf(car: Pick<LiveFieldCar, 'vehFilename' | 'vehicleName'>): string | null {
  const model = (resolveVehicle(car.vehFilename) ?? resolveVehicle(car.vehicleName))?.model;
  const brand = resolveCarManufacturer(model);
  return brand ? SHORT_BRANDS[brand] ?? brand : null;
}

/**
 * A car as said on the radio: the manufacturer, with the class word first only when it differs from the player's
 * ("the Ferrari", "Hyper Porsche"); the class alone when the car is unknown.
 */
export function spokenCar(car: LiveFieldCar, playerClass: string | null): string {
  const carClass = carClassOf(car);
  const brand = brandOf(car);
  const sameClass = carClass !== null && carClass === playerClass;
  if (sameClass) return brand ?? 'car';
  return brand ? `${classWord(carClass)} ${brand}` : classWord(carClass);
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** Small counts in words ("two"), larger in digits. */
export const countWord = (count: number): string => NUMBERS[count] ?? String(count);
