/**
 * Each layout's corner count as the game's own layout file states it, read once on 2026-11-18 (and once again for a
 * new layout, never exported continuously). A check on the official turn lists only: it never places or labels a
 * turn, and the game's own turn numbers never label one.
 */
export const GAME_CORNER_COUNTS: Readonly<Record<string, number>> = {
  bahrain_endurance: 24, bahrain_outer: 11, bahrain_paddock: 10, bahrain_wec: 15,
  barcelona_gp: 14,
  cota_gp: 20, cota_national: 17,
  daytona_road_course: 13,
  fuji_chicane: 16, fuji_classic: 14,
  imola_gp: 20,
  interlagos_gp: 15,
  laguna_seca: 11,
  long_beach: 11,
  monza_curvagrande: 10, monza_gp: 11,
  paul_ricard_1a: 13, paul_ricard_1a_v2: 15, paul_ricard_1a_v2_short: 14, paul_ricard_3a: 8,
  portimao_wec: 15,
  qatar_gp: 16, qatar_short: 11,
  road_atlanta: 12,
  sarthe_full: 38, sarthe_mulsanne: 38,
  sebring_full: 17, sebring_school: 7,
  silverstone_international: 8, silverstone_national: 6, silverstone_wec: 18,
  spa_gp: 20,
};
