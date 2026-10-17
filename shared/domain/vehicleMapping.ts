const VEHICLE_FILES = new Map<string, { model: string; carClass: string }>();

/** Local provider identity aliases; generic app builds contain no generated livery catalog. */
export function setVehicleCatalog(records: readonly {model:string;carClass:string;vehicleIds:readonly string[]}[]): void {
  VEHICLE_FILES.clear();
  for (const record of records) for (const id of record.vehicleIds) VEHICLE_FILES.set(id.trim().replace(/\.veh$/i,'').toUpperCase(), {model:record.model,carClass:record.carClass});
}

/** Converts external XML/benchmark class labels once at ingestion. Internal data uses exact equality. */
export function normalizeCarClass(carClass?: string | null): string {
  const value = carClass?.trim() ?? '';
  switch (value.toLowerCase()) {
    case 'hyper': case 'hypercar': case 'lmh': case 'lmdh': return 'Hyper';
    case 'gt3': case 'lmgt3': case 'gt3_elms': return 'GT3';
    case 'lmp2': case 'lmp2wec': case 'lmp2 (wec)': return 'LMP2';
    case 'lmp2_elms': case 'lmp2elms': case 'lmp2 (elms)': return 'LMP2_ELMS';
    case 'lmp3': return 'LMP3';
    case 'gte': return 'GTE';
    default: return value;
  }
}

/** The app's canonical class for a game class label, or null when the label is not one of its classes. */
export function knownCarClass(carClass?: string | null): string | null {
  const id = normalizeCarClass(carClass);
  return id !== 'All' && VEHICLE_CLASS_OPTIONS.some(option => option.id === id) ? id : null;
}

export interface CarClassOption {
  id: string;
  label: string;
}

export const VEHICLE_CLASS_OPTIONS: CarClassOption[] = [
  { id: 'All', label: 'All Classes' },
  { id: 'Hyper', label: 'Hypercar' },
  { id: 'GT3', label: 'GT3' },
  { id: 'LMP2', label: 'LMP2 (WEC)' },
  { id: 'LMP2_ELMS', label: 'LMP2 (ELMS)' },
  { id: 'LMP3', label: 'LMP3' },
  { id: 'GTE', label: 'GTE' },
];

/**
 * Checks if a session matches a target car class by evaluating playerDriver,
 * or fallback to any participating driver in the session if playerDriver is absent.
 */
export function matchesSessionCarClass(
  session: {
    playerDriver?: { carClass?: string | null; carType?: string | null } | null;
    drivers?: Array<{ carClass?: string | null; carType?: string | null }> | null;
  },
  targetClass: string = 'All'
): boolean {
  if (!targetClass || targetClass === 'All') return true;

  if (session.playerDriver) {
    return session.playerDriver.carClass === targetClass;
  }

  if (session.drivers && session.drivers.length > 0) {
    return session.drivers.some(d =>
      d.carClass === targetClass
    );
  }

  return false;
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
 * Maps vehicle model or vehicle ID string to canonical LMU car class (GT3, Hyper, LMP2, LMP2_ELMS, GTE, LMP3).
 */
export function mapVehicleIdToClass(vehicleId?: string, carType?: string): string {
  const known = lookupVehicleFile(vehicleId);
  if (known) return known.carClass;
  const model = carType || mapVehicleIdToModel(vehicleId);
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
    return 'GT3';
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
    return 'Hyper';
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
    return combined.includes('ELMS') ? 'LMP2_ELMS' : 'LMP2';
  }

  if (combined.includes('992S') || combined.includes('SAFETY')) {
    return 'Safety Car';
  }

  return '';
}

interface RosterVehicle {
  name: string;
  vehicleId?: string;
  carType?: string;
  carClass?: string;
  isPlayer?: boolean;
}

/**
 * Resolves each replay roster entry's car. A results-log entry of the same driver (the session
 * the replay is linked to) takes precedence; otherwise the car is derived from the vehicle id with
 * the current catalog and rules, so rosters stored by an older build are corrected on read.
 * The replay's own car follows its player. Returns the same object.
 */
export function resolveRosterVehicles<T extends { drivers?: RosterVehicle[]; carType?: string; carClass?: string }>(
  metadata: T,
  sessionDrivers?: ReadonlyArray<{ name: string; carType?: string; carClass?: string }>,
): T {
  const drivers = metadata.drivers ?? [];
  const sessionRoster = sessionDrivers ?? [];
  const sessionNameCounts = new Map<string, number>();
  for (const driver of sessionRoster) {
    const key = driver.name.trim().toLowerCase();
    if (key) sessionNameCounts.set(key, (sessionNameCounts.get(key) ?? 0) + 1);
  }
  const byName = new Map(sessionRoster
    .filter(driver => driver.name.trim() && sessionNameCounts.get(driver.name.trim().toLowerCase()) === 1)
    .map(driver => [driver.name.trim().toLowerCase(), driver]));
  const replayNameCounts = new Map<string, number>();
  for (const driver of drivers) {
    const key = driver.name.trim().toLowerCase();
    if (key) replayNameCounts.set(key, (replayNameCounts.get(key) ?? 0) + 1);
  }
  for (const driver of drivers) {
    const key = driver.name.trim().toLowerCase();
    const logged = key && replayNameCounts.get(key) === 1 ? byName.get(key) : undefined;
    if (logged?.carType && logged.carType !== 'Unknown Car' && logged.carClass && logged.carClass !== 'General') {
      driver.carType = logged.carType;
      driver.carClass = logged.carClass;
    } else if (driver.vehicleId) {
      driver.carType = mapVehicleIdToModel(driver.vehicleId);
      driver.carClass = mapVehicleIdToClass(driver.vehicleId, driver.carType) || undefined;
    }
  }
  const markedPlayers = drivers.filter(driver => driver.isPlayer);
  const player = markedPlayers.length === 1 ? markedPlayers[0] : undefined;
  if (player?.carType) metadata.carType = player.carType;
  if (player?.carClass) metadata.carClass = player.carClass;
  return metadata;
}

