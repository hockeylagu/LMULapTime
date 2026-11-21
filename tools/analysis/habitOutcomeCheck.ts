import path from 'node:path';
import Database from 'better-sqlite3';
import {
  getAnalysisSession, listAnalysisSessions, listPlayerAnalysisPasses, listReferenceAnalysisPasses,
  type AnalysisPassRow,
} from '../../server/core/replay/dbCornerAnalysisStore.js';
import { getSequenceMap } from '../../server/core/replay/dbSequenceMapStore.js';
import { readSessionCornerAnalysis, type CornerAnalysisReader } from '../../server/corners/cornerAnalysisService.js';
import { layoutPassKey, placeLayout } from '../../server/corners/cornerPassService.js';
import { minTrendPasses } from '../../server/corners/cornerTrends.js';
import { actionDone, BRAKE_SOFTER, habitRule, POINT_GAP_M, SPEED_GAP_KMH } from '../../shared/domain/cornerAnalysis/habitRules.js';
import { isRepresentativeCornerPass, turnUsual } from '../../shared/domain/cornerAnalysis/turnUsual.js';
import { median } from '../../shared/domain/pitStops.js';
import type { SessionCornerAnalysis } from '../../shared/types/corners/cornerAnalysis.js';
import type { GapUnit } from '../../shared/types/corners/habitFocus.js';

// The outcome check of the corner analysis engine, read only. For every habit the engine names in one of the player's
// sessions, it reads the same turn in their next session at the layout in the same car: when the habit's gap to the
// target closed, did the turn get quicker? A measure may headline a habit only when it passes here
// (shared/domain/cornerAnalysis/habitRules.ts): the turn's cost went down in at least 65% of the closed cases and in at
// most 40% of the widened ones, with 15 cases or more on each side. The action to try under a habit is checked the same
// way, to see and not to pass: an action is offered as a try, and the next session says whether it worked.
// Usage: tsx --env-file-if-exists=.env.local tools/analysis/habitOutcomeCheck.ts [path/to/lmu_cache.db]
const dbPath = path.resolve(process.argv[2] ?? path.join('server', 'lmu_cache.db'));
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const reader: CornerAnalysisReader = {
  getAnalysisSession: sessionId => getAnalysisSession(db, sessionId),
  listAnalysisSessions: (layoutKey, carClass) => listAnalysisSessions(db, layoutKey, carClass),
  getSequenceMap: (layoutKey, carClass) => getSequenceMap(db, layoutKey, carClass),
  listPlayerAnalysisPasses: scope => listPlayerAnalysisPasses(db, scope),
  listReferenceAnalysisPasses: (scope, minLaps) => listReferenceAnalysisPasses(db, scope, minLaps),
  // Pins move the focus, never the habits.
  listHabitFocusPins: () => [],
};

/** A gap that moved by this much moved: the smallest gap its rule tells. */
const STEP: Record<GapUnit, number> = { 'km/h': SPEED_GAP_KMH, m: POINT_GAP_M, points: BRAKE_SOFTER * 100 };
const MIN_CASES = 15, CLOSED_DOWN = 65, WIDER_DOWN = 40;

interface Analysed { analysis: SessionCornerAnalysis; cost: Map<number, number> }
interface Move { closed: boolean; wider: boolean; costChangeSec: number }
const moves = new Map<string, Move[]>();
const note = (key: string, move: Move) => { moves.set(key, [...(moves.get(key) ?? []), move]); };

const started = Date.now();
let analysedSessions = 0;
const scopes = db.prepare(`SELECT DISTINCT s.layout_key layoutKey, d.driver_class carClass FROM sessions s
  JOIN session_drivers d ON d.session_id = s.id AND d.is_player = 1`).all() as Array<{ layoutKey: string; carClass: string }>;
