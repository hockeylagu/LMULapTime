import { describe, expect, it } from 'vitest';
import type { LiveCall } from '../../../../shared/domain/live/radio/liveCalls.js';
import type { LiveRadioCallEvent, LiveRadioOutcome, LiveSnapshot } from '../../../../shared/types/live.js';
import { RadioScheduler, type RadioLogEntry } from '../../../../server/live/radio/radioScheduler.js';
import { liveSession, liveSnapshot } from '../../../helpers/liveSnapshot.js';

function setup({ clients = true, enabled = true } = {}) {
  const log: Array<RadioLogEntry & { id: number }> = [];
  const outcomes = new Map<number, LiveRadioOutcome>();
  const sent: LiveRadioCallEvent[] = [];
  let next: LiveCall | LiveCall[] | null = null;
  const scheduler = new RadioScheduler({
    log: entry => { log.push({ ...entry, id: log.length + 1 }); outcomes.set(log.length, entry.outcome); return log.length; },
    settle: (id, outcome) => { outcomes.set(id, outcome); },
    send: event => { if (clients) sent.push(event); return clients; },
    recordingId: () => 'rec-1',
  }, enabled, () => Array.isArray(next) ? next : next ? [next] : []);
  let laps = 3;
  let t = 100;
  const snap = (run = 'run-1'): LiveSnapshot => ({ ...liveSnapshot(), audit: { runId: run, status: 'recording' }, session: liveSession({ playerLapsCompleted: laps }) });
  const propose = (value: LiveCall | LiveCall[] | null, run?: string) => { next = value; scheduler.observeSnapshot(snap(run)); };
  /** Pedals for `seconds` at 10 Hz: braking or flat out. */
  const drive = (seconds: number, flat: boolean) => {
    for (let index = 0; index < Math.round(seconds * 10); index += 1) {
      t += 0.1;
      scheduler.observePedal({ t, throttle: flat ? 1 : 0.3, brake: flat ? 0 : 0.8 });
    }
  };
  const line = () => { laps += 1; scheduler.observeSnapshot(snap()); };
  scheduler.observePedal({ t, throttle: 0.3, brake: 0.5 });
  const field = (calls: LiveCall[]) => { scheduler.observeField(calls); };
  return { scheduler, log, outcomes, sent, propose, field, drive, line, said: () => sent.map(event => event.text) };
}
const call = (key: string, priority: LiveCall['priority']): LiveCall => ({ key, text: `${key}.`, priority, family: 'strategy' });

