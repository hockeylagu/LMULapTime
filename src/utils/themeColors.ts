/**
 * Central theme color definitions for Le Mans Ultimate (LMU) Lap Time Analyzer.
 * Synchronized with Tailwind CSS theme configuration (tailwind.config.js).
 */

export const LMU_COLORS = {
  bg: '#0B0E14',
  card: '#151A23',
  cardHover: '#1A202C',
  border: '#232A36',
  accent: '#E63946',
  gold: '#FFB703',
  blue: '#219EBC',
  cyan: '#8ECAE6',
  green: '#2A9D8F',
  text: '#F8F9FA',
  muted: '#8D99AE',
  dark: '#080A0F',
  surface: '#080C14',
  strip: '#0A0E17',
  badge: '#070C18',
  deep: '#060910',
} as const;

export type LmuColorKey = keyof typeof LMU_COLORS;

export const SECTOR_COLORS = {
  s1: LMU_COLORS.gold,
  s2: LMU_COLORS.blue,
  s3: LMU_COLORS.green,
} as const;

export const PACE_CHART_COLORS = {
  Alien: '#A855F7',
  Competitive: '#F59E0B',
  Good: '#10B981',
  Midpack: '#38BDF8',
  'Tail-ender': '#F97316',
  Offline: '#A1A1AA',
} as const;

export const CHART_COLORS = {
  grid: LMU_COLORS.border,
  axis: LMU_COLORS.muted,
  white: '#FFFFFF',
  black: '#000000',
  playerHighlight: '#FBBF24',
} as const;

export const TELEMETRY_COLORS = {
  primary: '#38BDF8',
  baseline: '#F59E0B',
  throttle: '#10B981',
  brake: '#EF4444',
  steer: '#818CF8',
  rpm: '#C084FC',
  gear: '#F59E0B',
  gain: '#10B981',
  loss: '#EF4444',
  neutral: '#475569',
  understeer: '#38BDF8',
  oversteer: '#F59E0B',
  tireScrub: '#F43F5E',
  brakeTemp: '#FB923C',
  lateralOffset: '#2DD4BF',
  slipAngle: '#A78BFA',
  yawRate: '#22D3EE',
  fuel: '#10B981',
} as const;

export const WHEEL_CORNER_COLORS = {
  fl: '#06B6D4',
  fr: '#3B82F6',
  rl: '#F59E0B',
  rr: '#F43F5E',
} as const;

export const MAP_COLORS = {
  roadSurface: '#0C121E',
  roadBorder: '#1A2234',
  centerline: '#334155',
  trackBoundary: '#475569',
  minimapBorder: '#1E293B',
  markerBg: '#090D16',
  markerDotBase: '#060912',
  markerUnselected: '#0F172A',
  markerDimmed: '#64748B',
  markerMuted: '#94A3B8',
  apex: '#F43F5E',
  apexText: '#FB7185',
  baselineBrake: '#F87171',
  baselineThrottle: '#4ADE80',
  gripLost: '#FB7185',
  gripLimit: '#34D399',
  gripBuilding: '#22D3EE',
} as const;

export const COMPARE_LAP_COLORS = [
  LMU_COLORS.gold,
  LMU_COLORS.blue,
  LMU_COLORS.green,
  LMU_COLORS.accent,
  '#8B5CF6',
] as const;

export const OPPONENT_COLORS = [
  '#38BDF8', // sky
  '#34D399', // emerald
  '#A78BFA', // purple
  '#F472B6', // pink
  '#FB923C', // orange
  '#E2E8F0', // slate
  '#4ADE80', // green
  '#2DD4BF', // teal
  '#818CF8', // indigo
  '#C084FC', // fuchsia
  '#F87171', // red
  '#94A3B8', // cool gray
] as const;
