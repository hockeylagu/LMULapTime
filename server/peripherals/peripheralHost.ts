import type { SessionDatabase } from '../core/db.js';
import type { LiveSnapshot } from '../../shared/types/live.js';
import type { DeviceCatalog, LoadedPeripheralPresets, MappingData, PeripheralCar, PeripheralDevice, PeripheralSettings, PeripheralStatus, PeripheralTarget } from '../../shared/types/peripherals/peripherals.js';
import { PeripheralStore } from '../core/peripherals/peripheralStore.js';
import { loadPeripheralSettings, savePeripheralSettings } from './peripheralSettings.js';
import { loadPeripheralPlugin, REGISTERED_PERIPHERALS } from './pluginRegistry.js';
import type { PluginLoad } from './pluginRegistry.js';
import { loadedCar, SessionLoadDetector } from './sessionLoadDetector.js';
import { runPresetSwitch } from './presetSwitchRunner.js';
import { MAPPING_CARS } from '../../shared/domain/peripherals/suggestMappings.js';
import { resolvePresetTarget } from '../../shared/domain/peripherals/presetMapping.js';
import { peripheralStatusMessage } from '../../shared/domain/peripherals/peripheralStatus.js';

export const HEALTH_CHECK_INTERVAL_MS = 15_000;
export const HEALTH_CHECK_ERROR_INTERVAL_MS = 5_000;

export class PeripheralError extends Error {
  public constructor(message: string, public readonly status = 409) { super(message); }
}
export interface PeripheralLiveSource {
  getSnapshot(): LiveSnapshot;
  events: { on(event: 'snapshot', listener: (snapshot: LiveSnapshot) => void): () => void };
}
export class PeripheralHost {
  public readonly store: PeripheralStore;
  private settings: PeripheralSettings;
  private load: PluginLoad = { install: 'not-installed', plugin: null, error: null };
  private readonly detector = new SessionLoadDetector();
  private snapshot: LiveSnapshot;
  private health: PeripheralStatus['health'] = null;
  private observedAt: number | null = null;
  private devices: PeripheralDevice[] = [];
  private lastRun: PeripheralStatus['lastRun'] = null;
  private operation: AbortController | null = null;
  /** The lifecycle the running operation started in; a change of it (or of the garage load) cancels the operation. */
  private operationLifecycle: LiveSnapshot['lifecycle'] | null = null;
  private healthController: AbortController | null = null;
  private healthRequest: Promise<void> | null = null;
  private refreshController: AbortController | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private lifecycleGeneration = 0;
  private unsubscribe: (() => void) | null = null;
  private nextHealthAt = 0;

