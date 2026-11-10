/**
 * Names of the replay pit state byte (opcode 322, docs/VCR_FORMAT.md §4.19): the low nibble is the pit state (0 none,
 * 1 stop requested, 2 entering the pit lane, 4 stopped in the box, 5 released), the high nibble the running state
 * (2 racing, 1 not racing). 16 and 21 keep the app's garage meaning (server/replay/decode/garageState.ts).
 */
const GARAGE_ACTIONS: Readonly<Record<number, string>> = { 16: 'exited garage', 21: 'returned to garage' };
const PIT_STATE_ACTIONS: Readonly<Record<number, string>> = {
  0: 'exited pit lane',
  1: 'requested pit',
  2: 'entered pit lane',
  4: 'stopped in box',
  5: 'released',
};

/** The action of a pit state code, and whether it is a garage move; undefined for a code with no named state. */
export function pitCodeAction(code: number): { action: string; isGarage: boolean } | undefined {
  const garage = GARAGE_ACTIONS[code];
  if (garage) return { action: garage, isGarage: true };
  const running = code >> 4;
  const action = running === 1 || running === 2 ? PIT_STATE_ACTIONS[code & 15] : undefined;
  return action ? { action, isGarage: false } : undefined;
}
