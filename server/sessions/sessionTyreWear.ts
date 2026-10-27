import path from 'node:path';
import type { SessionStrategySource } from './sessionStrategy.js';
import type { TyreWearLap, TyreWearProfile, TyreWheelValues } from '../../shared/types/liveStrategy.js';
import { getLiveCaptureIndexRows } from '../core/live/dbLiveCaptureStore.js';
import { learningProjectionInputs } from '../live/learning/inputs.js';
import { openVerifiedLiveRecording } from '../live/capture/recordingValidation.js';
import { liveCaptureChannels, type LiveCaptureChannel } from '../live/capture/channels.js';
import { detectWheelSlipEvents, wheelSlipChannelIndexes, wheelSlipRatios, WHEEL_POSITIONS } from '../../shared/domain/live/wheelSlip.js';
import { fitTyreWear } from '../../shared/domain/strategy/tyreWear.js';
import { NEW_TYRE_RISE } from '../../shared/domain/strategy/sessionStrategy.js';
import { MAX_LAP_WEAR } from '../../shared/domain/live/liveCarCondition.js';
import { resolveVehicle } from '../../shared/domain/vehicleMapping.js';
import { readSessionLapStates } from './sessionStrategy.js';

const directory = () => path.resolve(process.env.LMU_LIVE_CAPTURE_DIR || path.join('server', 'live-captures'));
interface Sample { elapsed_seconds: number; lap_number: number; [key: string]: number | null }

/** Both sources are mandatory. XML-verified scoring anchors select laps by time, never by the raw mLapNumber. */
export async function readTyreWearLaps(sessionDb: SessionStrategySource, sessionId: string, signal?: AbortSignal): Promise<TyreWearLap[] | null> {
  signal?.throwIfAborted();
  const session = sessionDb.getSessionById(sessionId);
  const player = session?.playerDriver ?? session?.drivers.find(driver => driver.isPlayer);
  if (!session || !player) return null;
  const entries = getLiveCaptureIndexRows(sessionDb.getDb()).filter(entry => entry.manifest.sessionId === sessionId);
  const entry = entries.find(item => item.available && item.manifest.normalizationVersion >= 2
    && item.manifest.driverName === player.name
    && learningProjectionInputs(sessionDb.getDb(), item) !== null);
  if (!entry) return null;
  const states = new Map((await readSessionLapStates(sessionDb, sessionId, signal)).map(state => [state.lap, state]));
  signal?.throwIfAborted();
  if (states.size === 0) return null;
  const reader = await openVerifiedLiveRecording(directory(), entry.manifest);
  try {
    const channels = liveCaptureChannels(entry.manifest.normalizationVersion).filter((channel): channel is LiveCaptureChannel & { frame: 'iso8855-wheel' } => channel.frame === 'iso8855-wheel');
    const indexes = wheelSlipChannelIndexes(channels);
    if (!indexes) return null;
    const result: TyreWearLap[] = [];
    for (const lap of player.laps ?? []) {
      signal?.throwIfAborted();
      const exclusions: string[] = [];
      const compounds = [lap.flCompound, lap.frCompound, lap.rlCompound, lap.rrCompound];
      const compound = compounds[0] ?? '';
      if (!compound || compound === 'N/A' || compounds.some(value => value !== compound)) exclusions.push('unknown-or-mixed-compound');
      if (lap.lapTime === null || lap.lapTime <= 0) exclusions.push('no-lap-time');
      if (lap.lapNumber === 1) exclusions.push('start-lap');
      if (lap.isPitStop) exclusions.push('pit-lap');
      if (lap.isOutLap) exclusions.push('out-lap');
      if (lap.conditions) exclusions.push('wet');
      const before = states.get(lap.lapNumber - 1)?.tread;
      const after = states.get(lap.lapNumber)?.tread;
      const loss: TyreWheelValues = [0, 0, 0, 0];
      if (!before || !after || [...before, ...after].some(value => !Number.isFinite(value) || value < 0 || value > 1)) exclusions.push('unknown-tread');
      else {
        for (let i = 0; i < 4; i++) loss[i] = before[i] - after[i];
        if (loss.some(value => value < -NEW_TYRE_RISE)) exclusions.push('new-tyres');
        if (loss.some(value => value > MAX_LAP_WEAR)) exclusions.push('puncture');
      }
      const anchors = entry.manifest.anchors.filter(anchor => anchor.lapNumber === lap.lapNumber);
      const anchor = anchors.length === 1 ? anchors[0] : null;
      const nextAnchor = entry.manifest.anchors.find(item => item.lapNumber === lap.lapNumber + 1);
      // Scoring omits the duration of invalid laps; their next crossing still measures the real wear interval.
      // XML may repeat a previous lap time on these laps, so never shorten the interval to that stale value.
      const start = anchor?.startSeconds;
      const end = nextAnchor?.startSeconds ?? (anchor?.lapSeconds != null ? anchor.startSeconds + anchor.lapSeconds : undefined);
      const slip: TyreWheelValues = [0, 0, 0, 0];
      const captureLapNumbers: number[] = [];
      if (!anchor || start === undefined || end === undefined || end <= start || lap.lapTime === null
        || (anchor.lapSeconds !== null && Math.abs(anchor.lapSeconds - lap.lapTime) > 0.05) || lap.elapsedSeconds == null
        || Math.abs(anchor.startSeconds - lap.elapsedSeconds) > 0.05) exclusions.push('unverified-clock');
      else {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Bound memory to one lap and share the verified read-only handle.
        const rows = await reader.queryAll<Sample>(`SELECT elapsed_seconds, lap_number, ${channels.map(channel => `"${channel.name}"`).join(', ')}
          FROM capture_samples WHERE elapsed_seconds >= ? AND elapsed_seconds < ? ORDER BY sample_index`, [start, end]);
        signal?.throwIfAborted();
        captureLapNumbers.push(...new Set(rows.map(row => row.lap_number)));
        if (rows.length < 2 || rows[0].elapsed_seconds - start > 2 || end - rows[rows.length - 1].elapsed_seconds > 2
          || rows.some((row, i) => i > 0 && (row.elapsed_seconds - rows[i - 1].elapsed_seconds > 2
            || row.elapsed_seconds <= rows[i - 1].elapsed_seconds))) exclusions.push('capture-gap');
        if (rows.some(row => channels.some(channel => row[channel.name] === null || !Number.isFinite(row[channel.name])))) exclusions.push('unknown-slip');
        const samples = rows.map(row => ({ lapSeconds: row.elapsed_seconds - start,
          ratios: wheelSlipRatios(channels.map(channel => row[channel.name]), indexes) }));
        for (const event of detectWheelSlipEvents(samples)) slip[WHEEL_POSITIONS.indexOf(event.wheel)] += event.endLapSeconds - event.startLapSeconds;
      }
      result.push({ sessionId, sessionKind: session.sessionType, gameVersion: session.gameVersion ?? null,
        compound, lapNumber: lap.lapNumber, startSeconds: start, endSeconds: end, captureLapNumbers, loss, slip, exclusions });
    }
    return result;
  } finally { await reader.close(); }
}

