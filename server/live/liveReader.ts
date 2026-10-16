import type { LiveScoringReading } from '../../shared/domain/live/liveLifecycle.js';
import type { LivePedalSample } from '../../shared/types/live.js';
import { readPedalFrame, readScoringFrame } from './rf2Decode.js';
import { SCORING_BUFFER, SCORING_MAPPING_NAME, TELEMETRY, TELEMETRY_BUFFER, TELEMETRY_MAPPING_NAME } from './rf2Layout.js';
import type { MappedBuffer } from './sharedMemory.js';

/** What the reader posts to the main thread. `type` is the field every worker client filters on (isWorkerMessage). */
export type LiveReaderMessage =
  | { type: 'frame'; scoring?: LiveScoringReading; pedal?: LivePedalSample; tyreSurfaceAvgC?: number | null }
  /** LMU is on its main menu (or left it): the buffer still holds the last session, so this decides the menu state. */
  | { type: 'menu'; inMenu: boolean }
  | { type: 'closed' };

/**
 * What LMU's local `navigation/state` says: `gone` (refused), `busy` (too slow to answer, e.g. loading a track),
 * `menu` (its main menu), `session` (anything else).
 */
export type GameProbe = 'gone' | 'busy' | 'menu' | 'session';

export interface LiveReaderDeps {
  openMapping(name: string, size: number): MappedBuffer | null;
  probeGame(): Promise<GameProbe>;
  post(message: LiveReaderMessage): void;
}

const OPEN_RETRY_MS = 3000;
const REALTIME_INTERVAL_MS = 20;
const IDLE_INTERVAL_MS = 1000;
/** Both version counters standing still this long is the cue to ask the game whether it is still there. */
const STILL_MS = 5000;
/**
 * While LMU loads, the mapping exists before its REST port listens, so a refusal then does not mean the game is gone.
 * A refusal counts once the game has answered since the mapping opened, or after this long without any answer
 * (a game that died while loading). Until that first answer the game is asked every 5 s even while the counters move.
 */
export const STARTUP_GRACE_MS = 180_000;

/**
 * Reads the plugin's two buffers: tries to open them every 3 s while the game is not up; once open,
 * reads at about 50 Hz while the driver is in realtime and 1 Hz otherwise. The app's own handle keeps
 * the mapping alive after the game exits, so when the counters have stood still for 5 s it asks the
 * game (one local request, see probeGame) and, if it is gone, unmaps and goes back to the 3 s check.
 * A game still loading has no REST port yet: see STARTUP_GRACE_MS. The same answer says when LMU is on its main
 * menu (the counters stand still there too); the first scoring change after that means a session is back.
 */
export class LiveReader {
  private scoringMap: MappedBuffer | null = null;
  private telemetryMap: MappedBuffer | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private probing = false;
  private lastProbeAt = 0;
  private lastChangeAt = 0;
  private openedAt = 0;
  private gameAnswered = false;
  private inMenu = false;
  private scoringVersion: number | null = null;
  private pedalVersion: number | null = null;
  private telemetryCounter: number | null = null;
  private playerId: number | null = null;
  private slotHint = -1;
  private inRealtime = false;

  public constructor(private readonly deps: LiveReaderDeps) {}

  public start(): void {
    this.stopped = false;
    this.tryOpen();
    // The first answer is always posted, so the server knows the game state before its first file scan.
    if (!this.scoringMap) this.deps.post({ type: 'closed' });
  }

  public stop(): void {
    this.stopped = true;
    this.releaseMappings();
  }

  private schedule(delayMs: number, action: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(action, delayMs);
  }

  private releaseMappings(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.scoringMap?.close();
    this.telemetryMap?.close();
    this.scoringMap = null;
    this.telemetryMap = null;
  }

  private tryOpen(): void {
    if (this.stopped) return;
    const scoring = this.deps.openMapping(SCORING_MAPPING_NAME, SCORING_BUFFER.size);
    const telemetry = scoring ? this.deps.openMapping(TELEMETRY_MAPPING_NAME, TELEMETRY_BUFFER.size) : null;
    if (!scoring || !telemetry) {
      scoring?.close();
      this.schedule(OPEN_RETRY_MS, () => this.tryOpen());
      return;
    }
    this.scoringMap = scoring;
    this.telemetryMap = telemetry;
    this.scoringVersion = null;
    this.pedalVersion = null;
    this.telemetryCounter = null;
    this.playerId = null;
    this.slotHint = -1;
    this.inRealtime = false;
    this.lastChangeAt = Date.now();
    this.lastProbeAt = this.lastChangeAt;
    this.openedAt = this.lastChangeAt;
    this.gameAnswered = false;
    this.inMenu = false;
    this.tick();
  }

  private tick(): void {
    const scoringMap = this.scoringMap;
    const telemetryMap = this.telemetryMap;
    if (this.stopped || !scoringMap || !telemetryMap) return;
    const now = Date.now();
    let changed = false;
    let scoring: LiveScoringReading | undefined;
    let pedal: LivePedalSample | undefined;
    let tyreSurfaceAvgC: number | null | undefined;

    const scoringRead = readScoringFrame(scoringMap, this.scoringVersion);
    if (scoringRead.status !== 'unchanged') changed = true;
    if (scoringRead.status === 'ok') {
      if (this.scoringVersion !== null) this.setMenu(false);
      this.scoringVersion = scoringRead.version;
      scoring = scoringRead.value;
      this.playerId = scoring.player?.id ?? null;
      this.inRealtime = scoring.inRealtime;
    }

    if (this.inRealtime && this.playerId !== null) {
      const pedalRead = readPedalFrame(telemetryMap, this.playerId, this.pedalVersion, this.slotHint);
      if (pedalRead.status !== 'unchanged') changed = true;
      if (pedalRead.status === 'ok') {
        this.pedalVersion = pedalRead.version;
        this.telemetryCounter = pedalRead.version;
        this.slotHint = pedalRead.value.slot;
        pedal = pedalRead.value.sample ?? undefined;
        tyreSurfaceAvgC = pedalRead.value.tyreSurfaceAvgC;
      }
    } else {
      const counter = telemetryMap.readU32(TELEMETRY.versionBegin);
      if (counter !== this.telemetryCounter) changed = true;
      this.telemetryCounter = counter;
    }

    if (scoring || pedal) this.deps.post({ type: 'frame', scoring, pedal, tyreSurfaceAvgC });
    if (changed) this.lastChangeAt = now;
    const still = now - this.lastChangeAt >= STILL_MS;
    if ((still || !this.gameAnswered) && now - this.lastProbeAt >= STILL_MS && !this.probing) this.probe(now);
    this.schedule(this.inRealtime ? REALTIME_INTERVAL_MS : IDLE_INTERVAL_MS, () => this.tick());
  }

  private setMenu(inMenu: boolean): void {
    if (inMenu === this.inMenu) return;
    this.inMenu = inMenu;
    this.deps.post({ type: 'menu', inMenu });
  }

  private probe(now: number): void {
    this.probing = true;
    this.lastProbeAt = now;
    void this.deps.probeGame().then(answer => {
      this.probing = false;
      if (this.stopped || !this.scoringMap) return;
      if (answer === 'menu' || answer === 'session') {
        this.gameAnswered = true;
        this.setMenu(answer === 'menu');
      }
      if (answer !== 'gone') return;
      if (!this.gameAnswered && Date.now() - this.openedAt < STARTUP_GRACE_MS) return;
      this.releaseMappings();
      this.deps.post({ type: 'closed' });
      this.schedule(OPEN_RETRY_MS, () => this.tryOpen());
    }, () => { this.probing = false; });
  }
}
