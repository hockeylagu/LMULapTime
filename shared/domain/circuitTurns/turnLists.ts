/**
 * The official turns of each layout, in driving order from the start line (layer 1 of
 * docs/plans/proposed/CORNER_INSIGHT.md). Real-world facts from the cited sources, never invented:
 * a number comes from the circuit's own map ('official'), from that map's labelled turns with the
 * unlabelled numbers between them filled in order ('filled'), or from a racing series' published
 * numbering ('series'); a name comes from the circuit's or the series' pages. A direction is given only
 * where a source states it, and a map position only where a map labels the turn. A layout missing here
 * gets its turns from the centre line's own bends, unnumbered. Any change here changes the layout's
 * segments: bump TURN_LISTS_VERSION.
 */

export type TurnDirection = 'left' | 'right';
export type TurnLabelSource = 'official' | 'filled' | 'series';

export interface TurnListEntry {
  number?: number;
  /** The letter after the number where the source numbers a turn in parts ('A' of turn 10A). */
  suffix?: string;
  /** Overrides the list's numberSource for this turn. */
  numberSource?: TurnLabelSource;
  name?: string;
  direction?: TurnDirection;
  /**
   * Rough distance from the start line (metres) where the source map puts the turn's label, read off
   * the map against a few unmistakable corners (about ±100 m). The rule snaps it to the nearest bend.
   * In a variant's list (`variantOf`), a shared turn's position is the full layout's placed turn on the
   * variant's centre line, and an entry with neither number nor name is a bend only the variant drives,
   * which no source numbers: its position is that bend's (at least MIN_UNLISTED_TURN_DEG), labelled by position.
   */
  mapM?: number;
}

export interface LayoutTurnList {
  /** Where the numbers come from, unless a turn says otherwise; absent when the list has no numbers. */
  numberSource?: TurnLabelSource;
  /** Each source with what it gives and the date it was read. */
  sources: string[];
  turns: TurnListEntry[];
  /** Why the list's length differs from the game's corner count (`GAME_CORNER_COUNTS`), when it does. */
  gameCountNote?: string;
}

/** Part of the corner passes' version key. */
export const TURN_LISTS_VERSION = 1;

const turn = (number: number, mapM?: number, name?: string, direction?: TurnDirection): TurnListEntry =>
  ({ number, mapM, name, direction });
const named = (name: string, direction?: TurnDirection): TurnListEntry => ({ name, direction });

const LE_MANS_NAMES = 'Names and directions: ACO, 24h-lemans.com "Explore the 24 Hours of Le Mans circuit, turn by turn", 2026-06-07; no numbering found';
/** The full Le Mans circuit's named corners: [name, direction, map position on the full layout]. */
const LE_MANS_TURNS: Array<[string, TurnDirection | undefined, number]> = [
  ['Dunlop Curve', 'right', 650], ['Dunlop Chicane', undefined, 840],
  ['Forest Esses', 'left', 1480], ['Forest Esses', 'right', 1590], ['Tertre Rouge', 'right', 1920],
  ['Daytona Chicane', 'right', 4050], ['Michelin Chicane', 'left', 6020],
  ['Mulsanne Corner', 'right', 7740], ['Indianapolis', 'right', 9660], ['Indianapolis', 'left', 9850], ['Arnage', 'right', 10170],
  ['Porsche Curves', 'right', 11540], ['Porsche Curves', 'left', 11790], ['Porsche Curves', 'right', 12210],
  ['Karting Esses', 'right', 12690], ['Karting Esses', 'left', 12790],
  ['Ford Chicanes', 'left', 13260], ['Ford Chicanes', 'right', 13310], ['Ford Chicanes', 'left', 13410], ['Motul Turn', 'right', 13450],
];
/** The Mulsanne layout runs the straight without its two chicanes, 70 m shorter after them. */
const LE_MANS_MULSANNE_TURNS: TurnListEntry[] = LE_MANS_TURNS
  .filter(([name]) => name !== 'Daytona Chicane' && name !== 'Michelin Chicane')
  .map(([name, direction, mapM]) => ({ name, direction, mapM: mapM < 4000 ? mapM : mapM - 70 }));
/** Turns 1, 2, 3... at these map positions, numbers only. */
const numberedAt = (positions: number[]): TurnListEntry[] => positions.map((mapM, index) => turn(index + 1, mapM));
const f1Map = (page: string, note = '') =>
  `Numbers and map positions: Formula 1 circuit map, formula1.com ${page} page (read 2026-11-18)${note}; no names or directions`;

