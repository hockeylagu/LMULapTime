import type { LiveConnection } from '../../../api/liveStream.js';
import type { LiveSnapshot, LiveTiming } from '../../../../shared/types/live.js';
import { configureDemoSession, demoResult, demoSnapshot, demoStrategy, demoTiming } from './demoData.js';
import { configureDemoClass } from './demoClasses.js';

interface DemoState { snapshot: LiveSnapshot | null; timing: LiveTiming | null; connection: LiveConnection }
interface Scenario { id: string; group: string; label: string; apply: (s: LiveSnapshot, t: LiveTiming) => void }
const scenario = (id: string, group: string, label: string, apply: Scenario['apply']): Scenario => ({ id, group, label, apply });

/** Named, repeatable display branches, available in production builds. */
export const DEMO_SCENARIOS: readonly Scenario[] = [
  scenario('connecting', 'Connect and load', 'Connecting to server', () => {}),
  scenario('offline', 'Connect and load', 'Offline', s => {
    s.lifecycle = 'offline'; s.session = null; s.identity = null; s.strategy = null; s.weather = null; s.lapsLeft = null;
  }),
  scenario('menu', 'Connect and load', 'Main menu', s => {
    s.lifecycle = 'menu'; s.session = null; s.identity = null; s.strategy = null; s.weather = null; s.lapsLeft = null;
  }),
  scenario('loading', 'Connect and load', 'Loading session', s => {
    s.lifecycle = 'loading'; s.loadingProgress = 0.63;
  }),
  scenario('garage-practice', 'Practice · 60 min', 'Practice preparation', s => {
    s.lifecycle = 'garage'; s.session!.kind = 'practice'; s.session!.inRealtime = false;
  }),
  scenario('practice-out-lap', 'Practice · 60 min', 'Practice · out lap', (s, t) => {
    s.session!.kind = 'practice'; t.isOutLap = true; t.deltaSeconds = null;
    t.sectors = [null, null, null]; t.sectorDeltas = [null, null, null];
  }),
  scenario('first-lap', 'Practice · 60 min', 'Practice · no reference yet', (s, t) => { s.session!.kind = 'practice'; s.recentLaps = []; s.sessionBest = null; t.deltaSeconds = null; t.sectors = [null, null, null]; t.sectorDeltas = [null, null, null]; }),
  scenario('practice', 'Practice · 60 min', 'Practice · on track', s => { s.session!.kind = 'practice'; }),
  scenario('invalid-lap', 'Practice · 60 min', 'Practice · invalid last lap', s => { s.session!.kind = 'practice'; s.recentLaps[2].valid = false; }),
  scenario('garage-qualifying', 'Qualifying · 10 min', 'Qualifying preparation', s => {
    s.lifecycle = 'garage'; s.session!.kind = 'qualifying'; s.session!.inRealtime = false;
  }),
  scenario('qualifying-out-lap', 'Qualifying · 10 min', 'Qualifying · out lap', (s, t) => {
    s.session!.kind = 'qualifying'; t.isOutLap = true; t.deltaSeconds = null;
    t.sectors = [null, null, null]; t.sectorDeltas = [null, null, null];
  }),
  scenario('qualifying', 'Qualifying · 10 min', 'Qualifying · on track', s => { s.session!.kind = 'qualifying'; }),
  scenario('positive-delta', 'Qualifying · 10 min', 'Qualifying · losing time', (s, t) => { s.session!.kind = 'qualifying'; t.deltaSeconds = 1.24; t.sectorDeltas = [0.4, 0.84, null]; t.sector = 3; }),
  scenario('result-qualifying', 'Qualifying · 10 min', 'Qualifying result', s => {
    s.lifecycle = 'finished'; s.result = demoResult(); s.session!.kind = 'qualifying'; s.result.kind = 'qualifying'; s.result.settled = false;
  }),
  scenario('result-qualifying-settled', 'Qualifying · 10 min', 'Qualifying result · settled', s => {
    s.lifecycle = 'finished'; s.result = demoResult(); s.session!.kind = 'qualifying'; s.result.kind = 'qualifying'; s.result.settled = true;
  }),
  scenario('warmup', 'Warmup', 'Warmup · on track', s => { s.session!.kind = 'warmup'; }),
  scenario('garage-sprint', 'Race preparation and start', 'Sprint preparation', s => {
    s.lifecycle = 'garage'; s.session!.kind = 'race'; s.session!.inRealtime = false;
  }),
  scenario('garage-race', 'Race preparation and start', 'Race preparation', s => {
    s.lifecycle = 'garage'; s.session!.kind = 'race'; s.session!.inRealtime = false;
  }),
  scenario('start-0', 'Race preparation and start', 'On grid', s => { s.lifecycle = 'starting'; s.session!.gamePhase = 0; }),
  scenario('start-3', 'Race preparation and start', 'Formation lap', s => { s.lifecycle = 'starting'; s.session!.gamePhase = 3; }),
  scenario('start-4', 'Race preparation and start', 'Countdown', s => { s.lifecycle = 'starting'; s.session!.gamePhase = 4; }),
  scenario('calculating', 'Race · opening and stint', 'Race strategy unavailable', s => { s.strategy = null; }),
  scenario('game-estimate', 'Race · opening and stint', 'Game consumption estimate', s => { Object.assign(s.strategy!.resource!, { perLapSource: 'game', lapsMeasured: 0 }); }),
  scenario('race', 'Race · opening and stint', 'Mid-stint · VE', () => {}),
  scenario('overuse', 'Race · opening and stint', 'Consumption over target', s => { s.strategy!.resource!.race!.sparePerLap = -0.3; }),
  scenario('fuel-ratio', 'Race · opening and stint', 'Fuel runs out before VE', s => { s.strategy!.fuelRatio = { recommended: 0.95, source: 'measured', pairedLaps: 5, garageSetting: 0.9, mfdSetting: 0.9, excessLitres: null, fuelBiasLaps: -2 }; }),
  scenario('saving', 'Race · opening and stint', 'Save to skip stop', s => { s.strategy!.resource!.saving = { targetPerLap: 3.9, savePerLap: 0.1, savePercent: 2.5, shortfall: 2, source: 'measured' }; }),
  scenario('multi-stop', 'Race · opening and stint', 'Multiple stops remaining', s => { s.strategy!.resource!.race!.stopsAfterNext = 2; }),
  scenario('pit-request', 'Race · pit stop', 'Pit request', s => { s.strategy!.pit!.state = 'request'; }),
  scenario('pit-soon', 'Race · pit stop', 'Pit in two laps', s => { s.strategy!.resource!.race!.pitInLaps = 2; }),
  scenario('pit-this-lap', 'Race · pit stop', 'Pit this lap · MFD short', s => { s.strategy!.resource!.race!.pitInLaps = 0; }),
  scenario('pit-entering', 'Race · pit stop', 'Pit entering', s => { s.strategy!.pit!.state = 'entering'; }),
  scenario('pit-stopped', 'Race · pit stop', 'Pit stopped', s => { s.strategy!.pit!.state = 'stopped'; }),
  scenario('pit-exiting', 'Race · pit stop', 'Pit exiting', s => { s.strategy!.pit!.state = 'exiting'; }),
  scenario('sprint', 'Race · finish', '20 min sprint · finish reachable', () => {}),
  scenario('finished', 'Race · finish', 'Race finished', s => {
    s.lifecycle = 'finished';
  }),
  scenario('result-race', 'Race · finish', 'Race result', s => {
    s.lifecycle = 'finished'; s.result = demoResult();
  }),
  scenario('rain', 'Alternative conditions and incidents', 'Rain forecast', s => { s.strategy!.forecast = { change: 'rain', chance: 80, atSeconds: 2100, lap: 20 }; }),
  scenario('wet', 'Alternative conditions and incidents', 'Wet · getting wetter', s => { Object.assign(s.weather!, { raining: 0.5, avgPathWetness: 0.65, wetnessTrend: 'rising', trackTempTrend: 'falling' }); s.strategy!.tyres!.compound = 'Wet'; }),
  scenario('drying', 'Alternative conditions and incidents', 'Drying · rain ending', s => { Object.assign(s.weather!, { avgPathWetness: 0.3, wetnessTrend: 'falling' }); s.strategy!.forecast = { change: 'dry', chance: 0, atSeconds: 2100, lap: 20 }; }),
  scenario('fcy', 'Alternative conditions and incidents', 'Full course yellow', s => { s.session!.gamePhase = 6; }),
  scenario('paused', 'Alternative conditions and incidents', 'Paused', s => { s.paused = true; s.session!.gamePhase = 9; }),
  scenario('not-recording', 'Alternative conditions and incidents', 'Recording stopped', s => { s.audit = { runId: 'demo', status: 'unavailable' }; }),
  scenario('tyres', 'Alternative conditions and incidents', 'Tread below minimum · sets short', s => { s.strategy!.tyres!.coverage = { target: 'pit', projectedTread: 0.32, setsNeeded: 2, availableSetsCover: false }; s.strategy!.tyres!.newSets = 0; }),
  scenario('tyres-mfd', 'Alternative conditions and incidents', 'Worn tyres · MFD no change', s => {
    s.strategy!.resource!.race!.pitInLaps = 1; s.strategy!.tyres!.coverage = { target: 'pit', projectedTread: 0.32, setsNeeded: 2, availableSetsCover: false };
    s.strategy!.pit!.mfd!.tyres = 'No Change';
  }),
  scenario('damage-body', 'Alternative conditions and incidents', 'Damage · body', s => {
    s.strategy!.damage = { wheel: null, body: 0.4, suspension: 0.1,
      partsDetached: false, impactLap: 9, lapsSinceImpact: 3, paceLossPerLap: 1.2, lossToFinish: 27.6, repairSeconds: 35, significant: true };
  }),
  scenario('damage-flat', 'Alternative conditions and incidents', 'Damage · flat', s => {
    s.strategy!.damage = { wheel: { problem: 'flat', corner: 'FR' }, body: 0.4, suspension: 0.1,
      partsDetached: false, impactLap: 9, lapsSinceImpact: 3, paceLossPerLap: 1.2, lossToFinish: 27.6, repairSeconds: 35, significant: true };
  }),
  scenario('damage-detached', 'Alternative conditions and incidents', 'Damage · detached', s => {
    s.strategy!.damage = { wheel: { problem: 'detached', corner: 'FR' }, body: 0.4, suspension: 0.1,
      partsDetached: true, impactLap: 9, lapsSinceImpact: 3, paceLossPerLap: 1.2, lossToFinish: 27.6, repairSeconds: 35, significant: true };
  }),
  scenario('penalty', 'Alternative conditions and incidents', 'Stop & go · no service', s => { Object.assign(s.strategy!.pit!, { state: 'stopped', penalties: 1, penaltySeconds: 10, serviceSeconds: null, serviceMaxSeconds: null }); }),
  scenario('mfd-missing', 'Alternative conditions and incidents', 'MFD unavailable', s => { s.strategy!.resource!.race!.pitInLaps = 1; s.strategy!.pit!.mfd = null; }),
  scenario('result-dnf', 'Alternative conditions and incidents', 'Result · did not finish', s => {
    s.lifecycle = 'finished'; s.result = demoResult(); s.result.finishStatus = 2;
  }),
  scenario('result-disqualified', 'Alternative conditions and incidents', 'Result · disqualified', s => {
    s.lifecycle = 'finished'; s.result = demoResult(); s.result.finishStatus = 3;
  }),
  scenario('unknown', 'Missing data and failures', 'Unknown · on track', s => { s.session!.kind = 'unknown'; }),
  scenario('unknown-data', 'Missing data and failures', 'Timing, weather and identity unknown', s => { s.weather = null; s.identity = null; s.lapsLeft = null; s.recentLaps = []; s.sessionBest = null; s.strategy = null; }),
  scenario('disconnected', 'Missing data and failures', 'Data lost', () => {}),
  scenario('corners', 'Tentative previews', 'Corner speed · tentative', s => { s.session!.kind = 'practice'; }),
];

