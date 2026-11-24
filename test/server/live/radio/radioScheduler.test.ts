import { describe, expect, it } from 'vitest';
import type { LiveCall } from '../../../../shared/domain/live/radio/liveCalls.js';
import type { LiveRadioCallEvent, LiveRadioOutcome, LiveSnapshot } from '../../../../shared/types/live.js';
import { RadioScheduler, type RadioLogEntry } from '../../../../server/live/radio/radioScheduler.js';
import { liveSession, liveSnapshot } from '../../../helpers/liveSnapshot.js';

/** `hears`: the page says every call at once, reported by the next pedal sample; false, the test reports the outcomes. */
function setup({ clients = true, enabled = true, hears = true } = {}) {
  const page = { connected: clients };
  let reported = 0;
  const log: Array<RadioLogEntry & { id: number }> = [];
  const outcomes = new Map<number, LiveRadioOutcome>();
  const sent: LiveRadioCallEvent[] = [];
  let next: LiveCall | LiveCall[] | null = null;
  const scheduler = new RadioScheduler({
    log: entry => { log.push({ ...entry, id: log.length + 1 }); outcomes.set(log.length, entry.outcome); return log.length; },
    settle: (id, outcome) => { outcomes.set(id, outcome); },
    send: event => { if (page.connected) sent.push(event); return page.connected; },
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
      while (hears && reported < sent.length) { scheduler.observeOutcome(sent[reported].id, 'spoken'); reported += 1; }
      scheduler.observePedal({ t, throttle: flat ? 1 : 0.3, brake: flat ? 0 : 0.8 });
    }
  };
  const line = () => { laps += 1; scheduler.observeSnapshot(snap()); };
  scheduler.observePedal({ t, throttle: 0.3, brake: 0.5 });
  const field = (calls: LiveCall[]) => { scheduler.observeField(calls); };
  return { scheduler, page, log, outcomes, sent, propose, field, drive, line, said: () => sent.map(event => event.text) };
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

  it('proposes once more a call the page could not say, while it still applies', () => {
    const radio = setup({ hears: false });
    radio.propose([call('box', 1), call('last-lap', 3)]);
    // The P1 failed on the page: said again at once, and only once.
    radio.scheduler.observeOutcome(1, 'failed');
    expect(radio.said()).toEqual(['box.', 'box.']);
    radio.scheduler.observeOutcome(3, 'failed');
    expect(radio.said()).toHaveLength(2);
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['box.', 'box.', 'last-lap.']);
    // The P3 was cut by a P1: it takes the next slot.
    radio.scheduler.observeOutcome(2, 'interrupted');
    radio.drive(0.5, false);
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['box.', 'box.', 'last-lap.', 'last-lap.']);
    // A call heard, or one that no longer applies, is left alone.
    radio.scheduler.observeOutcome(4, 'spoken');
    radio.propose(call('gone', 1));
    radio.propose(null);
    radio.scheduler.observeOutcome(5, 'failed');
    expect(radio.said()).toHaveLength(5);
  });

  it('holds a slotted call while the page is still saying one, a P1 never', () => {
    const radio = setup({ hears: false });
    radio.propose([call('a', 2), call('b', 2)]);
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['a.']);
    // The next slot opens while "a" is still being said: "b" would queue on the page and come out in a corner.
    radio.line();
    radio.drive(0.5, false);
    expect(radio.said()).toEqual(['a.']);
    radio.propose([call('a', 2), call('b', 2), call('box', 1)]);
    expect(radio.said()).toEqual(['a.', 'box.']);
    radio.scheduler.observeOutcome(1, 'spoken');
    radio.drive(0.2, false);
    expect(radio.said()).toEqual(['a.', 'box.']);
    radio.scheduler.observeOutcome(3, 'spoken');
    radio.drive(0.3, false);
    expect(radio.said()).toEqual(['a.', 'box.', 'b.']);
    // A page that never answers (closed while speaking) holds the next call 20 s, no longer.
    radio.propose({ ...call('c', 2), waitSeconds: 60 });
    radio.drive(1, false);
    radio.drive(15, true);
    expect(radio.said()).toHaveLength(3);
    radio.drive(5, true);
    radio.drive(1, false);
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['a.', 'box.', 'b.', 'c.']);
  });

  it('gives a call said at once its own time to be said, the others the default', () => {
    const radio = setup();
    const life = (index: number) => Math.round((radio.sent[index].expiresAt - Date.now()) / 1000);
    radio.propose([call('box', 1), { ...call('car-stopped', 1), waitSeconds: 6 }, { ...call('menu', 2), waitSeconds: 60 }]);
    radio.field([{ ...call('traffic', 2), immediate: true, waitSeconds: 3 }]);
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['box.', 'car-stopped.', 'traffic.', 'menu.']);
    // The slotted call's wait is for its slot: once sent it starts at once, on the default.
    expect([0, 1, 2, 3].map(life)).toEqual([30, 6, 3, 15]);
  });

  it('proposes again the calls no page could say, once a page can speak', () => {
    const radio = setup({ clients: false, hears: false });
    radio.propose([call('box', 1), call('menu', 2)]);
    radio.drive(1.2, true);
    expect([...radio.outcomes.values()]).toEqual(['no-client', 'no-client']);
    // A page connects, still locked after a reload: it says so, and the calls wait for its click.
    radio.page.connected = true;
    radio.scheduler.observeListener();
    expect(radio.said()).toEqual(['box.']);
    radio.scheduler.observeOutcome(3, 'locked');
    radio.drive(0.5, false);
    radio.drive(1.2, true);
    expect(radio.said()).toEqual(['box.', 'menu.']);
    radio.scheduler.observeOutcome(4, 'locked');
    radio.drive(3, true);
    expect(radio.said()).toHaveLength(2);
    radio.scheduler.observeListener();
    expect(radio.said()).toEqual(['box.', 'menu.', 'box.']);
    // A call that no longer applies stays unsaid, and one dropped late on the page is not said again.
    radio.scheduler.observeOutcome(5, 'late');
    radio.propose(null);
    radio.scheduler.observeListener();
    radio.drive(0.5, false);
    radio.drive(1.2, true);
    expect(radio.said()).toHaveLength(3);
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