const FULL_LAYOUT_TURN_LISTS: Readonly<Record<string, LayoutTurnList>> = {
  bahrain_wec: {
    numberSource: 'series',
    sources: [f1Map('Bahrain Grand Prix')],
    turns: numberedAt([750, 850, 970, 1560, 1830, 1930, 2020, 2280, 2630, 2740, 3510, 3830, 4100, 4940, 5080]),
  },
  barcelona_gp: {
    numberSource: 'series',
    sources: [f1Map('Spanish Grand Prix', ", 2023 layout without the chicane; turn 10's label sits between two parts of the track and is read at the hairpin")],
    turns: numberedAt([840, 940, 1160, 1760, 2150, 2380, 2590, 2660, 2920, 3490, 3630, 3790, 4070, 4300]),
  },
  cota_gp: {
    numberSource: 'series',
    sources: [f1Map('United States Grand Prix', '; turn 6 read at the top of the climb, 13 and 14 at their two rights')],
    turns: numberedAt([640, 910, 1160, 1240, 1350, 1560, 1720, 1820, 1980, 2150, 2580, 3780, 4000, 4100, 4290, 4490, 4570, 4760, 5030, 5340]),
  },
  imola_gp: {
    numberSource: 'series',
    sources: [f1Map('Emilia-Romagna Grand Prix')],
    turns: numberedAt([20, 700, 760, 890, 1330, 1410, 1700, 2120, 2330, 2520, 2730, 2860, 2920, 3350, 3390, 3930, 4130, 4270, 4620]),
    gameCountNote: 'Formula 1 numbers 19 turns; the game counts 20. Which bend it adds is not known; the series numbering stands.',
  },
  interlagos_gp: {
    numberSource: 'series',
    sources: [f1Map('São Paulo Grand Prix')],
    turns: numberedAt([380, 470, 660, 1450, 1610, 2030, 2140, 2440, 2520, 2870, 3050, 3260, 3390, 3640, 4070]),
  },
  qatar_gp: {
    numberSource: 'series',
    sources: [f1Map('Qatar Grand Prix')],
    turns: numberedAt([800, 1110, 1330, 1750, 1900, 2220, 2620, 2790, 2940, 3180, 3370, 3810, 3970, 4170, 4520, 5000]),
  },
  daytona_road_course: {
    numberSource: 'series',
    sources: ['Numbers and map positions: "Daytona International Speedway - Road Course" map, Wikimedia Commons (read 2026-11-18), the sports car road course numbered 1-12 with the Bus Stop as 8-11; no official numbered map found'],
    turns: [turn(1, 480), turn(2, 690), turn(3, 960, 'International Horseshoe'), turn(4, 1450), turn(5, 1770), turn(6, 2170), turn(7, 2790),
      turn(8, 3840, 'Bus Stop'), turn(9, 3900, 'Bus Stop'), turn(10, 3980, 'Bus Stop'), turn(11, 4020, 'Bus Stop'), turn(12, 4660)],
    gameCountNote: 'The map numbers 12 turns; the game counts 13.',
  },
  fuji_chicane: {
    numberSource: 'series',
    sources: [
      'Numbers and map positions: "Circuit Fuji" map, Wikimedia Commons (read 2026-11-18), turns 1-16 with the Dunlop chicane as 10-12; turns 7 and 14 have no bend of their own and sit at their map positions',
      'Turn count and braking zones at turns 1, 6, 10 and 16: FIA, fia.com "WEC - 6 Hours of Fuji facts and figures" (read 2026-11-18)',
    ],
    turns: [turn(1, 770), turn(2, 920), turn(3, 1320), turn(4, 1590), turn(5, 1780), turn(6, 2030), turn(7, 2110), turn(8, 2330), turn(9, 2550),
      turn(10, 2850, 'Dunlop'), turn(11, 2920, 'Dunlop'), turn(12, 2990, 'Dunlop'), turn(13, 3160), turn(14, 3320), turn(15, 3430), turn(16, 3700)],
  },
  laguna_seca: {
    numberSource: 'official',
    sources: ['Numbers and names: WeatherTech Raceway Laguna Seca facility map, weathertechraceway.com track information page (read 2026-11-18); positions are the bends in the map\'s order'],
    turns: [turn(1, 230), turn(2, 500, 'Andretti Hairpin', 'left'), turn(3, 660), turn(4, 790), turn(5, 1060), turn(6, 1550), turn(7, 1950),
      { number: 8, mapM: 2460, name: 'Corkscrew', direction: 'left' }, { number: 8, suffix: 'A', mapM: 2510, name: 'Corkscrew', direction: 'right' },
      turn(9, 2720, 'Rainey Curve', 'left'), turn(10, 3000), turn(11, 3290)],
    gameCountNote: 'The circuit numbers 11 turns with the Corkscrew as 8 and 8A; the game counts 11.',
  },
  long_beach: {
    numberSource: 'official',
    sources: ['Numbers and map positions: Grand Prix of Long Beach 2027 circuit map, gplb.com circuit map page (read 2026-11-18); no names beyond sponsors\''],
    turns: numberedAt([740, 910, 950, 1060, 1210, 1620, 1690, 1920, 2550, 2690, 2840]),
  },
  paul_ricard_1a_v2: {
    numberSource: 'series',
    sources: [f1Map('French Grand Prix 2022', ', the 2018-2022 layout; this layout drives the Mistral straight without its chicane (turns 8 and 9)')],
    turns: [turn(1, 640), turn(2, 750), turn(3, 1320), turn(4, 1400), turn(5, 1520), turn(6, 1660), turn(7, 1890),
      turn(10, 3840), turn(11, 4370), turn(12, 4770), turn(13, 5010), turn(14, 5290), turn(15, 5450)],
    gameCountNote: 'Formula 1 numbers 15 turns, 8 and 9 the Mistral chicane this layout does not drive; the game counts 15 on this layout.',
  },
  road_atlanta: {
    numberSource: 'official',
    sources: ['Numbers and names: Michelin Raceway Road Atlanta 2026 general track map, michelinracewayroadatlanta.com track map page (read 2026-11-18); a perspective drawing, so only turns 8 and 9, kinks on the back straight, carry map positions (about ±150 m)'],
    turns: [turn(1), turn(2), turn(3), turn(4), named('The Esses'), named('The Esses'), turn(5), turn(6), turn(7), turn(8, 2390), turn(9, 2850),
      { number: 10, suffix: 'A' }, { number: 10, suffix: 'B' }, turn(11), turn(12)],
    gameCountNote: 'The circuit numbers 13 turns (10A and 10B) and names the esses between 4 and 5; the game counts 12.',
  },
  silverstone_wec: {
    numberSource: 'series',
    sources: [f1Map('British Grand Prix', "; turn 8's label sits beside turn 6 and is read at Woodcote")],
    turns: numberedAt([310, 490, 770, 920, 1150, 1800, 2070, 2440, 2970, 3490, 3600, 3740, 3900, 4080, 4930, 5400, 5470, 5670]),
  },
  monza_gp: {
    numberSource: 'series',
    sources: [
      'Numbers and map positions: Formula 1 circuit map, formula1.com Italian Grand Prix page (read 2026-11-18)',
      'Names and directions: Autodromo Nazionale Monza, monzanet.it "Il tracciato della pista di Monza" (read 2026-11-18)',
    ],
    turns: [
      turn(1, 940, 'Variante del Rettifilo', 'right'), turn(2, 980, 'Variante del Rettifilo', 'left'),
      turn(3, 1490, 'Curva Biassono', 'right'),
      turn(4, 2140, 'Variante della Roggia', 'left'), turn(5, 2210, 'Variante della Roggia', 'right'),
      turn(6, 2540, 'Prima Curva di Lesmo', 'right'), turn(7, 2890, 'Seconda Curva di Lesmo'),
      turn(8, 3930, 'Variante Ascari', 'left'), turn(9, 4030, 'Variante Ascari', 'right'), turn(10, 4130, 'Variante Ascari', 'left'),
      turn(11, 5150, 'Curva Alboreto'),
    ],
  },
  spa_gp: {
    numberSource: 'series',
    sources: [
      'Numbers and map positions: Formula 1 circuit map, formula1.com Belgian Grand Prix page (read 2026-11-18)',
      'Names and directions: formula1.com "How every corner at the Circuit de Spa-Francorchamps got its name", 2026-07-15',
    ],
    turns: [
      turn(1, 270, 'La Source'),
      turn(2, 960, "Raidillon de l'Eau Rouge"), turn(3, 1060, "Raidillon de l'Eau Rouge"), turn(4, 1190, "Raidillon de l'Eau Rouge"),
      turn(5, 2300, 'Les Combes'), turn(6, 2390, 'Les Combes'),
      turn(7, 2530, 'Malmedy', 'right'), turn(8, 2960, 'Bruxelles', 'right'), turn(9, 3230, 'Jacky Ickx Curve'),
      turn(10, 3680, 'Pouhon', 'left'), turn(11, 3920, 'Pouhon', 'left'),
      turn(12, 4310, 'Fagnes'), turn(13, 4490, 'Fagnes'),
      turn(14, 4810, 'Campus / Paul Frère'), turn(15, 5090, 'Campus / Paul Frère'),
      turn(16, 5770, 'Blanchimont', 'left'), turn(17, 6060, 'Blanchimont', 'left'),
      turn(18, 6620, 'Bus Stop'), turn(19, 6680, 'Bus Stop'),
    ],
    gameCountNote: 'Formula 1 numbers 19 turns; the game counts 20. Which bend it adds is not known; the series numbering stands.',
  },
  portimao_wec: {
    numberSource: 'series',
    sources: ['Numbers and map positions: Formula 1 circuit map, formula1.com Portuguese Grand Prix map (read 2026-11-18); no names or directions found'],
    turns: numberedAt([410, 560, 740, 890, 1460, 1720, 1920, 2060, 2430, 2630, 2790, 2980, 3180, 3420, 3900]),
  },
  sebring_full: {
    numberSource: 'filled',
    sources: ['Numbers and map positions: Sebring International Raceway 2026 event map (Twelve Hours of Sebring, 2026-03-21) labels turns 1, 3, 5, 7, 10, 13, 15, 16 and 17; the others are filled in order'],
    turns: Array.from({ length: 17 }, (_, index): TurnListEntry => {
      const mapM = ({ 1: 490, 3: 950, 5: 1210, 7: 1990, 10: 2790, 13: 3280, 15: 4110, 16: 4300, 17: 5340 } as Record<number, number>)[index + 1];
      return mapM === undefined ? { number: index + 1 } : { number: index + 1, numberSource: 'official', mapM };
    }),
  },
  sarthe_full: {
    sources: [LE_MANS_NAMES, 'Map positions: the order of "Circuit de la Sarthe track map", Wikimedia Commons (read 2026-11-18), on the centre line\'s bends; the second Ford chicane\'s right is taken as the Motul Turn, no bend following it'],
    gameCountNote: 'The official source names 20 corners and numbers none; the game counts 38, every bend including the kinks the names group or leave out.',
    turns: LE_MANS_TURNS.map(([name, direction, mapM]) => ({ name, direction, mapM })),
  },
};

