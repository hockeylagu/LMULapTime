export type TelemetryChannelId =
  | 'speed'
  | 'delta'
  | 'throttle'
  | 'brake'
  | 'gear'
  | 'steer'
  | 'rpm'
  | 'tire-temps'
  | 'tire-wear'
  | 'brake-temps'
  | 'lateral-offset';

export interface TelemetryChannelInfo {
  id: TelemetryChannelId;
  name: string;
  shortName: string;
  unit: string;
  category: 'speed' | 'delta' | 'inputs' | 'engine' | 'wheels' | 'dynamics';
  description: string;
  badgeColor: string;
  lineColor: string;
}

export interface TelemetryPreset {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  channels: TelemetryChannelId[];
}

export const AVAILABLE_TELEMETRY_CHANNELS: TelemetryChannelInfo[] = [
  {
    id: 'speed',
    name: 'Vehicle Speed',
    shortName: 'SPEED',
    unit: 'km/h',
    category: 'speed',
    description: 'Vehicle GPS speed with baseline comparison trace',
    badgeColor: 'text-sky-400 bg-sky-500/20',
    lineColor: '#38bdf8',
  },
  {
    id: 'delta',
    name: 'Delta Time',
    shortName: 'DELTA',
    unit: 's',
    category: 'delta',
    description: 'Running time gain / loss relative to reference baseline lap',
    badgeColor: 'text-amber-400 bg-amber-500/20',
    lineColor: '#f59e0b',
  },
  {
    id: 'throttle',
    name: 'Throttle Input',
    shortName: 'THROTTLE',
    unit: '%',
    category: 'inputs',
    description: 'Driver throttle pedal position and traction control events',
    badgeColor: 'text-emerald-400 bg-emerald-500/20',
    lineColor: '#10b981',
  },
  {
    id: 'brake',
    name: 'Brake Input',
    shortName: 'BRAKE',
    unit: '%',
    category: 'inputs',
    description: 'Driver brake pedal pressure and ABS activation state',
    badgeColor: 'text-rose-400 bg-rose-500/20',
    lineColor: '#ef4444',
  },
  {
    id: 'gear',
    name: 'Transmission Gear',
    shortName: 'GEAR',
    unit: 'N/1-7',
    category: 'engine',
    description: 'Selected forward gear step trace and shift points',
    badgeColor: 'text-amber-400 bg-amber-500/20',
    lineColor: '#f59e0b',
  },
  {
    id: 'steer',
    name: 'Steering Angle',
    shortName: 'STEER',
    unit: '°',
    category: 'inputs',
    description: 'Steering wheel angle with center zero reference line',
    badgeColor: 'text-indigo-400 bg-indigo-500/20',
    lineColor: '#818cf8',
  },
  {
    id: 'rpm',
    name: 'Engine RPM',
    shortName: 'RPM',
    unit: 'rpm',
    category: 'engine',
    description: 'Internal combustion engine revs decoded from binary replay stream',
    badgeColor: 'text-purple-300 bg-purple-500/20',
    lineColor: '#c084fc',
  },
  {
    id: 'tire-temps',
    name: 'Tire Temperatures (4-Corner)',
    shortName: 'TIRE TEMP',
    unit: '°C',
    category: 'wheels',
    description: '4-wheel tire carcass and surface temperatures (FL, FR, RL, RR)',
    badgeColor: 'text-cyan-400 bg-cyan-500/20',
    lineColor: '#06b6d4',
  },
  {
    id: 'tire-wear',
    name: 'Tire Wear & Degradation',
    shortName: 'TIRE DEG',
    unit: '%',
    category: 'wheels',
    description: 'Dynamic tire wear degradation percentage across all 4 wheels',
    badgeColor: 'text-emerald-300 bg-emerald-500/20',
    lineColor: '#34d399',
  },
  {
    id: 'brake-temps',
    name: 'Brake Rotor Temps (4-Corner)',
    shortName: 'BRAKE TEMP',
    unit: '°C',
    category: 'wheels',
    description: 'Carbon / steel brake disc temperatures across all 4 corners',
    badgeColor: 'text-orange-400 bg-orange-500/20',
    lineColor: '#fb923c',
  },
  {
    id: 'lateral-offset',
    name: 'Lateral Track Offset',
    shortName: 'LAT OFFSET',
    unit: 'm',
    category: 'dynamics',
    description: 'Lateral displacement from reference racing line / track centerline',
    badgeColor: 'text-teal-400 bg-teal-500/20',
    lineColor: '#2dd4bf',
  },
];