/** Newest ten readable sessions of this exact layout, model, driver and dry compound cohort. */
export async function readTyreWearProfile(sessionDb: SessionStrategySource, layoutKey: string, carModel: string,
  compound: string, driverName: string, signal?: AbortSignal): Promise<TyreWearProfile | null> {
  signal?.throwIfAborted();
  const ids = sessionDb.getDb().prepare(`SELECT s.id, s.player_car_type FROM sessions s
    WHERE s.layout_key=? AND EXISTS (SELECT 1 FROM telemetry_metadata t WHERE t.matched_session_id=s.id)
    AND EXISTS (SELECT 1 FROM session_drivers d JOIN drivers n ON n.driver_id=d.driver_id
      WHERE d.session_id=s.id AND d.is_player=1 AND n.name=?) ORDER BY s.timestamp DESC, s.id DESC`)
    .all(layoutKey, driverName) as Array<{ id: string; player_car_type: string }>;
  const laps: TyreWearLap[] = [];
  let sessions = 0;
  for (const row of ids) {
    if ((resolveVehicle(row.player_car_type)?.model ?? row.player_car_type) !== carModel) continue;
    // oxlint-disable-next-line eslint/no-await-in-loop -- Stop at ten usable sessions without opening every native recording.
    const rows = await readTyreWearLaps(sessionDb, row.id, signal);
    const kept = rows?.filter(lap => lap.compound === compound && lap.exclusions.length === 0) ?? [];
    if (!kept.length) continue;
    laps.push(...kept);
    if (++sessions === 10) break;
  }
  return fitTyreWear(laps);
}
