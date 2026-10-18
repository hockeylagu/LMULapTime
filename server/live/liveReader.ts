import type { LiveCarReading } from '../../shared/domain/live/liveCarCondition.js';
import type { LiveScoringReading } from '../../shared/domain/live/liveLifecycle.js';
import type { LivePedalSample } from '../../shared/types/live.js';
import type { LiveCaptureSample } from '../../shared/types/liveCapture.js';
import { readPedalFrame, readScoringFrame } from './rf2Decode.js';
import { SCORING_BUFFER, SCORING_MAPPING_NAME, TELEMETRY_BUFFER, TELEMETRY_MAPPING_NAME } from './rf2Layout.js';
import type { MappedBuffer } from './sharedMemory.js';
import type { GameProcessProbe } from './gameProcess.js';
import type { DiagnosticEvent } from './capture/diagnostics.js';

/** What the reader posts to the main thread. `type` is the field every worker client filters on (isWorkerMessage). */
export type LiveReaderMessage =
  | { type: 'diagnostic'; event: DiagnosticEvent }
  | { type: 'process'; running: boolean | null }
  /** `car` (fuel, damage flags, compound) rides along at most every CAR_POST_MS. */
  | { type: 'frame'; scoring?: LiveScoringReading; pedal?: LivePedalSample; tyreSurfaceAvgC?: number | null; car?: LiveCarReading; capture?: LiveCaptureSample | null }
  /**
   * What LMU's navigation says when it changes: its main menu (the buffer still holds the last session, so this
   * decides the menu state), loading a session (with its progress 0..1 when known), a session, or a replay playing
   * (its frames are not live driving).
   */
  | { type: 'navigation'; screen: GameScreen; loadingProgress: number | null }
  | { type: 'closed' };

export type GameScreen = 'menu' | 'loading' | 'session' | 'replay';

/**
 * What LMU's local `navigation/state` says: `gone` (refused), `busy` (too slow to answer, e.g. loading a track),
 * `menu` (its main menu), `replay` (a replay playing), `session` (anything else), or a session loading with its
 * progress (0..1, null unknown).
 */
export type GameProbe = 'gone' | 'busy' | 'menu' | 'session' | 'replay' | { loading: number | null };

export interface LiveReaderDeps {
  process?: GameProcessProbe;
  capture?: boolean;
  openMapping(name: string, size: number): MappedBuffer | null;
  probeGame(): Promise<GameProbe>;
  post(message: LiveReaderMessage): void;
}

const OPEN_RETRY_MS = 3000;
export const PROCESS_POLL_MS = 500;
const REALTIME_INTERVAL_MS = 20;
const IDLE_INTERVAL_MS = 1000;
/** The car reading goes out at most this often: fuel and damage need no more. */
export const CAR_POST_MS = 500;
/** The game is asked this often what it shows (one local `navigation/state`, its cheapest read). */
export const PROBE_MS = 2000;
/** While LMU loads a session, or after a cue in the buffer, it is asked this soon (never more than once a second). */
export const CUE_PROBE_MS = 1000;
/** The session clock going back more than this is a cue: a replay starting, or one rewound. */
const CLOCK_BACK_SECONDS = 1;
/**
 * While LMU loads, the mapping exists before its REST port listens, so a refusal then does not mean the game is gone.
 * A refusal counts once the game has answered since the mapping opened, or after this long without any answer
 * (a game that died while loading).
 */
export const STARTUP_GRACE_MS = 180_000;

/**
 * Reads the plugin's two buffers: tries to open them every 3 s while the game is not up; once open,
 * reads at about 50 Hz while the driver is in realtime and 1 Hz otherwise. Every 2 s it asks the game what it
 * shows (one local request, see probeGame): the buffer alone keeps the last session after the driver quits to
 * the menu, shows a replay's frames as if they were driving, and the app's own handle keeps the mapping alive
 * after the game exits. The Windows process is checked every 500 ms independently of the buffers; a known
 * running process overrides REST refusals. Without process detection, REST and STARTUP_GRACE_MS remain the
 * exit fallback. While LMU loads a session it is asked every second for the progress.
 * A jump in the buffer (another session or track, the clock going back, any write on the menu) is a cue: the
 * game is asked within a second and the frames wait for its answer, so a replay's first frames or the last
 * write LMU makes as it exits never count as a session.
 */
export class LiveReader {
  private scoringMap: MappedBuffer | null = null;
  private telemetryMap: MappedBuffer | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private processTimer: NodeJS.Timeout | null = null;
  private processRunning: boolean | null = null;
  private probing = false;
  private lastProbeAt = 0;
  private lastCarAt = 0;
  private openedAt = 0;
  private gameAnswered = false;
  /** A cue in the buffer: the game is asked within a second, and frames wait for its answer. */
  private cue = false;
  private captureConfirmed = false;
  private lastScoring: LiveScoringReading | null = null;
  private screen: GameScreen = 'session';
  private loadingProgress: number | null = null;
  private scoringVersion: number | null = null;
  private pedalVersion: number | null = null;
  private playerId: number | null = null;
  private slotHint = -1;
  private inRealtime = false;

  public constructor(private readonly deps: LiveReaderDeps) {}

  public start(): void {
    this.stopped = false;
    this.pollProcess();
    this.tryOpen();
    // The first answer is always posted, so the server knows the game state before its first file scan.
    if (!this.scoringMap && this.processRunning !== false) this.deps.post({ type: 'closed' });
  }

  public stop(): void {
    this.stopped = true;
    if (this.processTimer) clearTimeout(this.processTimer);
    this.processTimer = null;
    this.deps.process?.close();
    this.releaseMappings();
  }