export function createDemoState(id: string, carClass: string | null = 'GT3', reserveLaps = 0.5): DemoState {
  const selected = DEMO_SCENARIOS.find(s => s.id === id) ?? DEMO_SCENARIOS.find(s => s.id === 'race')!;
  const snapshot = demoSnapshot();
  snapshot.strategy = demoStrategy();
  const timing = demoTiming();
  selected.apply(snapshot, timing);
  configureDemoClass(snapshot, timing, carClass ?? 'GT3');
  configureDemoSession(snapshot, timing, selected.id === 'sprint' || selected.id === 'garage-sprint', reserveLaps);
  const reference = snapshot.sessionBest?.lapSeconds;
  timing.lapEstimate = !timing.isOutLap && reference != null && timing.deltaSeconds != null ? {
    seconds: Math.round((reference + timing.deltaSeconds) * 1000) / 1000,
    referenceSeconds: reference, deltaSeconds: timing.deltaSeconds, source: 'distance',
  } : null;
  if (selected.id === 'connecting') return { snapshot: null, timing: null, connection: 'connecting' };
  if (selected.id === 'disconnected') return { snapshot, timing: null, connection: 'disconnected' };
  return { snapshot, timing: selected.id === 'unknown-data' ? null : timing, connection: 'live' };
}
