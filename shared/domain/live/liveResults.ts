import type { LiveSessionResult } from '../../types/liveInsights.js';
import type { LiveLapRecord, LiveSessionBest } from '../../types/live.js';
import type { LiveStrategy } from '../../types/liveStrategy.js';
import type { LiveScoringReading, LiveState } from './liveLifecycle.js';

/** Bounded live summary; never resolves a historical session by guessing from a filename. */
export class LiveResultTracker {
  private event: string | null = null;
  private layout: string | null = null;
  private session: string | null = null;
  private et = 0;
  private lastLap: number | null = null;
  private total = 0;
  private count = 0;
  private complete = false;
  private planned: number | null = null;
  private result: LiveSessionResult | null = null;
  private qualifying: LiveSessionResult | null = null;
  private frozen = false;
  private qualifyingSettled = false;

  public update(reading: LiveScoringReading | null, state: LiveState, lap: LiveLapRecord | null, best: LiveSessionBest | null, strategy: LiveStrategy | null, layout: string | null) {
    if (state.lifecycle === 'menu' || state.lifecycle === 'offline') {
      this.layout = null;
      this.event = null; this.session = null; this.result = null; this.qualifying = null; this.frozen = false; this.qualifyingSettled = false;
      return { result: null, qualifyingResult: null };
    }
    const player = reading?.player;
    if (!reading || !player || !state.session) return { result: null, qualifyingResult: null };
    const event = `${reading.trackName}|${player.vehicleName}`;
    if (event !== this.event || (layout !== null && this.layout !== null && layout !== this.layout)) {
      this.event = event; this.layout = null; this.session = null; this.qualifying = null;
    }
    if (layout !== null) this.layout = layout;
    const session = `${reading.sessionCode}|${event}`;
    if (session !== this.session || reading.currentEt < this.et - 1) {
      this.session = session; this.lastLap = null; this.total = 0; this.count = 0; this.planned = null;
      this.complete = player.totalLaps === 0; this.result = null; this.frozen = false; this.qualifyingSettled = false;
      // A fresh qualifying attempt replaces an older result, including a restart.
      if (state.session.kind === 'qualifying' || state.session.kind === 'practice') this.qualifying = null;
    }
    this.et = reading.currentEt;
    if (state.session.kind === 'qualifying' && Number.isFinite(reading.endEt) && reading.endEt > 0 && reading.endEt < 1_000_000
      && reading.currentEt >= reading.endEt && reading.allDriversFinished === true) this.qualifyingSettled = true;
    const done = player.finishStatus > 0 || (state.session.kind !== 'race' && reading.gamePhase === 8);
    // Cooldown laps and pit refills after the flag must not alter the completed race's metrics.
    if (!this.frozen) {
      if (lap && lap.lapNumber !== this.lastLap) {
        this.lastLap = lap.lapNumber;
        if (lap.valid && lap.lapSeconds !== null) { this.total += lap.lapSeconds; this.count++; }
      }
      if (this.complete && player.totalLaps === 0) this.planned ??= strategy?.resource?.perLap ?? strategy?.garage?.perLap ?? null;
      this.result = {
        kind: state.session.kind, trackName: reading.trackName, vehicleName: player.vehicleName,
        classPlace: reading.playerClassPlace ?? null, overallPlace: player.place > 0 ? player.place : null,
        finishStatus: player.finishStatus, bestLap: best?.lapSeconds ?? null,
        cleanAverage: this.count > 0 ? Math.round(this.total / this.count * 1000) / 1000 : null,
        cleanLaps: this.count, completeHistory: this.complete, pitStops: player.pitStops ?? null,
        resourceKind: strategy?.resource?.kind ?? this.result?.resourceKind ?? null,
        resourceRemaining: strategy?.resource?.amount ?? this.result?.resourceRemaining ?? null,
        actualPerLap: strategy?.resource?.perLapSource === 'measured' ? strategy.resource.perLap : this.result?.actualPerLap ?? null,
        plannedPerLap: this.planned, tyreTread: strategy?.tyres?.worst ?? this.result?.tyreTread ?? null,
      };
    }
    if (done && (state.session.kind !== 'qualifying' || player.finishStatus > 0 || this.qualifyingSettled)) this.frozen = true;
    if (done && this.result) this.result = { ...this.result, classPlace: reading.playerClassPlace ?? this.result.classPlace,
      overallPlace: player.place > 0 ? player.place : this.result.overallPlace };
    if (done && state.session.kind === 'qualifying' && this.result) {
      this.result = { ...this.result, settled: this.qualifyingSettled };
      this.qualifying = this.result;
    }
    return { result: done ? this.result : null, qualifyingResult: this.qualifying };
  }
}