  public constructor(private readonly db: SessionDatabase, private readonly live: PeripheralLiveSource,
    private readonly loader: () => Promise<PluginLoad> = () => loadPeripheralPlugin(REGISTERED_PERIPHERALS[0]), private readonly now = Date.now) {
    this.store = new PeripheralStore(db.getDb());
    this.settings = loadPeripheralSettings(db);
    this.snapshot = live.getSnapshot();
  }
  public async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    const generation = ++this.lifecycleGeneration;
    // Load before observing the initial garage so package loading cannot consume its hook.
    let loaded: PluginLoad;
    try { loaded = await this.loader(); }
    catch (error) { loaded = { install: 'load-failed', plugin: null, error: String(error) }; }
    if (this.stopped || generation !== this.lifecycleGeneration) return;
    this.load = loaded;
    this.unsubscribe = this.live.events.on('snapshot', this.onSnapshot);
    this.onSnapshot(this.live.getSnapshot());
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref();
  }
  public stop(): void {
    this.stopped = true;
    this.lifecycleGeneration++;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.operation?.abort();
    this.healthController?.abort();
    this.refreshController?.abort();
  }
  private readonly onSnapshot = (snapshot: LiveSnapshot): void => {
    const previousSnapshot = this.snapshot;
    const previousKey = this.detector.key;
    const previousPhase = this.detector.phase;
    this.snapshot = snapshot;
    const previous = this.detector.generation;
    this.detector.update(snapshot, this.now());
    if (previousPhase === 'pending' && (previous !== this.detector.generation || this.detector.phase === 'handled')) {
      const reason = previous !== this.detector.generation ? 'Session load changed before preset selection.'
        : loadedCar(previousSnapshot) ? 'Left the garage before preset selection.' : 'Left the garage before the car could be identified.';
      this.recordSkippedLoad(previousKey, previousSnapshot, reason);
    }
    // An Apply from the menu or with the game closed is not tied to a load: only leaving its lifecycle cancels it.
    const started = this.operationLifecycle;
    if (started !== null && (snapshot.lifecycle !== started || (started === 'garage' && previous !== this.detector.generation))) this.operation?.abort();
    this.tick();
  };
  private hasHealthWarning(): boolean {
    return peripheralStatusMessage(this.status()).warning;
  }
  private tick(): void {
    if (this.stopped) return;
    if (this.settings.enabled && this.load.plugin && this.now() >= this.nextHealthAt && !this.healthController) {
      const interval = this.hasHealthWarning() ? HEALTH_CHECK_ERROR_INTERVAL_MS : HEALTH_CHECK_INTERVAL_MS;
      this.nextHealthAt = this.now() + interval;
      void this.checkHealth();
    }
    if (!this.detector.ready(this.now()) || this.operation) return;
    const skipReason = !this.settings.enabled ? 'Plugin is disabled.' : !this.settings.automatic ? 'Automatic switching is disabled.'
      : !this.load.plugin ? 'Simagic plugin is unavailable.' : !this.settings.wheel ? 'No wheel selected.' : null;
    if (skipReason) {
      this.detector.consume(skipReason);
      this.recordSkippedLoad(this.detector.key, this.snapshot, skipReason);
      return;
    }
    const car = loadedCar(this.snapshot);
    if (car) void this.execute(car, false).catch(error => { this.load.error = error instanceof Error ? error.message : 'Peripheral switch failed.'; });
  }
  public status(): PeripheralStatus {
    const car = loadedCar(this.snapshot);
    return { id: 'simagic', label: this.load.plugin?.label ?? 'Simagic (SimPro)', install: this.load.install, error: this.load.error,
      settings: this.settings, health: this.health, observedAt: this.observedAt, devices: this.devices,
      lastRun: this.lastRun, car, target: this.resolvedTarget(car),
      currentLoad: { key: this.detector.key, generation: this.detector.generation, phase: this.detector.phase, skipReason: this.detector.skipReason },
      busy: this.operation !== null, applyBlockedReason: this.applyBlockedReason() };
  }
  private resolvedTarget(car: PeripheralCar | null): PeripheralTarget | null {
    const device = this.settings.wheel;
    if (!device) return null;
    const mapping = car ? resolvePresetTarget(this.store.listMappings(), car) : null;
    const preset = mapping ? this.store.catalog({ productUuid: mapping.productUuid, deviceUuid: mapping.deviceUuid, name: device.name })
      .presets.find(item => item.presetUuid === mapping.presetUuid) : null;
    const compatible = mapping?.productUuid === device.productUuid && mapping.deviceUuid === device.deviceUuid;
    return { device, presetUuid: mapping?.presetUuid ?? null, presetName: preset?.name ?? null,
      source: mapping?.scopeKind ?? null, state: !car ? 'waiting' : !mapping ? 'unmapped' : compatible && preset?.available ? 'mapped' : 'broken' };
  }
  private recordSkippedLoad(loadKey: string, snapshot: LiveSnapshot, reason: string): void {
    const car = loadedCar(snapshot) ?? { model: null, carClass: snapshot.identity?.carClass ?? snapshot.session?.vehicleClass ?? null };
    this.lastRun = { loadKey, car, startedAt: this.now(), skipReason: reason,
      ...(this.settings.wheel ? { wheel: { outcome: 'skipped' as const, message: reason } } : {}) };
  }
  public requirePlugin() {
    if (!this.settings.enabled || !this.load.plugin || this.stopped) throw new PeripheralError('Enable an installed, compatible Simagic plugin first.');
    return this.load.plugin;
  }
  public async configure(settings: PeripheralSettings): Promise<void> {
    if (settings.enabled && !this.load.plugin) throw new PeripheralError('Simagic plugin is not available.');
    this.operation?.abort();
    this.healthController?.abort();
    this.refreshController?.abort();
    this.settings = settings;
    savePeripheralSettings(this.db, settings);
    if (settings.enabled) {
      await this.checkHealth();
      if (this.catalog()?.refreshedAt === null) await this.refreshCatalog();
    }
  }
  /** The selected wheel's presets; null while no wheel is selected. */
  public catalog(): DeviceCatalog | null {
    return this.settings.wheel ? this.store.catalog(this.settings.wheel) : null;
  }
  public mappings(): MappingData {
    const catalog = this.catalog();
    return { cars: MAPPING_CARS, mappings: this.store.listMappings().map(row => {
      const sameDevice = catalog?.device.productUuid === row.productUuid && catalog.device.deviceUuid === row.deviceUuid;
      return { ...row, broken: !sameDevice || !catalog.presets.some(preset => preset.presetUuid === row.presetUuid && preset.available) };
    }) };
  }
  public async listDevices(): Promise<PeripheralDevice[]> {
    const plugin = this.requirePlugin();
    const result = await plugin.listDevices(AbortSignal.timeout(5000));
    if (!result.ok) throw new PeripheralError(result.error, 502);
    this.devices = result.devices;
    return result.devices;
  }
  public async refreshCatalog(): Promise<DeviceCatalog | null> {
    const plugin = this.requirePlugin();
    if (this.refreshController) throw new PeripheralError('A preset refresh is already running.');
    const controller = new AbortController();
    this.refreshController = controller;
    try {
      const selected = this.settings.wheel;
      if (!selected) return null;
      const device: PeripheralDevice = { ...selected, role: 'wheel', firmware: null };
      try {
        const result = await plugin.listPresets(device, AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
        if (!controller.signal.aborted) {
          if (result.ok) this.store.replaceCatalog(device, result.presets, this.now());
          else this.store.recordRefreshError(device, result.error);
        }
      } catch (error) { if (!controller.signal.aborted) this.store.recordRefreshError(device, String(error)); }
      return this.catalog();
    } finally { if (this.refreshController === controller) this.refreshController = null; }
  }
  /** Reads every connected base and wheel, including profiles without LMU tags. Never selects or caches presets. */
  public async loadedPresets(): Promise<LoadedPeripheralPresets> {
    const plugin = this.requirePlugin();
    const signal = AbortSignal.timeout(5000);
    const connected = await plugin.listDevices(signal);
    if (!connected.ok) throw new PeripheralError(connected.error, 502);
    const devices = await Promise.all(connected.devices.map(async device => {
      try {
        const result = await plugin.listPresets(device, signal);
        if (!result.ok) return { device, preset: null, error: result.error };
        const active = result.presets.filter(preset => preset.active);
        if (active.length !== 1) return { device, preset: null, error: active.length ? 'SimPro reported multiple active presets.' : 'SimPro reported no active preset.' };
        return { device, preset: { presetUuid: active[0].presetUuid, name: active[0].name }, error: null };
      } catch (error) {
        return { device, preset: null, error: error instanceof Error ? error.message : 'Unable to read the active preset.' };
      }
    }));
    return { devices, observedAt: this.now() };
  }
  public async refreshHealth(): Promise<PeripheralStatus> {
    this.requirePlugin();
    await this.checkHealth();
    return this.status();
  }
  private checkHealth(): Promise<void> {
    if (this.healthRequest && this.healthController && !this.healthController.signal.aborted) return this.healthRequest;
    if (!this.settings.enabled || !this.load.plugin || this.stopped) return Promise.resolve();
    const plugin = this.load.plugin;
    const controller = new AbortController();
    this.healthController = controller;
    const initialInterval = this.hasHealthWarning() ? HEALTH_CHECK_ERROR_INTERVAL_MS : HEALTH_CHECK_INTERVAL_MS;
    this.nextHealthAt = this.now() + initialInterval;
    this.healthRequest = (async () => {
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
        const health = await plugin.checkHealth(signal);
        if (controller.signal.aborted) return;
        this.health = health;
        this.observedAt = this.now();
        if (health.api === 'responsive') {
          const result = await plugin.listDevices(signal);
          if (!controller.signal.aborted) this.devices = result.ok ? result.devices : [];
        } else this.devices = [];
      } catch { if (!controller.signal.aborted) { this.health = { api: 'unavailable', process: 'unknown' }; this.observedAt = this.now(); this.devices = []; } }
      finally {
        if (this.healthController === controller) { this.healthController = null; this.healthRequest = null; }
        const interval = this.hasHealthWarning() ? HEALTH_CHECK_ERROR_INTERVAL_MS : HEALTH_CHECK_INTERVAL_MS;
        this.nextHealthAt = this.now() + interval;
      }
    })();
    return this.healthRequest;
  }
  public async execute(car: PeripheralCar, manual = true) {
    const plugin = this.requirePlugin();
    const blocked = this.applyBlockedReason();
    if (blocked) throw new PeripheralError(blocked);
    const lifecycle = this.snapshot.lifecycle;
    if (!manual && lifecycle !== 'garage') throw new PeripheralError('No live garage session.');
    const generation = this.detector.generation;
    this.detector.consume();
    const controller = new AbortController();
    this.operation = controller;
    this.operationLifecycle = lifecycle;
    try {
      this.lastRun = await runPresetSwitch({ plugin, settings: this.settings, store: this.store, car,
        loadKey: this.detector.key || 'manual', now: this.now, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        safe: () => !this.stopped && !controller.signal.aborted && this.detector.generation === generation
          && (lifecycle === 'garage' ? this.detector.safe(generation) : this.snapshot.lifecycle === lifecycle),
      });
      return this.lastRun;
    } finally {
      if (this.operation === controller) {
        this.operation = null;
        this.operationLifecycle = null;
      }
    }
  }
  private applyBlockedReason(): string | null {
    if (this.operation) return 'A preset selection is already running.';
    // Apply is the driver's explicit choice: allowed in the garage even after the load was handled, never on track.
    if (!['garage', 'menu', 'offline'].includes(this.snapshot.lifecycle) || this.snapshot.session?.inRealtime) return 'Preset selection is unavailable while on track.';
    return null;
  }
}
