import { matchesCarClass } from './paceCategory.js';


const VEHICLE_FILES = new Map<string, { model: string; carClass: string }>();

/** Local provider identity aliases; generic app builds contain no generated livery catalog. */
export function setVehicleCatalog(records: readonly {model:string;carClass:string;vehicleIds:readonly string[]}[]): void {
  VEHICLE_FILES.clear();
  for (const record of records) for (const id of record.vehicleIds) VEHICLE_FILES.set(id.trim().replace(/\.veh$/i,'').toUpperCase(), {model:record.model,carClass:record.carClass});
}

// LMU results-log <CarType> names that differ from the model names the app shows.
const LMU_CAR_TYPE_MODELS: Readonly<Record<string, string>> = {
  'Aston Martin Vantage AMR LMGT3': 'Aston Martin Vantage GT3',
  'BMW M4 LMGT3': 'BMW M4 GT3',
  'Chevrolet Corvette Z06 LMGT3.R': 'Corvette Z06 GT3.R',
  'Ferrari 296 LMGT3': 'Ferrari 296 GT3',
  'Ferrari 296 LMGT3 Evo': 'Ferrari 296 GT3',
  'Ford Mustang LMGT3': 'Ford Mustang GT3',
  'Genesis GMR001': 'Genesis GMR001 Hypercar',
  'Genesis GMR-001': 'Genesis GMR001 Hypercar',
  'Lamborghini Huracan LMGT3 Evo2': 'Lamborghini Huracan GT3 Evo2',
  'Lexus RCF LMGT3': 'Lexus RC F GT3',
  'McLaren 720S LMGT3 Evo': 'McLaren 720S GT3 Evo',
  'Mercedes-AMG LMGT3': 'Mercedes-AMG GT3',
  'Oreca 07': 'Oreca 07 LMP2',
  'Peugeot 9x8': 'Peugeot 9X8',
  'Porsche 911 GT3 R LMGT3': 'Porsche 911 GT3 R',
  'Toyota TR010': 'Toyota GR010 Hybrid',
};

// LMU results-log <CarClass> names that differ from the app's class ids.
const LMU_CAR_CLASS_IDS: Readonly<Record<string, string>> = { GT3: 'LMGT3', Hyper: 'LMH', LMP2_ELMS: 'LMP2elms' };

/** A results-log <CarType> as the model name the app shows. */
export function normalizeLmuCarType(carType: string): string {
  return LMU_CAR_TYPE_MODELS[carType.trim()] ?? carType.trim();
}

/** A results-log <CarClass> as the app's class id. */
export function normalizeLmuCarClass(carClass: string): string {
  return LMU_CAR_CLASS_IDS[carClass.trim()] ?? carClass.trim();
}

/** The car a vehicle file is, from the configured local alias catalog. */
function lookupVehicleFile(vehicleId?: string): { model: string; carClass: string } | undefined {
  return vehicleId ? VEHICLE_FILES.get(vehicleId.trim().replace(/\.veh$/i, '').toUpperCase()) : undefined;
}