for (const { layoutKey, carClass } of scopes) {
  const sessions = reader.listAnalysisSessions(layoutKey, carClass);
  const layout = sessions.length > 1 ? placeLayout(layoutKey) : null;
  if (!layout) continue;
  const scope = { layoutKey, carClass, buildPrefix: layoutPassKey(layout) };
  const players = reader.listPlayerAnalysisPasses({ ...scope, sessionIds: sessions.map(session => session.sessionId) });
  const candidates = reader.listReferenceAnalysisPasses(scope, minTrendPasses(layout.lengthM));
  /** A driver's usual time through each turn (s). */
  const usualSecs = (rows: readonly AnalysisPassRow[], sessionId: string, driverOrdinal: number) => new Map(layout.turns.flatMap(turn => {
    const usual = turnUsual(rows.filter(row => row.sessionId === sessionId && row.driverOrdinal === driverOrdinal && row.pass.segment === turn.id)
      .map(row => row.pass).filter(isRepresentativeCornerPass), layout.lengthM);
    return usual ? [[turn.id, usual.sec] as const] : [];
  }));
  // The class's sessions at the layout, oldest first: habit history spans cars in the same class.
  const history: Analysed[] = [];
  for (const session of sessions) {
    // The goal is not checked here: no benchmark target is read.
    const analysis = readSessionCornerAnalysis(reader, session.sessionId, () => null);
    if (!analysis?.target) continue;
    analysedSessions++;
    const own = usualSecs(players, session.sessionId, session.driverOrdinal);
    const target = usualSecs(candidates, analysis.target.sessionId, analysis.target.driverOrdinal);
    const cost = new Map([...own].flatMap(([turnId, sec]) => (target.has(turnId) ? [[turnId, sec - (target.get(turnId) ?? 0)] as const] : [])));
    history.push({ analysis, cost });
  }
  for (let index = 0; index + 1 < history.length; index++) {
    const then = history[index], next = history[index + 1];
    const measuresOf = (session: Analysed, turnId: number) => session.analysis.measures.find(measures => measures.turnId === turnId);
    const seen = new Set<string>();
    for (const habit of then.analysis.habits) {
      const before = measuresOf(then, habit.turnId), after = measuresOf(next, habit.turnId);
      const costThen = then.cost.get(habit.turnId), costNext = next.cost.get(habit.turnId);
      if (habit.rule === null || seen.has(`${habit.turnId}|${habit.rule}`) || !before || !after || costThen === undefined || costNext === undefined) continue;
      seen.add(`${habit.turnId}|${habit.rule}`);
      const costChangeSec = costNext - costThen;
      const gapThen = before.rules[habit.rule], gapNext = after.rules[habit.rule], step = STEP[habitRule(habit.rule).unit];
      if (gapThen !== null && gapNext !== null) note(`habit   ${habit.rule}`, { closed: gapThen - gapNext >= step, wider: gapNext - gapThen >= step, costChangeSec });
      const action = habit.action?.type;
      const tryThen = action ? before.actions[action] : null, tryNext = action ? after.actions[action] : null;
      if (action && tryThen !== null && tryNext !== null) {
        note(`action  ${action}`, { closed: actionDone(action, tryThen, tryNext) !== null, wider: actionDone(action, tryNext, tryThen) !== null, costChangeSec });
      }
    }
  }
}
db.close();

const signed = (value: number | null) => (value === null ? '    –' : `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`);
console.log(`${analysedSessions} analysed sessions with a target, ${((Date.now() - started) / 1000).toFixed(0)} s`);
console.log('measure                  pairs | gap closed: n, cost down, median | gap wider: n, cost down, median | verdict');
for (const [key, rows] of [...moves].sort((a, b) => a[0].localeCompare(b[0]))) {
  const cell = (set: Move[]) => {
    const down = set.length ? Math.round(100 * set.filter(row => row.costChangeSec < 0).length / set.length) : null;
    return { down, text: `${String(set.length).padStart(4)}, ${down === null ? '  –' : `${String(down).padStart(3)}%`}, ${signed(median(set.map(row => row.costChangeSec)))} s` };
  };
  const closed = cell(rows.filter(row => row.closed)), wider = cell(rows.filter(row => row.wider));
  const enough = rows.filter(row => row.closed).length >= MIN_CASES && rows.filter(row => row.wider).length >= MIN_CASES;
  const verdict = !enough || closed.down === null || wider.down === null ? 'too few'
    : closed.down >= CLOSED_DOWN && wider.down <= WIDER_DOWN ? 'PASS' : closed.down - wider.down >= 15 ? 'weak' : 'no link';
  console.log(`${key.padEnd(24)} ${String(rows.length).padStart(5)} | ${closed.text.padEnd(24)} | ${wider.text.padEnd(24)} | ${verdict}`);
}
