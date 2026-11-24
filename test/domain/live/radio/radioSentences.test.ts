import { describe, expect, it } from 'vitest';
import { radioSentences, spokenTurn } from '../../../../shared/domain/live/radio/radioSentences.js';
import { DEMO_RADIO_CALLS } from '../../../../src/components/live/demo/demoRadio.js';
import { callSentences, clipFile } from '../../../../src/components/live/voice/callPieces.js';

describe("the engineer's clip library", () => {
  const library = radioSentences();
  const known = new Set(library);

  it('covers every sentence of the example calls', () => {
    const missing = DEMO_RADIO_CALLS.flatMap(group => group.calls.flatMap(call => callSentences(call.text))).filter(sentence => !known.has(sentence));
    expect(missing).toEqual([]);
  });

  it('starts with the calls that matter most and gives each sentence its own file', () => {
    expect(library[0]).toBe('Box this lap.');
    expect(new Set(library.map(clipFile)).size).toBe(library.length);
    for (const sentence of ['Front left puncture.', 'Yellow, Turn 10A.', 'Tertre Rouge clear.', 'Energy 0 percent.', 'New wet.', 'Save to hold lap 200.',
      'Six GT3s behind.', 'Hyper Aston ahead.', '1 second.', 'Passes in 1 second.', 'P2 Oreca behind, catching.', 'Three cars off both sides.', 'Car rejoining, careful.', 'Set 1.50.',
      'Set deployment 200.', 'Rejoin P60.', 'Behind the Genesis.', 'Ahead of the Hyper Porsche.', 'Behind the car.', 'Ahead of two GT3s.', 'Ahead of six cars.',
      'Repair 125 seconds.', 'Costs 300 to the flag.', 'Repair over 5 minutes.', 'No tyre change.', 'Fuel 46 litres.', 'Set 120.']) {
      expect(known.has(sentence), sentence).toBe(true);
    }
  });

  it('names a turn by its number, with its letter, else by its name', () => {
    expect(spokenTurn({ number: 10, suffix: 'A' })).toBe('Turn 10A');
    expect(spokenTurn({ name: 'Arnage' })).toBe('Arnage');
    expect(spokenTurn({})).toBeNull();
  });
});