describe('radio scheduler', () => {
  it('says a P1 at once and holds a P2 for a straight', () => {
    const radio = setup();
    radio.propose(call('box', 1));
    expect(radio.said()).toEqual(['box.']);
    radio.propose(call('short', 2));
    radio.drive(3, false);
    radio.drive(0.5, true);
    expect(radio.said()).toEqual(['box.']);
    radio.drive(0.7, true);
    expect(radio.said()).toEqual(['box.', 'short.']);
    expect(radio.log.map(entry => [entry.key, entry.lap, entry.recordingId, entry.runId])).toEqual([['box', 4, 'rec-1', 'run-1'], ['short', 4, 'rec-1', 'run-1']]);
    expect([...radio.outcomes.values()]).toEqual(['sent', 'sent']);
  });

  it('opens a slot right at the line for 3 s, one call per slot', () => {
    const radio = setup();
    radio.propose(call('a', 2));
    radio.line();
    radio.drive(0.1, false);
    expect(radio.said()).toEqual(['a.']);
    // The slot is used: the next call waits for the next line, or a straight.
    radio.propose(call('b', 2));
    radio.drive(2, false);
    expect(radio.said()).toEqual(['a.']);
    radio.line();
    radio.drive(0.1, false);
    expect(radio.said()).toEqual(['a.', 'b.']);
    // 3 s after the line the slot is closed.
    radio.drive(3.5, false);
    radio.propose(call('c', 2));
    radio.drive(1, false);
    expect(radio.said()).toEqual(['a.', 'b.']);
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['a.', 'b.', 'c.']);
  });

  it('says several calls one per slot, in order, the next one following the one heard', () => {
    const radio = setup();
    radio.propose([call('box-in-2', 2), call('menu-short', 2), { ...call('deploy', 2), waitSeconds: 30 }]);
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['box-in-2.']);
    radio.drive(0.5, false);
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['box-in-2.', 'menu-short.']);
    // The deployment call waits 30 s at most: no straight in time, it is spent and nothing else is pending.
    radio.drive(31, false);
    expect(radio.outcomes.get(3)).toBe('expired');
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['box-in-2.', 'menu-short.']);
  });

  it('keeps two P3 calls a lap and drops the third', () => {
    const radio = setup();
    for (const key of ['p3-a', 'p3-b', 'p3-c']) {
      radio.propose(call(key, 3));
      radio.drive(1.2, true);
      radio.drive(0.5, false);
    }
    expect(radio.said()).toEqual(['p3-a.', 'p3-b.']);
    expect(radio.outcomes.get(3)).toBe('dropped-budget');
  });

  it('replaces a waiting call with a newer one, and expires one that no longer applies or waited too long', () => {
    const radio = setup();
    radio.propose(call('old', 2));
    radio.propose(call('new', 2));
    expect(radio.outcomes.get(1)).toBe('replaced');
    radio.propose(null);
    expect(radio.outcomes.get(2)).toBe('expired');
    radio.propose(call('slow', 2));
    radio.drive(121, false);
    expect(radio.outcomes.get(3)).toBe('expired');
    expect(radio.said()).toEqual([]);
  });

  it('says a P2/P3 key once a run, lets a P1 come back after a minute, and forgets keys on a new run', () => {
    const radio = setup();
    radio.propose(call('ratio', 2));
    radio.drive(1.2, true);
    radio.propose(null);
    radio.drive(400, false);
    radio.propose(call('ratio', 2));
    radio.drive(1.2, true);
    radio.propose(call('box', 1));
    radio.propose(null);
    radio.drive(30, false);
    radio.propose(call('box', 1));
    radio.propose(null);
    expect(radio.said()).toEqual(['ratio.', 'box.']);
    radio.drive(31, false);
    radio.propose(call('box', 1));
    expect(radio.said()).toEqual(['ratio.', 'box.', 'box.']);
    radio.propose(call('ratio', 2), 'run-2');
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['ratio.', 'box.', 'box.', 'ratio.']);
  });

  it("takes the field's calls with strategy: an immediate call skips the slot, an incident is never repeated", () => {
    const radio = setup();
    radio.propose(call('menu', 2));
    radio.field([{ ...call('traffic', 2), immediate: true }]);
    expect(radio.said()).toEqual(['traffic.']);
    // The strategy call still waits for its slot, untouched.
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['traffic.', 'menu.']);
    const incident: LiveCall = { ...call('stopped', 1), family: 'incident' };
    radio.field([incident]);
    radio.field([]);
    radio.drive(120, false);
    radio.field([incident]);
    expect(radio.said()).toEqual(['traffic.', 'menu.', 'stopped.']);
    // An immediate P3 still counts against the lap's budget.
    radio.field([{ ...call('p3-a', 3), immediate: true }, { ...call('p3-b', 3), immediate: true }, { ...call('p3-c', 3), immediate: true }]);
    expect(radio.said().slice(3)).toEqual(['p3-a.', 'p3-b.']);
    expect(radio.log.map(entry => radio.outcomes.get(entry.id)).at(-1)).toBe('dropped-budget');
    radio.scheduler.setEnabled(false);
    radio.field([{ ...call('late', 1), family: 'incident' }]);
    expect(radio.said()).not.toContain('late.');
  });

  it('logs calls with no page connected as no-client, and proposes nothing with the voice off', () => {
    const radio = setup({ clients: false });
    radio.propose(call('box', 1));
    expect(radio.outcomes.get(1)).toBe('no-client');
    const off = setup({ enabled: false });
    off.propose(call('box', 1));
    expect(off.log).toEqual([]);
    off.scheduler.setEnabled(true);
    off.propose(call('box', 1));
    expect(off.said()).toEqual(['box.']);
  });
});
