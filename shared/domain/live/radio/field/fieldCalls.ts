import type { LiveSessionKind, LiveSnapshot } from '../../../../types/live.js';
import type { LiveFieldReading, LivePrivateSessions } from '../../../../types/liveField.js';
import type { LiveCall } from '../liveCalls.js';
import { racePlanMode } from '../racePlanMode.js';
import { FieldTrack, type PitLaneEnds } from './fieldTrack.js';
import { IncidentWatch, type TurnNamer } from './incidentCalls.js';
import { rejoinText } from './rejoinCall.js';
import { TrafficWatch } from './trafficCalls.js';

/** rF2 game phase: green flag. Formation, countdown and pause speeds would spoil the field's speed profile. */
const GREEN_PHASE = 5;

/** What the field calls read besides the cars: the snapshot (session, run, strategy), the turns and the pit lane loss. */
export interface FieldContext {
  snapshot: LiveSnapshot | null;
  turnAt: TurnNamer;
  /** The stored pit lane loss for the layout and class; null when none is measured. */
  pitLaneSeconds: number | null;
  /** The event's private qualifying and practice (`GET /rest/sessions`); null until read. */
  privateSessions?: LivePrivateSessions | null;
  /** The layout's pit lane ends from the track package; null without one. */
  pitLane?: PitLaneEnds | null;
}

/**
 * A private session: every car in the scoring data, none on the player's track (Sebring 2026-11-22: six false
 * incident calls in private qualifying). Qualifying not yet known to be public counts as private.
 */
function alone(kind: LiveSessionKind, sessions: LivePrivateSessions | null): boolean {
  if (kind === 'qualifying') return sessions?.qualifying ?? true;
  return kind === 'practice' && sessions?.practice === true;
}

/**
 * The calls from the whole field, read at the scoring rate (plan steps 3 and 4): incidents ahead and the game's
 * sector yellows, multiclass traffic, and where the player rejoins after the stop. Incident calls speak on the race's
 * first lap too; traffic does not. Only on a green track while driving in realtime, and never in a private session.
 */
export class FieldWatch {
  private readonly track = new FieldTrack();
  private readonly incidents = new IncidentWatch();
  private readonly traffic = new TrafficWatch();
  private run: string | null = null;

  public observe(t: number, trackLength: number, gamePhase: number, field: LiveFieldReading, context: FieldContext): LiveCall[] {
    const snapshot = context.snapshot;
    const session = snapshot?.session;
    const run = session ? `${snapshot.audit?.runId ?? ''}|${session.sessionCode}` : null;
    if (run !== this.run) {
      this.run = run;
      this.track.observe(t, 0, []);
      this.incidents.reset();
      this.traffic.reset();
    }
    if (!snapshot || !session || gamePhase !== GREEN_PHASE || !session.inRealtime || trackLength <= 0) return [];
    this.track.pitLane = context.pitLane ?? null;
    this.track.observe(t, trackLength, field.cars);
    if (snapshot.lifecycle !== 'driving' || alone(session.kind, context.privateSessions ?? null)) return [];
    const key = (event: string) => [snapshot.identity?.layoutKey, session.sessionCode, snapshot.audit?.runId, event].join('|');
    const calls = this.incidents.calls(this.track, field.sectorFlags, context.turnAt, key);
    if (!(session.kind === 'race' && session.playerLapsCompleted === 0)) calls.push(...this.traffic.calls(this.track, key));
    const rejoin = this.rejoin(snapshot, context.pitLaneSeconds);
    if (rejoin) calls.push({ key: key(rejoin.event), text: rejoin.text, priority: 2, family: 'strategy', waitSeconds: 60 });
    return calls;
  }

  /** On the box lap of a race: where the player comes out, once per stop; needs the lane loss and the service time. */
  private rejoin(snapshot: LiveSnapshot, pitLaneSeconds: number | null): { event: string; text: string } | null {
    const strategy = snapshot.strategy;
    const race = strategy?.resource?.race;
    const service = strategy?.pit?.plannedServiceSeconds ?? strategy?.pit?.serviceSeconds ?? null;
    if (snapshot.session?.kind !== 'race' || !strategy || race?.pitInLaps !== 0 || racePlanMode(strategy) !== 'pit'
      || pitLaneSeconds === null || service === null) return null;
    const text = rejoinText(this.track, pitLaneSeconds + service);
    return text ? { event: `rejoin-${race.stopsAfterNext ?? 0}`, text } : null;
  }
}