export const DEFAULT_TELEMETRY_PRESETS: TelemetryPreset[] = [
  {
    id: 'default',
    name: 'Standard Telemetry',
    isBuiltIn: true,
    channels: ['speed', 'delta', 'throttle', 'brake', 'gear', 'steer'],
  },
  {
    id: 'powertrain',
    name: 'Powertrain & Inputs',
    isBuiltIn: true,
    channels: ['speed', 'delta', 'throttle', 'brake', 'gear', 'rpm', 'steer'],
  },
  {
    id: 'thermals',
    name: 'Tires & Thermals',
    isBuiltIn: true,
    channels: ['speed', 'delta', 'tire-temps', 'brake-temps', 'tire-wear'],
  },
  {
    id: 'dynamics',
    name: 'Vehicle Dynamics & Line',
    isBuiltIn: true,
    channels: ['speed', 'delta', 'steer', 'lateral-offset', 'throttle', 'brake'],
  },
  {
    id: 'all-channels',
    name: 'All Telemetry Channels',
    isBuiltIn: true,
    channels: [
      'speed',
      'delta',
      'throttle',
      'brake',
      'gear',
      'steer',
      'rpm',
      'tire-temps',
      'tire-wear',
      'brake-temps',
      'lateral-offset',
    ],
  },
];

const PRESETS_STORAGE_KEY = 'lmu_telemetry_presets_v3';
const ACTIVE_PRESET_STORAGE_KEY = 'lmu_telemetry_active_preset_v3';

export function loadTelemetryPresets(): TelemetryPreset[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PRESETS_STORAGE_KEY) : null;
    if (!raw) return DEFAULT_TELEMETRY_PRESETS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TELEMETRY_PRESETS;
    
    // Ensure all presets have valid channels and non-empty name (and filter legacy driver-inputs)
    const validated: TelemetryPreset[] = (parsed as Record<string, unknown>[])
      .filter((p) => p.id !== 'driver-inputs')
      .map((p, idx) => {
      const defaultChannels: TelemetryChannelId[] = ['speed', 'delta', 'throttle', 'brake', 'gear', 'steer'];
      const fallbackSingle: TelemetryChannelId[] = ['speed'];
      const validChannels: TelemetryChannelId[] = Array.isArray(p.channels)
        ? (p.channels.filter((c: unknown): c is TelemetryChannelId =>
            typeof c === 'string' && AVAILABLE_TELEMETRY_CHANNELS.some(info => info.id === c)
          ))
        : defaultChannels;
      
      return {
        id: typeof p.id === 'string' && p.id.trim() ? p.id : `preset-${idx}`,
        name: typeof p.name === 'string' && p.name.trim() ? p.name : `Preset ${idx + 1}`,
        isBuiltIn: Boolean(p.isBuiltIn),
        channels: validChannels.length > 0 ? validChannels : fallbackSingle,
      };
    });

    return validated.length > 0 ? validated : DEFAULT_TELEMETRY_PRESETS;
  } catch {
    return DEFAULT_TELEMETRY_PRESETS;
  }
}

export function saveTelemetryPresets(presets: TelemetryPreset[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    }
  } catch {
    // Ignore storage write errors in restricted environments
  }
}

export function loadActivePresetId(availablePresets: TelemetryPreset[]): string {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(ACTIVE_PRESET_STORAGE_KEY);
      if (saved && availablePresets.some(p => p.id === saved)) {
        return saved;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return availablePresets[0]?.id ?? 'default';
}

export function saveActivePresetId(id: string): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_PRESET_STORAGE_KEY, id);
    }
  } catch {
    // Ignore storage errors
  }
}

export function resetTelemetryPresetsToDefault(): TelemetryPreset[] {
  saveTelemetryPresets(DEFAULT_TELEMETRY_PRESETS);
  saveActivePresetId(DEFAULT_TELEMETRY_PRESETS[0].id);
  return DEFAULT_TELEMETRY_PRESETS;
}
