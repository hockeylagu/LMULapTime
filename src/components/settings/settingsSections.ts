import { LucideIcon, Zap, Film, BrainCircuit, History, Database, HardDrive } from 'lucide-react';
import { AppStatus } from '../../../shared/types/index.js';

export interface SettingsSectionDef {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
  keywords: string[];
  getBadge?: (status: AppStatus | null) => string | undefined;
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: 'cache-settings',
    title: 'Session Cache',
    icon: Zap,
    description: 'Local SQLite database cache, session counts, storage size, and cache clearing',
    keywords: ['sqlite', 'cache', 'database', 'sessions', 'size', 'clear', 'reset', 'storage', 'delta', 'sync', 'lmu_cache.db', 'memory', 'disk'],
    getBadge: (status) => (status?.sqliteCache?.sessionsCount !== undefined ? `${status.sqliteCache.sessionsCount} Sessions` : undefined),
  },
  {
    id: 'replay-cache',
    title: 'Cached Replays',
    icon: Film,
    description: 'Decoded binary VCR replays, 2D coordinates, driver telemetry, and replay files',
    keywords: ['replay', 'replays', 'vcr', 'cache', 'trajectories', 'coordinates', 'telemetry', 'files', 'scan replays', 'playback', 'binary', 'upgrade', 'migration'],
    getBadge: (status) => (status?.sqliteCache?.replaysCount !== undefined ? `${status.sqliteCache.replaysCount} Replays` : undefined),
  },
  {
    id: 'ai-settings',
    title: 'AI Lap Reports',
    icon: BrainCircuit,
    description: 'Google Gemini AI configuration, API key, and model selection',
    keywords: ['ai', 'gemini', 'api key', 'race engineer', 'model', 'flash', 'coaching', 'tokens', 'google', 'prompt'],
  },
  {
    id: 'ai-history',
    title: 'AI Report History',
    icon: History,
    description: 'Cached Gemini lap reports and coaching debrief history',
    keywords: ['ai', 'history', 'reports', 'cached reports', 'debriefs', 'coaching', 'gemini', 'saved', 'logs'],
  },
  {
    id: 'reference-benchmarks',
    title: 'Reference Benchmarks',
    icon: Database,
    description: 'Alien and competitive target times synchronized from Google Sheets',
    keywords: ['reference', 'benchmarks', 'alien', 'targets', 'google sheets', 'laptimes', 'pace', 'csv', 'diff', 'refresh', 'spreadsheet', 'competitive'],
    getBadge: (status) => (status?.referenceLaptimes?.entriesCount ? `${status.referenceLaptimes.entriesCount} Targets` : undefined),
  },
  {
    id: 'folder-paths',
    title: 'Folder Paths & Driver',
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
  if (section.description.toLowerCase().includes(query)) return true;
  if (section.keywords.some((kw) => kw.toLowerCase().includes(query))) return true;

  return false;
}

export function getSettingsSection(id: string): SettingsSectionDef | undefined {
  return SETTINGS_SECTIONS.find((section) => section.id === id);
}

/** Height of the sticky navbar plus a gap: sticky sidebar offset, anchor scroll margin and scrollspy line. */
export const SETTINGS_HEADER_OFFSET_PX = 84;

/** Names of the LMU folders the server could not find (empty while the status is unknown). */
export function getMissingPaths(status: AppStatus | null): string[] {
  if (!status) return [];
  const missing: string[] = [];
  if (!status.resultsExist) missing.push('results folder');
  if (!status.replaysExist) missing.push('replays folder');
  if (status.telemetryExist === false) missing.push('telemetry folder');
  return missing;
}

/** Folder Paths leads the page while a folder is missing, since nothing else works without it. */
export function orderSettingsSections(sections: SettingsSectionDef[], setupNeeded: boolean): SettingsSectionDef[] {
  if (!setupNeeded) return sections;
  const paths = sections.filter((section) => section.id === 'folder-paths');
  return [...paths, ...sections.filter((section) => section.id !== 'folder-paths')];
}
