export type TelemetryChannelId =
  | 'speed'
  | 'delta'
  | 'throttle'
  | 'brake'
  | 'gear'
  | 'steer'
  | 'rpm'
  | 'brake-temps'
  | 'ride-height'
  | 'wheel-speeds'
  | 'tire-pressures'
  | 'tire-wear'
  | 'tire-temps'
  | 'lateral-offset'
  | 'accel-lat'
  | 'accel-lon'
  | 'accel-total'
  | 'slip-angle'
  | 'under-over-steer'
  | 'yaw-rate'
  | 'fuel'
  | 'virtual-energy'
  | 'soc'
  | 'regen-rate';

export interface TelemetryChannelInfo {
  id: TelemetryChannelId;
  name: string;
  shortName: string;
  unit: string;
  category: 'speed' | 'delta' | 'inputs' | 'engine' | 'dynamics' | 'forces' | 'wheels' | 'energy';
  isComputed: boolean;
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
    isComputed: false,
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
    isComputed: false,
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
    isComputed: false,
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
    isComputed: false,
    description: 'Driver brake pedal pressure, ABS activation, and wheel lockup',
    badgeColor: 'text-rose-400 bg-rose-500/20',
    lineColor: '#ef4444',
  },
  {
    id: 'gear',
    name: 'Transmission Gear',
    shortName: 'GEAR',
    unit: 'N/1-7',
    category: 'engine',
    isComputed: false,
    description: 'Selected forward gear step trace and shift points',
    badgeColor: 'text-amber-400 bg-amber-500/20',
    lineColor: '#f59e0b',
  },
  {
    id: 'steer',
    name: 'Steering Input',
    shortName: 'STEER',
    unit: '%',
    category: 'inputs',
    isComputed: false,
    description: 'Signed steering input percentage with center zero reference line',
    badgeColor: 'text-indigo-400 bg-indigo-500/20',
    lineColor: '#818cf8',
  },
  {
    id: 'rpm',
    name: 'Engine RPM',
    shortName: 'RPM',
    unit: 'rpm',
    category: 'engine',
    isComputed: false,
    description: 'Internal combustion engine revs decoded from binary replay stream',
    badgeColor: 'text-purple-300 bg-purple-500/20',
    lineColor: '#c084fc',
  },
  {
    id: 'brake-temps',
    name: 'Brake Rotor Temps (4-Corner)',
    shortName: 'BRAKE TEMP',
    unit: '°C',
    category: 'wheels',
    isComputed: false,
    description: 'Carbon / steel brake disc temperatures across all 4 corners',
    badgeColor: 'text-orange-400 bg-orange-500/20',
    lineColor: '#fb923c',
  },
  {
    id: 'ride-height',
    name: 'Ride Height (4-Corner)',
    shortName: 'RIDE HEIGHT',
    unit: 'mm',
    category: 'wheels',
    isComputed: false,
    description: 'Measured ride height in millimetres across all 4 corners',
    badgeColor: 'text-emerald-400 bg-emerald-500/20',
    lineColor: '#10b981',
  },
  {
    id: 'wheel-speeds',
    name: 'Wheel Speeds (4-Corner)',
    shortName: 'WHEEL SPD',
    unit: 'km/h',
    category: 'wheels',
    isComputed: false,
    description: 'Individual 4-wheel rotation linear velocity (FL, FR, RL, RR)',
    badgeColor: 'text-cyan-400 bg-cyan-500/20',
    lineColor: '#06b6d4',
  },
  {
    id: 'tire-pressures',
    name: 'Tire Pressures (4-Corner)',
    shortName: 'PRESSURES',
    unit: 'kPa',
    category: 'wheels',
    isComputed: false,
    description: 'Dynamic tire air inflation pressures across all 4 wheels',
    badgeColor: 'text-sky-400 bg-sky-500/20',
    lineColor: '#38bdf8',
  },
  {
    id: 'tire-wear',
    name: 'Tire Wear (4-Corner)',
    shortName: 'TIRE WEAR',
    unit: '%',
    category: 'wheels',
    isComputed: false,
    description: 'Corner tire tread condition and remaining life (100% = new)',
    badgeColor: 'text-amber-400 bg-amber-500/20',
    lineColor: '#f59e0b',
  },
  {
    id: 'tire-temps',
    name: 'Tire Temps (4-Corner)',
    shortName: 'TIRE TEMP',
    unit: '°C',
    category: 'wheels',
    isComputed: false,
    description: 'Tire carcass and inner rubber bulk temperatures across all 4 wheels',
    badgeColor: 'text-rose-400 bg-rose-500/20',
    lineColor: '#f43f5e',
  },
  {
    id: 'lateral-offset',
    name: 'Lateral Track Offset',
    shortName: 'LAT OFFSET',
    unit: 'm',
    category: 'dynamics',
    isComputed: false,
    description: 'Lateral displacement from reference racing line / track centerline',
    badgeColor: 'text-teal-400 bg-teal-500/20',
    lineColor: '#2dd4bf',
  },
  {
    id: 'accel-lat',
    name: 'Lateral Acceleration (G)',
    shortName: 'LAT G',
    unit: 'G',
    category: 'forces',
    isComputed: true,
    description: 'Computed cornering centripetal load with center zero line (+Right / -Left)',
    badgeColor: 'text-sky-400 bg-sky-500/20',
    lineColor: '#38bdf8',
  },
  {
    id: 'accel-lon',
    name: 'Longitudinal Acceleration (G)',
    shortName: 'LON G',
    unit: 'G',
    category: 'forces',
    isComputed: true,
    description: 'Computed acceleration and braking deceleration rate (-Braking / +Power)',
    badgeColor: 'text-amber-400 bg-amber-500/20',
    lineColor: '#f59e0b',
  },
  {
    id: 'accel-total',
    name: 'Combined Acceleration (G)',
    shortName: 'TOTAL G',
    unit: 'G',
    category: 'forces',
    isComputed: true,
    description: 'Resultant friction circle acceleration vector magnitude (grip utilization)',
    badgeColor: 'text-rose-400 bg-rose-500/20',
    lineColor: '#f43f5e',
  },
  {
    id: 'slip-angle',
    name: 'Body Slip Angle (Beta)',
    shortName: 'SLIP ANG',
    unit: '°',
    category: 'dynamics',
    isComputed: true,
    description: 'Computed vehicle attitude angle relative to path velocity vector',
    badgeColor: 'text-violet-400 bg-violet-500/20',
    lineColor: '#a78bfa',
  },
  {
    id: 'under-over-steer',
    name: 'Handling Dynamic Balance',
    shortName: 'BALANCE',
    unit: '°',
    category: 'dynamics',
    isComputed: true,
    description: 'Dynamic steering angle deviation: +Understeer (push) / -Oversteer (loose)',
    badgeColor: 'text-amber-300 bg-amber-500/20',
    lineColor: '#fbbf24',
  },
  {
    id: 'yaw-rate',
    name: 'Yaw Angular Rate',
    shortName: 'YAW RATE',
    unit: '°/s',
    category: 'dynamics',
    isComputed: true,
    description: 'Computed vehicle rotation rate showing corner entry agility and rotation',
    badgeColor: 'text-cyan-400 bg-cyan-500/20',
    lineColor: '#22d3ee',
  },
  {
    id: 'fuel',
    name: 'Fuel Level',
    shortName: 'FUEL',
    unit: 'L',
    category: 'energy',
    isComputed: false,
    description: 'Onboard fuel quantity remaining in tank (L)',
    badgeColor: 'text-emerald-400 bg-emerald-500/20',
    lineColor: '#10b981',
  },
  {
    id: 'virtual-energy',
    name: 'Virtual Energy',
    shortName: 'V-ENERGY',
    unit: '%',
    category: 'energy',
    isComputed: false,
    description: 'WEC Hypercar stint virtual energy allocation remaining (%)',
    badgeColor: 'text-cyan-400 bg-cyan-500/20',
    lineColor: '#06b6d4',
  },
  {
    id: 'soc',
    name: 'Battery State of Charge',
    shortName: 'SOC',
    unit: '%',
    category: 'energy',
    isComputed: false,
    description: 'Hybrid powertrain battery state of charge (%)',
    badgeColor: 'text-amber-400 bg-amber-500/20',
    lineColor: '#f59e0b',
  },
  {
    id: 'regen-rate',
    name: 'Regen Recovery Rate',
    shortName: 'REGEN',
    unit: 'kW',
    category: 'energy',
    isComputed: false,
    description: 'Hybrid kinetic regenerative braking energy recovery (kW)',
    badgeColor: 'text-purple-400 bg-purple-500/20',
    lineColor: '#c084fc',
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
    id: 'wheels-suspension',
    name: 'Wheels & Tires',
    isBuiltIn: true,
    channels: ['speed', 'delta', 'ride-height', 'wheel-speeds', 'tire-pressures', 'tire-wear', 'tire-temps', 'brake-temps'],
  },
  {
    id: 'g-forces',
    name: 'G-Forces & Dynamics',
    isBuiltIn: true,
    channels: ['speed', 'delta', 'accel-lat', 'accel-lon', 'accel-total', 'steer'],
  },
  {
    id: 'handling',
    name: 'Handling & Line',
    isBuiltIn: true,
    channels: ['speed', 'delta', 'steer', 'lateral-offset', 'accel-lat', 'under-over-steer', 'slip-angle', 'throttle', 'brake'],
  },
  {
    id: 'energy-fuel',
    name: 'Energy & Fuel',
    isBuiltIn: true,
    channels: ['speed', 'delta', 'fuel', 'virtual-energy', 'soc', 'regen-rate', 'throttle', 'brake'],
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
      'brake-temps',
      'ride-height',
      'wheel-speeds',
      'tire-pressures',
      'tire-wear',
      'tire-temps',
      'lateral-offset',
      'accel-lat',
      'accel-lon',
      'accel-total',
      'slip-angle',
      'under-over-steer',
      'yaw-rate',
      'fuel',
      'virtual-energy',
      'soc',
      'regen-rate',
    ],
  },
];

