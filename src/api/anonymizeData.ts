/**
 * Client-side anonymizer for demo mode and visual showcase captures.
 * Activated via URL parameter (?demo=1 or ?anonymize=1) or localStorage 'lmu_demo_mode'.
 * Replaces personal driver names, opponent names, and file paths.
 */

const OPPONENT_NAMES = [
  'Jean Girard',
  'Cal Naughton Jr.',
  'Lucius Washington',
  'Pierre Leghorn',
  'Jack Weyland',
  'Terry Cheveaux',
  'Herschell Savage',
  'Glenn',
  'Gregory',
  'Carley Bobby',
  'Reese Bobby',
  'Michael Rossi',
  'Kevin Estre',
  'Brendon Hartley',
  'Laurens Vanthoor',
  'James Calado',
  'Alessandro Pier Guidi',
  'Tom Blomqvist',
  'Davide Catani',
  'Mikkel Jensen',
  'Antonio Fuoco',
  'Sebastien Bourdais',
  'Earl Bamber',
  'Robin Frijns',
  'Dries Vanthoor',
];

const nameMapping = new Map<string, string>();
const reverseNameMapping = new Map<string, string>();
let detectedPlayerName: string | null = null;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  const search = window.location.search || window.location.hash;
  if (/[?&](demo|anonymize)(=1|=true)?\b/i.test(search)) {
    window.localStorage?.setItem('lmu_demo_mode', 'true');
    return true;
  }
  return window.localStorage?.getItem('lmu_demo_mode') === 'true';
}

export function setDemoPlayerName(name: string): void {
  if (name && name !== 'Ricky Bobby') {
    detectedPlayerName = name;
  }
}

export function anonymizeDriverName(name: string | null | undefined): string {
  if (!name) return name ?? '';
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (trimmed === 'Ricky Bobby' || trimmed.toLowerCase() === 'ai' || trimmed.toLowerCase() === 'ghost') {
    return trimmed;
  }

  if (detectedPlayerName && trimmed.toLowerCase() === detectedPlayerName.toLowerCase()) {
    return 'Ricky Bobby';
  }

  // Detect likely player name pattern if not explicitly registered yet
  if (/samuel|lague/i.test(trimmed)) {
    detectedPlayerName = trimmed;
    return 'Ricky Bobby';
  }

  const existing = nameMapping.get(trimmed);
  if (existing) return existing;

  const index = hashString(trimmed) % OPPONENT_NAMES.length;
  const anonymized = OPPONENT_NAMES[index];
  nameMapping.set(trimmed, anonymized);
  reverseNameMapping.set(anonymized, trimmed);
  return anonymized;
}

export function deanonymizeUrl(url: string): string {
  if (!isDemoMode()) return url;
  let decoded = url;
  const realPlayer = detectedPlayerName || 'Samuel Lague';
  decoded = decoded
    .replace(/Ricky%20Bobby/gi, encodeURIComponent(realPlayer))
    .replace(/Ricky\+Bobby/gi, encodeURIComponent(realPlayer).replace(/%20/g, '+'))
    .replace(/Ricky Bobby/gi, realPlayer);

  for (const [anonymized, original] of reverseNameMapping.entries()) {
    const encodedAnon = encodeURIComponent(anonymized);
    const plusAnon = encodedAnon.replace(/%20/g, '+');
    const encodedOrig = encodeURIComponent(original);
    const plusOrig = encodedOrig.replace(/%20/g, '+');
    if (decoded.includes(encodedAnon)) {
      decoded = decoded.split(encodedAnon).join(encodedOrig);
    }
    if (decoded.includes(plusAnon)) {
      decoded = decoded.split(plusAnon).join(plusOrig);
    }
    if (decoded.includes(anonymized)) {
      decoded = decoded.split(anonymized).join(original);
    }
  }
  return decoded;
}

export function anonymizePath(pathStr: string): string {
  if (typeof pathStr !== 'string') return pathStr;
  return pathStr
    .replace(/[A-Za-z]:\\[Uu]sers\\[^\\]+\\[^\\/]+/g, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate')
    .replace(/[A-Za-z]:\/[Uu]sers\/[^/]+\/[^/]+/g, 'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate');
}

/**
 * Deep recursive anonymizer for API JSON payloads.
 */
export function anonymizePayload<T>(data: T): T {
  if (!data || typeof data !== 'object') {
    if (typeof data === 'string') {
      return anonymizePath(data) as unknown as T;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => anonymizePayload(item)) as unknown as T;
  }

  const obj = data as Record<string, unknown>;
  const copy: Record<string, unknown> = {};

  if (typeof obj.playerName === 'string' && obj.playerName) {
    setDemoPlayerName(obj.playerName);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      if (key === 'playerName') {
        copy[key] = 'Ricky Bobby';
      } else if (
        key === 'driverName' ||
        key === 'driver' ||
        key === 'rivalName' ||
        key === 'compareDriver' ||
        key === 'baselineDriverName' ||
        (key === 'name' && (obj.carType || obj.carClass || obj.laps || obj.driverSlot !== undefined))
      ) {
        copy[key] = anonymizeDriverName(value);
      } else if (key.endsWith('Dir') || key.endsWith('Path') || key === 'dbPath' || key === 'sourcePath') {
        copy[key] = anonymizePath(value);
      } else {
        copy[key] = anonymizePath(value);
      }
    } else {
      copy[key] = anonymizePayload(value);
    }
  }

  return copy as T;
}
