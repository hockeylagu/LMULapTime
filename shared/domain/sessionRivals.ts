import type { DriverData } from '../types/index.js';
import { areComparableCarClasses, resolveDriverCarClass } from './vehicleMapping.js';

export type RivalSectorKey = 's1' | 's2' | 's3' | 'lap';

export interface RivalSectorRow {
  key: RivalSectorKey;
  label: string;
  yours: number | null;
  /** The fastest rival's best time for this sector (or lap). */
  rival: number | null;
  rivalName: string | null;
  /** yours - rival, in seconds: positive means the rival was faster. */
  gap: number | null;
}

export interface SameCarRivalComparison {
  /** 'car' when rivals drove the same car; 'class' when nobody else did and the class is used. */
  scope: 'car' | 'class';
  rivalCount: number;
  rows: RivalSectorRow[];
  /** The sector with the largest gap to the rival, when the driver is slower anywhere. */
  biggestGap: RivalSectorRow | null;
}

const SECTORS: Array<{ key: RivalSectorKey; label: string; pick: (d: DriverData) => number | null }> = [
  { key: 's1', label: 'S1', pick: (d) => d.bestS1 },
  { key: 's2', label: 'S2', pick: (d) => d.bestS2 },
  { key: 's3', label: 'S3', pick: (d) => d.bestS3 },
  { key: 'lap', label: 'Lap', pick: (d) => d.bestLapTime },
];

const sameCar = (a: DriverData, b: DriverData) =>
  a.carType.trim().toLowerCase() === b.carType.trim().toLowerCase();

const positive = (value: number | null): value is number => typeof value === 'number' && value > 0;

/**
 * Compares a driver's best sectors and lap with the fastest other drivers in the same car in the
 * session: the fairest reference in a multiclass lobby. When nobody else drove that car, the
 * driver's car class is used instead; other classes are never compared.
 */
export function compareWithSameCarRivals(drivers: DriverData[], driver: DriverData): SameCarRivalComparison | null {
  const others = drivers.filter((d) => d.name !== driver.name && positive(d.bestLapTime));
  const carRivals = others.filter((d) => sameCar(d, driver));
  const driverClass = resolveDriverCarClass(driver);
  const classRivals = others.filter((d) => driverClass && areComparableCarClasses(driverClass, resolveDriverCarClass(d)));
  const scope: SameCarRivalComparison['scope'] = carRivals.length > 0 ? 'car' : 'class';
  const rivals = carRivals.length > 0 ? carRivals : classRivals;
  if (rivals.length === 0) return null;

  const rows = SECTORS.map(({ key, label, pick }): RivalSectorRow => {
    const yours = positive(pick(driver)) ? pick(driver) : null;
    let rival: number | null = null;
    let rivalName: string | null = null;
    for (const d of rivals) {
      const value = pick(d);
      if (positive(value) && (rival === null || value < rival)) {
        rival = value;
        rivalName = d.name;
      }
    }
    const gap = yours !== null && rival !== null ? Number((yours - rival).toFixed(3)) : null;
    return { key, label, yours, rival, rivalName, gap };
  });

  const biggestGap = rows
    .filter((row) => row.key !== 'lap' && row.gap !== null && row.gap > 0)
    .reduce<RivalSectorRow | null>((worst, row) => (worst === null || (row.gap as number) > (worst.gap as number) ? row : worst), null);

  return { scope, rivalCount: rivals.length, rows, biggestGap };
}
