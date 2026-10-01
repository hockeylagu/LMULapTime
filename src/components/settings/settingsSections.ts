import { LucideIcon, Zap, Film, ArrowUpCircle, BrainCircuit, History, Database, HardDrive } from 'lucide-react';
import { AppStatus } from '../../../shared/types/index.js';

export interface SettingsSectionDef {
  id: string;
  title: string;
  fullTitle: string;
  icon: LucideIcon;
  description: string;
  keywords: string[];
  getBadge?: (status: AppStatus | null) => string | undefined;
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: 'cache-settings',
    title: 'SQLite Session Cache',
    fullTitle: 'Session XML SQLite Cache',
    icon: Zap,
    description: 'Local SQLite database cache, session counts, storage size, and cache clearing',
    keywords: ['sqlite', 'cache', 'database', 'sessions', 'size', 'clear', 'reset', 'storage', 'delta', 'sync', 'lmu_cache.db', 'memory', 'disk'],
    getBadge: (status) => (status?.sqliteCache?.sessionsCount !== undefined ? `${status.sqliteCache.sessionsCount} Sessions` : undefined),
  },
  {
    id: 'replay-cache',
    title: 'Replay Telemetry Cache',
    fullTitle: 'Cached Replays (.VCR)',
    icon: Film,
    description: 'Decoded binary VCR replays, 2D coordinates, driver telemetry, and replay files',
    keywords: ['replay', 'replays', 'vcr', 'cache', 'trajectories', 'coordinates', 'telemetry', 'files', 'scan replays', 'playback', 'binary'],
    getBadge: (status) => (status?.sqliteCache?.replaysCount !== undefined ? `${status.sqliteCache.replaysCount} Replays` : undefined),
  },
  {
    id: 'replay-upgrade',
    title: 'Replay Upgrades',
    fullTitle: 'Replay Trajectory Upgrades',
    icon: ArrowUpCircle,
    description: 'Background upgrade runner re-parsing legacy replay formats with newer decoder',
    keywords: ['upgrade', 'legacy', 'migration', 'decoder', 'worker', 're-decode', 'parser', 'background', 'vcr upgrade', 'version'],
  },
  {
    id: 'ai-settings',
    title: 'AI Race Engineer',
    fullTitle: 'AI Lap Reports',
    icon: BrainCircuit,
    description: 'Google Gemini AI configuration, API key, and model selection',
    keywords: ['ai', 'gemini', 'api key', 'race engineer', 'model', 'flash', 'coaching', 'tokens', 'google', 'prompt'],
  },
  {
    id: 'ai-history',
    title: 'AI Reports History',
    fullTitle: 'AI Lap Report History',
    icon: History,
    description: 'Cached Gemini lap reports and coaching debrief history',
    keywords: ['ai', 'history', 'reports', 'cached reports', 'debriefs', 'coaching', 'gemini', 'saved', 'logs'],
  },
  {
    id: 'reference-benchmarks',
    title: 'Reference Benchmarks',
    fullTitle: 'Reference Lap Time Benchmarks',
    icon: Database,
    description: 'Alien and competitive target times synchronized from Google Sheets',
    keywords: ['reference', 'benchmarks', 'alien', 'targets', 'google sheets', 'laptimes', 'pace', 'csv', 'diff', 'refresh', 'spreadsheet', 'competitive'],
    getBadge: (status) => (status?.referenceLaptimes?.entriesCount ? `${status.referenceLaptimes.entriesCount} Targets` : undefined),
  },
  {
    id: 'folder-paths',
    title: 'Folder Paths & Driver',
    fullTitle: 'LMU UserData Directory Paths',
    icon: HardDrive,
    description: 'UserData results, replays, telemetry directories, player name, and background scanner',
    keywords: ['paths', 'folders', 'results', 'replays', 'telemetry', 'duckdb', 'xml', 'player', 'driver', 'scan', 'rescan', 'steam', 'userdata', 'log', 'directories'],
    getBadge: (status) => status?.playerName || undefined,
  },
];

export function matchesSettingsSection(section: SettingsSectionDef, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  if (section.title.toLowerCase().includes(query)) return true;
  if (section.fullTitle.toLowerCase().includes(query)) return true;
  if (section.description.toLowerCase().includes(query)) return true;
  if (section.keywords.some((kw) => kw.toLowerCase().includes(query))) return true;

  return false;
}
