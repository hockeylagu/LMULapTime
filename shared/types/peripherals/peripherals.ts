/** What SimPro reports for a device; the app switches wheel presets only (the base keeps one profile for every car). */
export type DeviceRole = 'wheel' | 'base';
export interface PeripheralDevice {
  productUuid: string;
  deviceUuid: string;
  role: DeviceRole;
  name: string;
  firmware: string | null;
}
export interface PeripheralPreset {
  presetUuid: string;
  name: string;
  tags: string[];
  official: boolean;
  active: boolean;
}
export interface SelectedDevice { productUuid: string; deviceUuid: string; name: string }
/** A fresh, read-only SimPro observation; independent of assignments and session history. */
export interface LoadedPeripheralPreset {
  device: PeripheralDevice;
  preset: { presetUuid: string; name: string } | null;
  error: string | null;
}
export interface LoadedPeripheralPresets { devices: LoadedPeripheralPreset[]; observedAt: number }
export interface PeripheralSettings {
  enabled: boolean;
  automatic: boolean;
  wheel: SelectedDevice | null;
}
export interface PeripheralHealth { api: 'responsive' | 'unavailable'; process: 'present' | 'absent' | 'unknown' }
export interface PresetMapping {
  scopeKind: 'model' | 'class';
  scopeKey: string;
  productUuid: string;
  deviceUuid: string;
  presetUuid: string;
}
export interface CatalogPreset extends PeripheralPreset { available: boolean }
export interface DeviceCatalog {
  device: SelectedDevice;
  presets: CatalogPreset[];
  refreshedAt: number | null;
  lastError: string | null;
}
export interface PeripheralCar { model: string | null; carClass: string | null }
export interface MappingCar { model: string; carClass: string; aliases: readonly string[] }
export interface MappingRow extends PresetMapping { broken: boolean }
export interface MappingData { mappings: MappingRow[]; cars: MappingCar[] }
export interface MappingChange { scopeKind: 'model' | 'class'; scopeKey: string; presetUuid: string | null }
/** A model assignment, or a class default when the preset names only the class (the Oreca 07 in LMP2 and LMP2_ELMS). */
export interface MappingSuggestion { car: MappingCar; scopeKind: 'model' | 'class'; scopeKey: string; presetUuid: string | null; presetName: string | null; reason: string }
export interface SwitchResult {
  outcome: 'unmapped' | 'broken' | 'device-missing' | 'already-active' | 'skipped' | 'applied' | 'applied-unconfirmed' | 'rejected' | 'uncertain';
  message: string;
  targetPresetUuid?: string;
  /** Observed immediately before selection; null means the read failed or was ambiguous. */
  beforePresetUuid?: string | null;
  /** Present only when confirmation was attempted after an accepted selection. */
  afterPresetUuid?: string | null;
  readbackError?: string;
}
export interface PeripheralRun {
  loadKey: string;
  car: PeripheralCar;
  startedAt: number;
  /** Absent when no wheel is selected. */
  wheel?: SwitchResult;
  /** A skipped load has no selection attempt, even when no devices were configured. */
  skipReason?: string;
}
export interface PeripheralTarget {
  device: SelectedDevice;
  state: 'waiting' | 'unmapped' | 'mapped' | 'broken';
  presetUuid: string | null;
  presetName: string | null;
  source: 'model' | 'class' | null;
}
export interface PeripheralLoadStatus {
  key: string;
  generation: number;
  phase: 'idle' | 'pending' | 'handled';
  skipReason: string | null;
}
export interface PeripheralStatus {
  id: string;
  label: string;
  install: 'not-installed' | 'load-failed' | 'incompatible' | 'ready';
  error: string | null;
  settings: PeripheralSettings;
  health: PeripheralHealth | null;
  observedAt: number | null;
  devices: PeripheralDevice[];
  lastRun: PeripheralRun | null;
  car: PeripheralCar | null;
  /** Null when no wheel is selected. */
  target: PeripheralTarget | null;
  currentLoad: PeripheralLoadStatus;
  busy: boolean;
  applyBlockedReason: string | null;
}
