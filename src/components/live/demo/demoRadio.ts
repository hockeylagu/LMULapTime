import type { LiveCallPriority } from '../../../../shared/domain/live/radio/liveCalls.js';

interface DemoRadioCall { text: string; priority: LiveCallPriority }
interface DemoRadioGroup { group: string; calls: readonly DemoRadioCall[] }

const call = (priority: LiveCallPriority, text: string): DemoRadioCall => ({ text, priority });

/**
 * One example of every radio call, worded as `liveCalls` and `FieldWatch` say them, to listen to the voice and
 * the wording at the Settings volume. A wording change in those modules is copied here.
 */
export const DEMO_RADIO_CALLS: readonly DemoRadioGroup[] = [
  { group: 'Strategy', calls: [
    call(2, 'Box in 2 laps.'),
    call(2, 'Box next lap.'),
    call(1, 'Box this lap. Energy 38 percent. No tyre change.'),
    call(2, 'Pit menu energy too low. Set 62.'),
    call(2, 'Fuel ratio too low. Set 0.90.'),
    call(2, 'Pit menu has no tyre change. Set new tyres.'),
    call(2, 'Rejoin P4. Behind the Genesis. Ahead of two GT3s.'),
    call(3, 'Energy use too high. Save to hold lap 19.'),
    call(3, 'Save 4 percent to skip the stop.'),
    call(3, "Tyres won't reach the stop. Plan a change."),
    call(2, 'Fuel runs out before energy. Check your fuel ratio.'),
    call(2, 'Set deployment 40.'),
  ] },
  { group: 'Damage and penalties', calls: [
    call(1, 'Front right puncture. Box this lap.'),
    call(1, 'Rear left wheel lost. Box this lap.'),
    call(2, 'Damage. Repair 30 seconds. Costs 45 to the flag.'),
    call(2, 'Suspension damage. Repair 50 seconds. Costs 45 to the flag. Stay out.'),
    call(1, 'Penalty pending.'),
    call(1, 'Penalty. No service on this stop.'),
  ] },
  { group: 'Incidents and flags', calls: [
    call(1, 'Turn 6. Car stopped on track, left, in your path.'),
    call(1, 'Yellow, Turn 6. Two cars stopped on track, right, clear of your line.'),
    call(1, 'Yellow, Turn 11. Car stopped on track, right, in your path.'),
    call(1, 'Turn 6. Slow car on track, left.'),
    call(2, 'Turn 6. Car off right.'),
    call(1, 'Turn 6. Car rejoining, careful.'),
    call(2, 'Turn 6 clear.'),
    call(1, 'Yellow, sector 2.'),
    call(2, 'Green, sector 2.'),
  ] },
  { group: 'Traffic', calls: [
    call(2, 'Hyper Porsche behind, catching. Passes in 6 seconds.'),
    call(2, 'Two Hypers behind.'),
    call(3, 'GT3 Lexus ahead. 4 seconds.'),
  ] },
  { group: 'Clock', calls: [
    call(3, 'Ten minutes.'),
    call(3, 'Last lap.'),
    call(2, 'Time for one more lap.'),
    call(2, 'No time for another lap.'),
  ] },
];
