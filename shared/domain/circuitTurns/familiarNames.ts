import type { PlacedTurn } from './placeTurns.js';

/**
 * The names drivers and broadcasters use for a circuit's turns, by the circuit's turn number, where a source gives
 * them. They name turns in titles only; the T number stays the label. Kept apart from the turn lists so a name change
 * does not rebuild the corner passes. A circuit with no source here falls back to the turn list's own names.
 */
interface FamiliarNames {
  source: string;
  names: Readonly<Record<number, string>>;
}

const MONZA: FamiliarNames = {
  source: 'formula1.com "EXPLAINED: How every corner at Monza got its name", 2026-09-03; Curva Alboreto "still often called Parabolica"',
  names: { 1: 'Prima Variante', 2: 'Prima Variante', 3: 'Biassono', 4: 'Seconda Variante', 5: 'Seconda Variante', 6: 'Lesmo 1', 7: 'Lesmo 2',
    8: 'Variante Ascari', 9: 'Variante Ascari', 10: 'Variante Ascari', 11: 'Parabolica' },
};

const SILVERSTONE: FamiliarNames = {
  source: 'formula1.com "EXPLAINED: How every Silverstone corner got its name", 2026-07-01, naming turns 10-14 together; split into Maggotts (left-right), Becketts (left-right) and Chapel (left) from general racing knowledge, driver-approved 2026-11-19, matching the placed turns\' directions',
  names: { 1: 'Abbey', 2: 'Farm', 3: 'Village', 4: 'The Loop', 5: 'Aintree', 6: 'Brooklands', 7: 'Luffield', 8: 'Woodcote', 9: 'Copse',
    10: 'Maggotts', 11: 'Maggotts', 12: 'Becketts', 13: 'Becketts', 14: 'Chapel', 15: 'Stowe', 16: 'Vale', 17: 'Club', 18: 'Club' },
};

const INTERLAGOS: FamiliarNames = {
  source: 'mercedesamgf1.com "How the Interlagos Corners Got Their Names", 2025-11-03',
  names: { 1: 'Senna S', 2: 'Senna S', 3: 'Curva do Sol', 4: 'Descida do Lago', 5: 'Descida do Lago', 6: 'Ferradura', 7: 'Ferradura',
    8: 'Laranjinha', 9: 'Pinheirinho', 10: 'Bico de Pato', 11: 'Mergulho', 12: 'Junção', 13: 'Café', 14: 'Subida dos Boxes', 15: 'Arquibancadas' },
};

const SEBRING: FamiliarNames = {
  source: '24h-lemans.com "12 Hours of Sebring: Legendary race track", 2012-03-05',
  names: { 6: 'Gurney Bend', 10: 'Cunningham Corner', 11: 'Collier Curve', 14: 'Bishop Curve', 15: 'Gendebien Curve', 16: 'Le Mans Curve',
    17: 'Sunset Bend' },
};

// From general racing knowledge, no source page (driver, 2026-11-19: "we only need it once to build the list");
// each checked against the direction and size of the placed turn it names. Uncertain names left out.
const KNOWN = 'General racing knowledge, driver-approved 2026-11-19; checked against the placed turns\' directions';

const IMOLA: FamiliarNames = {
  source: KNOWN,
  names: { 2: 'Tamburello', 3: 'Tamburello', 4: 'Tamburello', 5: 'Villeneuve', 6: 'Villeneuve', 7: 'Tosa', 9: 'Piratella',
    11: 'Acque Minerali', 12: 'Acque Minerali', 14: 'Variante Alta', 15: 'Variante Alta', 17: 'Rivazza', 18: 'Rivazza' },
};

const BARCELONA: FamiliarNames = {
  source: `${KNOWN}; sponsor names of the corners`,
  names: { 1: 'Elf', 3: 'Renault', 4: 'Repsol', 5: 'Seat', 9: 'Campsa', 10: 'La Caixa', 12: 'Banc Sabadell', 14: 'New Holland' },
};

const FUJI: FamiliarNames = {
  source: `${KNOWN}; the corners' sponsor and radius names`,
  names: { 1: 'TGR Corner', 3: 'Coca-Cola Corner', 4: '100R', 6: 'ADVAN Corner', 8: '300R', 9: '300R', 15: 'GR Supra Corner', 16: 'Panasonic Corner' },
};

const LONG_BEACH: FamiliarNames = { source: KNOWN, names: { 11: 'Hairpin' } };

const PAUL_RICARD: FamiliarNames = {
  source: KNOWN,
  names: { 1: 'Verrerie', 2: 'Verrerie', 10: 'Signes', 11: 'Beausset', 12: 'Bendor' },
};

/** By layout; a variant shares its full layout's numbers, so its names too. */
const FAMILIAR_NAMES: Readonly<Record<string, FamiliarNames>> = {
  monza_gp: MONZA, monza_curvagrande: MONZA,
  silverstone_wec: SILVERSTONE, silverstone_international: SILVERSTONE, silverstone_national: SILVERSTONE,
  interlagos_gp: INTERLAGOS,
  sebring_full: SEBRING, sebring_school: SEBRING,
  imola_gp: IMOLA,
  barcelona_gp: BARCELONA,
  fuji_chicane: FUJI, fuji_classic: FUJI,
  long_beach: LONG_BEACH,
  paul_ricard_1a_v2: PAUL_RICARD, paul_ricard_1a: PAUL_RICARD, paul_ricard_1a_v2_short: PAUL_RICARD, paul_ricard_3a: PAUL_RICARD,
};

/** The turn's familiar name, else its name in the turn list, else none. */
export function familiarName(layoutKey: string, turn: Pick<PlacedTurn, 'number' | 'name'>): string | undefined {
  const familiar = turn.number === undefined ? undefined : FAMILIAR_NAMES[layoutKey]?.names[turn.number];
  return familiar ?? turn.name;
}