// Friendly car name mapping: known vehicle files first, then LMU skin/vehicle ID tokens.
// Team tokens are only a fallback: DKR, WRT, PROT, IRON or AFCO run cars in several classes.
// NOTE: Specific tokens (RSR, 499P, DSTATI) must be checked BEFORE generic substrings
// (911, 296) to prevent false matches on vehicle IDs like "911_RSR".
export function mapVehicleIdToModel(vehicleId?: string): string {
  if (!vehicleId) return 'Unknown Vehicle';
  const known = lookupVehicleFile(vehicleId);
  if (known) return known.model;
  const v = vehicleId.toUpperCase();

  // --- GTE: specific tokens first to avoid being swallowed by generic GT3 checks ---
  if (v.includes('DSTATI')) return 'Aston Martin Vantage AMR';
  if (v.includes('RSR') || v.includes('REXY')) return 'Porsche 911 RSR-19';
  if (v.includes('KESSEL') || v.includes('488')) return 'Ferrari 488 GTE EVO';

  // --- GT3 ---
  if (v.includes('AFCO') || v.includes('296')) return 'Ferrari 296 GT3';
  if (v.includes('WRT') || v.includes('M4')) return 'BMW M4 GT3';
  if (v.includes('MUSTANG')) return 'Ford Mustang GT3';
  if (v.includes('GCHAL')) return 'McLaren 720S GT3 Evo';
  if (v.includes('GARA') || v.includes('720S')) return 'McLaren 720S GT3 Evo';
  if (v.includes('MANT') || v.includes('911')) return 'Porsche 911 GT3 R';
  if (v.includes('IRON') || v.includes('HURACAN')) return 'Lamborghini Huracan GT3 Evo2';
  if (v.includes('PROT')) return 'Ford Mustang GT3';
  if (v.includes('TFSP') || v.includes('CORVETTE')) return 'Corvette Z06 GT3.R';
  if (v.includes('AKKO') || v.includes('LEXUS')) return 'Lexus RC F GT3';
  if (v.includes('AMG') || v.includes('MERCEDES')) return 'Mercedes-AMG GT3';
  if (v.includes('THOR') || v.includes('VANTAGE')) return 'Aston Martin Vantage GT3';

  // --- Hypercar / LMH / LMDh ---
  if (v.includes('499P')) return 'Ferrari 499P';
  if (v.includes('963')) return 'Porsche 963';
  if (v.includes('WTR') || v.includes('V-SERIES') || v.includes('CADILLAC') || v.includes('CADIL') || v.includes('VLMDH')) return 'Cadillac V-Series.R';
  if (v.includes('GR010') || v.includes('TR010') || v.includes('TOYOTA')) return 'Toyota GR010 Hybrid';
  if (v.includes('9X8') || v.includes('PEUGEOT') || v.includes('PEUG')) return 'Peugeot 9X8';
  if (v.includes('A424') || v.includes('ALPINE') || v.includes('ALPI')) return 'Alpine A424';
  if (v.includes('SC63') || v.includes('LAMBORGHINI')) return 'Lamborghini SC63';
  if (v.includes('ISOTTA')) return 'Isotta Fraschini Tipo 6';
  if (v.includes('BMW_HY') || v.includes('M_HYBRID') || v.includes('BMWMH')) return 'BMW M Hybrid V8';
  if (v.includes('VALKYRIE') || v.includes('THO7') || v.includes('007_')) return 'Aston Martin Valkyrie LMH';
  if (v.includes('GENESIS') || v.includes('GENE') || v.includes('GMR001')) return 'Genesis GMR001 Hypercar';

  // --- LMP3 ---
  if (v.includes('GINETTA') || v.includes('G61')) return 'Ginetta G61-LT-P325 Evo';
  if (v.includes('DUQUEINE') || v.includes('D09') || v.includes('D08')) return 'Duqueine D09 P3';
  if (v.includes('LIGIER') || v.includes('JSP')) return 'Ligier JS P325';
  if (v.includes('ADESS') || v.includes('AD25') || v.includes('_ADES')) return 'ADESS AD25 LMP3';

  // --- LMP2 --- (not DKR: DKR Engineering enters both the Oreca and a Ginetta LMP3)
  if (v.includes('ORECA') || v.includes('VECTOR') || v.includes('LMP2') || v.includes('07_LMP2')) return 'Oreca 07 LMP2';
  if (v.includes('992S') || v.includes('SAFETY')) return 'Porsche 992 (Safety Car)';
  return vehicleId;
}

/**
 * Maps vehicle model or vehicle ID string to standardized LMU car class (LMGT3, LMH, LMP2, LMP2elms, GTE, LMP3).
 */