/**
 * A driver's car class: the class recorded for the entry, else derived from its vehicle.
 * Returns '' when the car is not recognised (e.g. an unknown mod).
 */
export function resolveDriverCarClass(driver?: { carClass?: string; vehicleId?: string; carType?: string } | null): string {
  if (!driver) return '';
  return driver.carClass || mapVehicleIdToClass(driver.vehicleId, driver.carType);
}

/**
 * Whether two laps may be compared: laps are only ever compared within one car class.
 * Uses canonical class equality. An unknown
 * class ('') cannot be checked and does not block the comparison.
 */
export function areComparableCarClasses(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  return a === b;
}

interface ManufacturerRule {
  brand: string;
  /** The brand's own name (and spellings of it); checked for every brand before any model token. */
  name?: RegExp;
  /** Model tokens, matched as whole words only. */
  models?: RegExp;
}

// Patterns run on the normalized text (lower case, accents dropped, every run of non-alphanumerics a single
// space), so `-`, `_`, `.` and spaces are interchangeable and `\b` is a real word boundary: `amg` does not
// match "Gamma", `963` does not match "1963" or "9630", `m4` does not match "Cm4x". Order matters within a pass
// (Corvette before Chevrolet: "Chevrolet Corvette Z06" is a Corvette).
const MANUFACTURER_RULES: readonly ManufacturerRule[] = [
  { brand: 'Aston Martin', name: /\baston martin\b/, models: /\b(valkyrie|vantage)\b/ },
  { brand: 'Isotta Fraschini', name: /\bisotta( fraschini)?\b/, models: /\btipo ?6\b/ },
  { brand: 'Mercedes-AMG', name: /\bmercedes\b/, models: /\bamg\b/ },
  { brand: 'Corvette', name: /\bcorvette\b/, models: /\b(c8|z06)\b/ },
  { brand: 'Chevrolet', name: /\bchevrolet\b/ },
  { brand: 'Ferrari', name: /\bferrari\b/, models: /\b(296|488|499p)\b/ },
  { brand: 'Porsche', name: /\bporsche\b/, models: /\b(911|963|992s?)\b/ },
  { brand: 'BMW', name: /\bbmw\b/, models: /\bm4\b/ },
  { brand: 'Cadillac', name: /\bcadillac\b/, models: /\b(v series|vlmdh)\b/ },
  { brand: 'Alpine', name: /\balpine\b/, models: /\ba424\b/ },
  { brand: 'Ford', name: /\bford\b/, models: /\bmustang\b/ },
  { brand: 'Lamborghini', name: /\blamborghini\b/, models: /\b(huracan|sc63)\b/ },
  { brand: 'Lexus', name: /\blexus\b/, models: /\brc ?f\b/ },
  { brand: 'McLaren', name: /\bmclaren\b/, models: /\b720s\b/ },
  { brand: 'Peugeot', name: /\bpeugeot\b/, models: /\b9x8\b/ },
  { brand: 'Toyota', name: /\btoyota\b/, models: /\b(gr010|tr010)\b/ },
  { brand: 'Genesis', name: /\bgenesis\b/, models: /\bgmr ?001\b/ },
  { brand: 'Glickenhaus', name: /\bglickenhaus\b/, models: /\bscg ?007\b/ },
  { brand: 'Vanwall', name: /\b(vanwall|vandervell)\b/ },
  { brand: 'Oreca', name: /\boreca\b/, models: /\b07 lmp2\b/ },
  { brand: 'Ligier', name: /\bligier\b/, models: /\bjs ?p\d*\b/ },
  { brand: 'Duqueine', name: /\bduqueine\b/, models: /\bd0[89]\b/ },
  { brand: 'Ginetta', name: /\bginetta\b/, models: /\bg61\b/ },
  { brand: 'ADESS', name: /\badess\b/, models: /\bad25\b/ },
];

/**
 * Resolves the vehicle manufacturer / brand key for logo lookup from a car type, model name or vehicle ID.
 * Brand names are matched first, then model tokens as whole words (see MANUFACTURER_RULES).
 */
export function resolveCarManufacturer(carTypeOrModel?: string | null): string {
  if (!carTypeOrModel) return '';
  const text = carTypeOrModel.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
  if (!text) return '';
  for (const rule of MANUFACTURER_RULES) if (rule.name?.test(text)) return rule.brand;
  for (const rule of MANUFACTURER_RULES) if (rule.models?.test(text)) return rule.brand;
  return '';
}