/**
 * A layout variant keeps its full layout's numbers and names for the turns it shares (T3 stays T3, in the variant's
 * driving order); a bend only the variant drives is unlabelled (`null`), no numbering for it having been found.
 * Each pair is [the full layout's turn number or null, the position on the variant's centre line (metres)].
 */
function variantOf(fullLayoutKey: string, turns: Array<[number | null, number]>, gameCountNote?: string): LayoutTurnList {
  const full = FULL_LAYOUT_TURN_LISTS[fullLayoutKey];
  return {
    numberSource: full.numberSource,
    sources: [`Shared turns: the ${fullLayoutKey} list's numbers and names (its sources), placed where this layout drives them; bends only this layout drives are unlabelled, no numbering for them found (2026-11-18)`],
    turns: turns.map(([number, mapM]) => {
      if (number === null) return { mapM };
      const entry = full.turns.find(candidate => candidate.number === number);
      if (!entry) throw new Error(`${fullLayoutKey} has no turn ${number}`);
      return { ...entry, mapM };
    }),
    gameCountNote,
  };
}

const OTHER_BENDS = 'The game counts every bend of the layout; this list keeps the numbered ones and the bends of its own stretch.';

export const LAYOUT_TURN_LISTS: Readonly<Record<string, LayoutTurnList>> = {
  ...FULL_LAYOUT_TURN_LISTS,
  bahrain_outer: variantOf('bahrain_wec', [[1, 740], [2, 840], [3, 950], [4, 1540], [null, 1670], [null, 1920], [null, 2050], [null, 2110],
    [null, 2310], [14, 3070], [15, 3150]]),
  bahrain_paddock: variantOf('bahrain_wec', [[1, 740], [2, 840], [3, 950], [null, 1020], [11, 1910], [12, 2260], [13, 2550], [14, 3350], [15, 3440]],
    `${OTHER_BENDS} 9 here, the game 10.`),
  bahrain_endurance: variantOf('bahrain_wec', [[1, 740], [2, 840], [3, 950], [4, 1540], [null, 1670], [null, 1920], [null, 2050], [null, 2110],
    [null, 2180], [null, 2260], [null, 2350], [null, 2460], [5, 2700], [6, 2790], [7, 2910], [8, 3160], [9, 3530], [10, 3630], [11, 4380],
    [12, 4730], [13, 5020], [14, 5820], [15, 5900]], `${OTHER_BENDS} 23 here, the game 24.`),
  cota_national: variantOf('cota_gp', [[1, 660], [2, 900], [3, 1170], [4, 1260], [5, 1350], [null, 1530], [null, 1640], [null, 1670], [null, 1720],
    [12, 2000], [13, 2230], [14, 2320], [15, 2520], [16, 2730], [17, 2820], [18, 3040], [19, 3270], [20, 3570]],
    'Formula 1 numbers the shared turns; with the 4 bends of its own link this list has 18, the game 17.'),
  // Without the Dunlop chicane, turn 10 is a single right and 11 and 12 are not driven.
  fuji_classic: variantOf('fuji_chicane', [[1, 770], [2, 920], [3, 1320], [4, 1590], [5, 1780], [6, 2030], [7, 2110], [8, 2330], [9, 2550],
    [10, 2840], [13, 3120], [14, 3280], [15, 3390], [16, 3660]]),
  monza_curvagrande: variantOf('monza_gp', [[3, 1440], [4, 2110], [5, 2150], [6, 2520], [7, 2850], [8, 3920], [9, 4020], [10, 4110], [11, 5200]],
    'The variant drives 9 of the full layout\'s numbered turns, the first chicane bypassed; the game counts 10.'),
  qatar_short: variantOf('qatar_gp', [[1, 800], [null, 1230], [null, 1290], [null, 1360], [null, 1560], [12, 2080], [13, 2270], [14, 2480],
    [15, 2800], [16, 3270]], `${OTHER_BENDS} 10 here, the game 11.`),
  // The 1A start takes a fast left and a right instead of the tight S of turns 1 and 2.
  paul_ricard_1a: variantOf('paul_ricard_1a_v2', [[null, 670], [null, 890], [3, 1280], [4, 1360], [5, 1480], [6, 1620], [7, 1850], [10, 3800],
    [11, 4330], [12, 4730], [13, 4980], [14, 5250], [15, 5410]]),
  paul_ricard_1a_v2_short: variantOf('paul_ricard_1a_v2', [[1, 640], [2, 750], [3, 1320], [4, 1400], [5, 1520], [6, 1660], [7, 1890], [10, 3840],
    [null, 4060], [null, 4120], [12, 4200], [13, 4440], [14, 4720], [15, 4880]]),
  paul_ricard_3a: variantOf('paul_ricard_1a_v2', [[null, 520], [null, 660], [10, 1850], [11, 2370], [12, 2780], [13, 3020], [14, 3300], [15, 3450]]),
  sarthe_mulsanne: {
    sources: [LE_MANS_NAMES, 'Shared turns: the sarthe_full list\'s names and map positions, without the two Mulsanne Straight chicanes this layout does not drive (2026-11-18)'],
    gameCountNote: 'The official source names 18 corners on this layout and numbers none; the game counts 38.',
    turns: LE_MANS_MULSANNE_TURNS,
  },
  sebring_school: variantOf('sebring_full', [[1, 490], [2, 600], [null, 890], [14, 1270], [15, 1380], [16, 1520], [17, 2620]]),
  silverstone_international: variantOf('silverstone_wec', [[1, 300], [2, 510], [3, 780], [4, 930], [null, 1080], [14, 1160], [15, 2040], [16, 2500],
    [17, 2570], [18, 2740]], `${OTHER_BENDS} 10 here, the game 8.`),
  // Becketts (11) is 44 m from where the full layout's apex falls on this line, where the National turns off.
  silverstone_national: variantOf('silverstone_wec', [[9, 380], [10, 920], [11, 1010], [null, 1180], [6, 1920], [7, 2120], [8, 2490]],
    `${OTHER_BENDS} 7 here, the game 6.`),
};