export function mapVehicleIdToClass(vehicleId?: string, carModel?: string): string {
  const known = lookupVehicleFile(vehicleId);
  if (known) return known.carClass;
  const model = carModel || mapVehicleIdToModel(vehicleId);
  const combined = `${vehicleId || ''} ${model}`.toUpperCase();

  // GTE
  if (
    combined.includes('GTE') ||
    combined.includes('DSTATI') ||
    combined.includes('KESSEL') ||
    combined.includes('RSR') ||
    combined.includes('REXY') ||
    combined.includes('488')
  ) {
    return 'GTE';
  }

  // GT3 / LMGT3
  if (
    combined.includes('GT3') ||
    combined.includes('AFCO') ||
    combined.includes('296') ||
    combined.includes('WRT') ||
    combined.includes('M4') ||
    combined.includes('MUSTANG') ||
    combined.includes('PROT') ||
    combined.includes('VANTAGE') ||
    combined.includes('MANT') ||
    combined.includes('911') ||
    combined.includes('GARA') ||
    combined.includes('720S') ||
    combined.includes('GCHAL') ||
    combined.includes('HURACAN') ||
    combined.includes('IRON') ||
    combined.includes('CORVETTE') ||
    combined.includes('TFSP') ||
    combined.includes('LEXUS') ||
    combined.includes('AKKO') ||
    combined.includes('AMG')
  ) {
    return 'LMGT3';
  }

  // Hypercar / LMH / LMDh
  if (
    combined.includes('499P') ||
    combined.includes('963') ||
    combined.includes('CADILLAC') ||
    combined.includes('CADIL') ||
    combined.includes('V-SERIES') ||
    combined.includes('VLMDH') ||
    combined.includes('WTR') ||
    combined.includes('TOYOTA') ||
    combined.includes('GR010') ||
    combined.includes('TR010') ||
    combined.includes('PEUGEOT') ||
    combined.includes('PEUG') ||
    combined.includes('9X8') ||
    combined.includes('ALPINE') ||
    combined.includes('ALPI') ||
    combined.includes('A424') ||
    combined.includes('SC63') ||
    combined.includes('ISOTTA') ||
    combined.includes('M HYBRID') ||
    combined.includes('BMW_HY') ||
    combined.includes('BMWMH') ||
    combined.includes('VALKYRIE') ||
    combined.includes('THO7') ||
    combined.includes('007_') ||
    combined.includes('GENESIS') ||
    combined.includes('GENE') ||
    combined.includes('GMR001') ||
    combined.includes('HYPER') ||
    combined.includes('LMH') ||
    combined.includes('LMDH')
  ) {
    return 'LMH';
  }

  // LMP3
  if (
    combined.includes('LMP3') ||
    combined.includes('GINETTA') ||
    combined.includes('G61') ||
    combined.includes('DUQUEINE') ||
    combined.includes('D09') ||
    combined.includes('D08') ||
    combined.includes('LIGIER') ||
    combined.includes('JSP') ||
    combined.includes('ADESS') ||
    combined.includes('_ADES') ||
    combined.includes('AD25')
  ) {
    return 'LMP3';
  }

  // LMP2
  if (
    combined.includes('ORECA') ||
    combined.includes('LMP2') ||
    combined.includes('VECTOR')
  ) {
    return combined.includes('ELMS') ? 'LMP2elms' : 'LMP2';
  }

  if (combined.includes('992S') || combined.includes('SAFETY')) {
    return 'Safety Car';
  }

  return '';
}

interface RosterVehicle {
  name: string;
  vehicleId?: string;
  carModel?: string;
  carClass?: string;
  isPlayer?: boolean;
}

/**
 * Resolves each replay roster entry's car. A results-log entry of the same driver (the session
 * the replay is linked to) takes precedence; otherwise the car is derived from the vehicle id with
 * the current catalog and rules, so rosters stored by an older build are corrected on read.
 * The replay's own car follows its player. Returns the same object.
 */
export function resolveRosterVehicles<T extends { drivers?: RosterVehicle[]; carModel?: string; carClass?: string }>(
  metadata: T,
  sessionDrivers?: ReadonlyArray<{ name: string; carType?: string; carClass?: string }>,
): T {
  const drivers = metadata.drivers ?? [];
  const byName = new Map((sessionDrivers ?? []).map(driver => [driver.name.trim().toLowerCase(), driver]));
  for (const driver of drivers) {
    const logged = byName.get(driver.name.trim().toLowerCase());
    if (logged?.carType && logged.carType !== 'Unknown Car' && logged.carClass && logged.carClass !== 'General') {
      driver.carModel = normalizeLmuCarType(logged.carType);
      driver.carClass = normalizeLmuCarClass(logged.carClass);
    } else if (driver.vehicleId) {
      driver.carModel = mapVehicleIdToModel(driver.vehicleId);
      driver.carClass = mapVehicleIdToClass(driver.vehicleId, driver.carModel) || undefined;
    }
  }
  const player = drivers.find(driver => driver.isPlayer) ?? drivers[0];
  if (player?.carModel) metadata.carModel = player.carModel;
  if (player?.carClass) metadata.carClass = player.carClass;
  return metadata;
}

/**
 * A driver's car class: the class recorded for the entry, else derived from its vehicle.
 * Returns '' when the car is not recognised (e.g. an unknown mod).
 */
export function resolveDriverCarClass(driver?: { carClass?: string; vehicleId?: string; carModel?: string } | null): string {
  if (!driver) return '';
  return driver.carClass || mapVehicleIdToClass(driver.vehicleId, driver.carModel);
}

/**
 * Whether two laps may be compared: laps are only ever compared within one car class.
 * Class names are matched through their aliases (Hyper/LMH/LMDh, GT3/LMGT3, ...). An unknown
 * class ('') cannot be checked and does not block the comparison.
 */
export function areComparableCarClasses(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  return matchesCarClass(a, '', b) && matchesCarClass(b, '', a);
}
