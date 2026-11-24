import { describe, expect, it } from 'vitest';
import { deploymentText, liveCalls } from '../../../../shared/domain/live/radio/liveCalls.js';
import type { LiveDeployment } from '../../../../shared/types/liveStrategy.js';
import type { LiveSnapshot } from '../../../../shared/types/live.js';
import { liveSession, liveSnapshot, liveStrategy } from '../../../helpers/liveSnapshot.js';

const snapshot = () => liveSnapshot({ strategy: liveStrategy() });
const texts = (value: Parameters<typeof liveCalls>[0]) => liveCalls(value).map(call => call.text);
const deployment = (patch: Partial<LiveDeployment> = {}): LiveDeployment => ({
  unit: 'kW', current: 60, target: 40, next: null, changeSeconds: null, settlingLaps: 0, chargePercent: 55,
  changePerLap: -3, edge: 20, edgeSeconds: 90, ...patch,
});

describe('radio calls', () => {
  it('withholds advice while paused, in the garage, practicing, or calculating', () => {
    expect(liveCalls({ ...snapshot(), session: liveSession({ gamePhase: 9 }) })).toEqual([]);
    expect(liveCalls({ ...snapshot(), lifecycle: 'garage' })).toEqual([]);
    expect(liveCalls({ ...snapshot(), session: liveSession({ kind: 'practice' }) })).toEqual([]);
    expect(liveCalls(liveSnapshot())).toEqual([]);
    expect(liveCalls(liveSnapshot({ strategy: liveStrategy({ resource: null }) }))).toEqual([]);
  });

  it('stays silent mid-stint and for finish coverage, and counts the stop down from two laps', () => {
    const value = snapshot();
    expect(liveCalls(value)).toEqual([]);
    value.strategy!.resource!.race!.finishReachable = true;
    expect(liveCalls(value)).toEqual([]);
    value.strategy!.resource!.race!.finishReachable = false;
    value.strategy!.resource!.race!.pitInLaps = 2;
    expect(liveCalls(value)).toMatchObject([{ text: 'Box in 2 laps.', priority: 2 }]);
    value.strategy!.resource!.race!.pitInLaps = 1;
    expect(texts(value)).toEqual(['Box next lap.']);
  });

  it('explains excess consumption with the pit lap to hold, keyed by the stop', () => {
    const over = snapshot();
    over.strategy!.resource!.race!.sparePerLap = -0.3;
    const [call] = liveCalls(over);
    expect(call).toMatchObject({ text: 'Energy use too high. Save to hold lap 19.', priority: 3 });
    over.strategy!.resource!.race!.pitLap = 20;
    expect(liveCalls(over)[0].key).toBe(call.key);
    over.strategy!.resource!.race!.stopsAfterNext = 1;
    expect(liveCalls(over)[0].key).not.toBe(call.key);
  });

  it('lists every pit menu fix after the countdown, so one heard lets the next through', () => {
    const value = snapshot();
    value.strategy!.resource!.race!.pitInLaps = 1;
    value.strategy!.resource!.race!.neededAfterStop = 62;
    value.strategy!.tyres!.coverage = { target: 'pit', projectedTread: 0.3, setsNeeded: 2, availableSetsCover: true };
    value.strategy!.pit!.mfd!.tyres = 'No Change';
    value.strategy!.fuelRatio = { recommended: 0.9, source: 'measured', pairedLaps: 4,
      garageSetting: 0.8, mfdSetting: 0.8, excessLitres: null, fuelBiasLaps: null };
    expect(texts(value)).toEqual(['Box next lap.', 'Pit menu energy too low. Set 62.', 'Fuel ratio too low. Set 0.90.',
      'Pit menu has no tyre change. Set new tyres.']);
  });

  it('explains damage costs, saying stay out only when the repair alone costs more', () => {
    const damaged = snapshot();
    damaged.strategy!.damage = { wheel: null, body: 0.4, suspension: null, partsDetached: false,
      impactLap: 10, lapsSinceImpact: 2, paceLossPerLap: 1, lossToFinish: 45, repairSeconds: 30, significant: true };
    expect(texts(damaged)).toEqual(['Damage. Repair 30 seconds. Costs 45 to the flag.']);
    damaged.strategy!.damage.repairSeconds = 50;
    damaged.strategy!.damage.suspension = 0.7;
    expect(texts(damaged)).toEqual(['Suspension damage. Repair 50 seconds. Costs 45 to the flag. Stay out.']);
    // Past a minute to the nearest 5 seconds, so every value has a clip; said again only when the said repair changes.
    damaged.strategy!.damage.repairSeconds = 127;
    damaged.strategy!.damage.lossToFinish = 412;
    const long = liveCalls(damaged)[0];
    expect(long.text).toBe('Suspension damage. Repair 125 seconds. Costs over 5 minutes to the flag.');
    damaged.strategy!.damage.repairSeconds = 126;
    expect(liveCalls(damaged)[0].key).toBe(long.key);
    damaged.strategy!.damage.repairSeconds = 400;
    damaged.strategy!.damage.lossToFinish = 90;
    expect(texts(damaged)).toEqual(['Suspension damage. Repair over 5 minutes. Costs 90 to the flag. Stay out.']);
    damaged.strategy!.damage.repairSeconds = 50;
    damaged.strategy!.damage.wheel = { problem: 'flat', corner: 'FR' };
    expect(liveCalls(damaged)[0]).toMatchObject({ text: 'Front right puncture. Box this lap.', priority: 1, family: 'damage' });
  });

  it('says the saving in whole percent, rounded up', () => {
    const saving = snapshot();
    saving.strategy!.resource!.saving = { targetPerLap: 2.4, savePerLap: 0.1, savePercent: 0.1, shortfall: 1, source: 'measured' };
    expect(texts(saving)).toEqual(['Save 1 percent to skip the stop.']);
    saving.strategy!.resource!.saving.savePercent = 3.2;
    expect(texts(saving)).toEqual(['Save 4 percent to skip the stop.']);
  });

  it('explains tyre coverage, and only the penalty in the pit lane', () => {
    const tyres = snapshot();
    tyres.strategy!.tyres!.coverage = { target: 'pit', projectedTread: 0.3, setsNeeded: 2, availableSetsCover: true };
    expect(texts(tyres)).toEqual(["Tyres won't reach the stop. Plan a change."]);
    tyres.strategy!.tyres!.coverage.target = 'finish';
    expect(texts(tyres)).toEqual(["Tyres won't reach the flag. Plan a change."]);
    tyres.strategy!.pit!.state = 'entering';
    tyres.strategy!.pit!.penalties = 1;
    expect(texts(tyres)).toEqual(['Penalty. No service on this stop.']);
  });

  it('warns when fuel limits an otherwise covered energy plan', () => {
    const value = snapshot();
    value.strategy!.resource!.race!.finishReachable = true;
    value.strategy!.fuelRatio = { recommended: 0.9, source: 'measured', pairedLaps: 4,
      garageSetting: 0.8, mfdSetting: 0.8, excessLitres: null, fuelBiasLaps: -1 };
    expect(texts(value)).toEqual(['Fuel runs out before energy. Check your fuel ratio.']);
  });

  it('says the whole stop on the box call, no tyre change included, before anything else', () => {
    const value = snapshot();
    value.strategy!.resource!.race!.pitInLaps = 0;
    value.strategy!.resource!.race!.sparePerLap = -0.3;
    value.strategy!.pit!.mfd!.tyres = 'No Change';
    expect(liveCalls(value)[0]).toMatchObject({ text: 'Box this lap. Energy 38 percent. No tyre change.', priority: 1 });
    // The over-budget call holds the pit lap: on the box lap it has nothing to say.
    expect(texts(value)).toEqual(['Box this lap. Energy 38 percent. No tyre change.']);
    // A fuel car: whole litres, rounded up as the pit menu is set.
    value.strategy!.resource!.kind = 'fuel';
    value.strategy!.resource!.unit = 'L';
    value.strategy!.resource!.race!.neededAfterStop = 45.3;
    expect(texts(value)).toEqual(['Box this lap. Fuel 46 litres. No tyre change.']);
    value.strategy!.resource!.race!.pitInLaps = 1;
    value.strategy!.pit!.mfd!.resourceValue = 40;
    expect(texts(value)).toContain('Pit menu fuel too low. Set 46.');
  });

  it('says a new deployment target in kW or map position, in races and practice, once per target', () => {
    expect(deploymentText(deployment())).toBe('Set deployment 40.');
    expect(deploymentText(deployment({ unit: 'map', current: 3, target: 5 }))).toBe('Set deployment map 5.');
    for (const hold of [deployment({ target: 60 }), deployment({ target: null }), deployment({ current: null }), deployment({ settlingLaps: 1 }), null]) {
      expect(deploymentText(hold)).toBeNull();
    }
    const value = snapshot();
    value.strategy!.deployment = deployment();
    expect(liveCalls(value)).toMatchObject([{ text: 'Set deployment 40.', priority: 2, family: 'deployment', waitSeconds: 30 }]);
    expect(texts({ ...value, session: liveSession({ kind: 'practice' }) })).toEqual(['Set deployment 40.']);
    expect(texts({ ...value, session: liveSession({ kind: 'qualifying' }) })).toEqual([]);
    value.strategy!.pit!.state = 'stopped';
    expect(texts(value)).toEqual([]);
  });

  it('says a new penalty once, and the race and qualifying clock', () => {
    const value = snapshot();
    value.strategy!.pit!.penalties = 1;
    expect(liveCalls(value)).toMatchObject([{ text: 'Penalty pending.', priority: 1 }]);
    value.strategy!.pit!.penalties = 2;
    expect(liveCalls(value)[0].key).toContain('penalty-2');
    const clock = (patch: Partial<LiveSnapshot>) => texts({ ...snapshot(), ...patch });
    expect(clock({ session: liveSession({ elapsedSeconds: 610, endSeconds: 1200 }) })).toEqual(['Ten minutes.']);
    expect(clock({ session: liveSession({ elapsedSeconds: 500, endSeconds: 1200 }) })).toEqual([]);
    expect(clock({ lapsLeft: { laps: 1, estimated: false } })).toEqual(['Last lap.']);
    const quali = (left: number) => clock({
      session: liveSession({ kind: 'qualifying', elapsedSeconds: 1000 - left, endSeconds: 1000, playerLapsCompleted: 3 }),
      sessionBest: { lapSeconds: 100, lapSectors: [null, null, null], bestSectors: [null, null, null], bestPossibleSeconds: null },
    });
    expect(quali(150)).toEqual(['Time for one more lap.']);
    expect(quali(80)).toEqual(['No time for another lap.']);
    expect(quali(300)).toEqual([]);
    // What was left at the line decides: 150 s left 70 s into the lap was 220 s at the line, two laps and more.
    const midLap = (left: number, sinceLine: number) => clock({
      session: liveSession({ kind: 'qualifying', elapsedSeconds: 1000 - left, endSeconds: 1000, playerLapsCompleted: 3, playerLapStartSeconds: 1000 - left - sinceLine }),
      sessionBest: { lapSeconds: 100, lapSectors: [null, null, null], bestSectors: [null, null, null], bestPossibleSeconds: null },
    });
    expect(midLap(150, 70)).toEqual([]);
    expect(midLap(80, 70)).toEqual(['Time for one more lap.']);
    expect(midLap(20, 70)).toEqual(['No time for another lap.']);
  });

  it('keeps only P1 calls on the race\'s first lap', () => {
    const value = liveSnapshot({ strategy: liveStrategy(), session: liveSession({ playerLapsCompleted: 0 }) });
    value.strategy!.resource!.race!.sparePerLap = -0.3;
    value.strategy!.deployment = deployment();
    expect(liveCalls(value)).toEqual([]);
    value.strategy!.damage = { ...value.strategy!.damage!, wheel: { problem: 'detached', corner: 'RL' } };
    expect(texts(value)).toEqual(['Rear left wheel lost. Box this lap.']);
  });
});