  private pollProcess(): void {
    if (!this.deps.process || this.stopped) return;
    const running = this.deps.process.read();
    const changed = running !== this.processRunning;
    this.processRunning = running;
    // Always publish the first result, including an unavailable detector.
    if (changed || this.processTimer === null) this.deps.post({ type: 'process', running });
    if (changed && running === false) {
      this.releaseMappings();
      this.deps.post({ type: 'closed' });
    } else if (running === true && !this.scoringMap) {
      this.tryOpen();
    }
    this.processTimer = setTimeout(() => this.pollProcess(), PROCESS_POLL_MS);
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
    if (this.stopped || this.scoringMap) return;
    if (this.processRunning === false) {
      this.schedule(OPEN_RETRY_MS, () => this.tryOpen());
      return;
    }
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
    this.playerId = null;
    this.slotHint = -1;
    this.inRealtime = false;
    this.lastProbeAt = Date.now();
    this.openedAt = this.lastProbeAt;
    this.gameAnswered = false;
    this.captureConfirmed = false;
    this.cue = false;
    this.lastScoring = null;
    this.screen = 'session';
    this.loadingProgress = null;
    this.tick();
  }

  private tick(): void {
    const scoringMap = this.scoringMap;
    const telemetryMap = this.telemetryMap;
    if (this.stopped || !scoringMap || !telemetryMap) return;
    const now = Date.now();
    let scoring: LiveScoringReading | undefined;
    let pedal: LivePedalSample | undefined;
    let tyreSurfaceAvgC: number | null | undefined;
    let car: LiveCarReading | undefined;
    let capture: LiveCaptureSample | null | undefined;

    const scoringRead = readScoringFrame(scoringMap, this.scoringVersion);
    if (scoringRead.status === 'ok') {
      if (this.isCue(scoringRead.value)) { this.cue = true; this.captureConfirmed = false; }
      this.scoringVersion = scoringRead.version;
      scoring = scoringRead.value;
      this.lastScoring = scoring;
      this.playerId = scoring.player?.id ?? null;
      this.inRealtime = scoring.inRealtime;
    }

    if (this.inRealtime && this.playerId !== null) {
      const pedalRead = readPedalFrame(telemetryMap, this.playerId, this.pedalVersion, this.slotHint, this.deps.capture);
      if (pedalRead.status === 'ok') {
        this.pedalVersion = pedalRead.version;
        this.slotHint = pedalRead.value.slot;
        pedal = pedalRead.value.sample ?? undefined;
        capture = pedalRead.value.capture;
        tyreSurfaceAvgC = pedalRead.value.tyreSurfaceAvgC;
        if (pedalRead.value.car && now - this.lastCarAt >= CAR_POST_MS) {
          car = pedalRead.value.car;
          this.lastCarAt = now;
        }
      }
    }

    // While a cue waits for the game's answer nothing goes out: the frames may be a replay's, or the last session
    // LMU writes again as it exits. The first scoring change after the answer carries the current reading.
    if (!this.cue && (!this.deps.capture || this.captureConfirmed) && (scoring || pedal || car)) this.deps.post({ type: 'frame', scoring, pedal, tyreSurfaceAvgC, car,
      ...(this.deps.capture ? { capture: this.captureConfirmed ? capture : null } : {}) });
    const asking = this.screen === 'loading' || this.cue;
    if (now - this.lastProbeAt >= (asking ? CUE_PROBE_MS : PROBE_MS) && !this.probing) this.probe(now);
    this.schedule(this.inRealtime ? REALTIME_INTERVAL_MS : IDLE_INTERVAL_MS, () => this.tick());
  }

  /** Any write on the menu, or a reading that is not the next one of the same session. */
  private isCue(scoring: LiveScoringReading): boolean {
    const last = this.lastScoring;
    if (!last) return false;
    if (this.screen === 'menu') return true;
    return scoring.sessionCode !== last.sessionCode || scoring.trackName !== last.trackName
      || scoring.currentEt < last.currentEt - CLOCK_BACK_SECONDS;
  }

  private setScreen(screen: GameScreen, loadingProgress: number | null): void {
    if (screen === this.screen && loadingProgress === this.loadingProgress) return;
    this.screen = screen;
    this.loadingProgress = loadingProgress;
    this.deps.post({ type: 'navigation', screen, loadingProgress });
  }

  private probe(now: number): void {
    this.probing = true;
    this.lastProbeAt = now;
    // Any answer clears the cue it was asked for: a game too busy to answer must not hold the frames for good.
    const answering = this.cue;
    const mapping = this.scoringMap;
    const settle = (): void => {
      this.probing = false;
      if (answering && this.scoringMap === mapping) this.cue = false;
    };
    void this.deps.probeGame().then(answer => {
      settle();
      if (this.stopped || !this.scoringMap || this.scoringMap !== mapping) return;
      this.captureConfirmed = answer === 'session';
      if (typeof answer === 'object') {
        this.gameAnswered = true;
        // The last seconds of a load have no progress: the last one known stays on screen.
        this.setScreen('loading', answer.loading ?? (this.screen === 'loading' ? this.loadingProgress : null));
      } else if (answer === 'menu' || answer === 'session' || answer === 'replay') {
        this.gameAnswered = true;
        this.setScreen(answer, null);
      }
      if (answer !== 'gone') return;
      if (this.processRunning === true) return;
      if (!this.gameAnswered && Date.now() - this.openedAt < STARTUP_GRACE_MS) return;
      this.releaseMappings();
      this.deps.post({ type: 'closed' });
      this.schedule(OPEN_RETRY_MS, () => this.tryOpen());
    }, () => { this.captureConfirmed = false; settle(); });
  }
}