const PRESETS_STORAGE_KEY = 'lmu_telemetry_presets_v8';
const ACTIVE_PRESET_STORAGE_KEY = 'lmu_telemetry_active_preset_v8';
const LEGACY_PRESETS_STORAGE_KEY = 'lmu_telemetry_presets_v7';
const LEGACY_ACTIVE_PRESET_STORAGE_KEY = 'lmu_telemetry_active_preset_v7';

export function loadTelemetryPresets(): TelemetryPreset[] {
  try {
    let raw = typeof window !== 'undefined' ? localStorage.getItem(PRESETS_STORAGE_KEY) : null;
    let isMigrating = false;

    if (!raw && typeof window !== 'undefined') {
      raw = localStorage.getItem(LEGACY_PRESETS_STORAGE_KEY);
      if (raw) isMigrating = true;
    }

    if (!raw) return DEFAULT_TELEMETRY_PRESETS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TELEMETRY_PRESETS;

    // When migrating, include newly added default presets while preserving custom presets
    const customPresets = isMigrating
      ? parsed.filter((p: Record<string, unknown>) => !p.isBuiltIn)
      : [];
    
    // Ensure all presets have valid channels and non-empty name (and filter legacy driver-inputs)
    const baseList = isMigrating ? [...DEFAULT_TELEMETRY_PRESETS, ...customPresets] : parsed;
    const validated: TelemetryPreset[] = (baseList as Record<string, unknown>[])
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

    const result = validated.length > 0 ? validated : DEFAULT_TELEMETRY_PRESETS;
    if (isMigrating) {
      saveTelemetryPresets(result);
    }
    return result;
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
      let saved = localStorage.getItem(ACTIVE_PRESET_STORAGE_KEY);
      if (!saved) {
        saved = localStorage.getItem(LEGACY_ACTIVE_PRESET_STORAGE_KEY);
      }
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
