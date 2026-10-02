/**
 * Folder paths as people paste them: Explorer's "Copy as path" wraps them in quotes, a terminal adds a trailing
 * backslash, a browser address bar gives forward slashes. The client normalizes on save and the server does
 * the same, so a path means one thing on both sides.
 */

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [['"', '"'], ["'", "'"], ['\u201C', '\u201D'], ['\u2018', '\u2019']];
const WINDOWS_PATH = /^(?:[a-zA-Z]:|\\\\|\/\/)/;
const DRIVE_ONLY = /^[a-zA-Z]:$/;
const DRIVE_ROOT = /^[a-zA-Z]:\\$/;
const LONG_PATH_PREFIX = '\\\\?\\';
/** Characters Windows never allows in a path (the drive colon and the long-path prefix are handled apart). */
const FORBIDDEN_CHARS = /[<>"|?*]/;
const CONTROL_CHARS = /[\u0000-\u001f]/;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (trimmed.length >= 2 && trimmed.startsWith(open) && trimmed.endsWith(close)) return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Trims, drops surrounding quotes and line breaks, uses backslashes for a Windows path and removes a trailing one. */
export function normalizeFolderPath(raw: string): string {
  const value = stripQuotes(raw.replace(/[\r\n\t]+/g, ' '));
  if (!WINDOWS_PATH.test(value)) return value;

  const backslashed = value.replace(/\//g, '\\');
  // Keep a leading double backslash (network share, long-path prefix); collapse doubled separators after it.
  const lead = backslashed.startsWith('\\\\') ? '\\\\' : '';
  const joined = lead + backslashed.slice(lead.length).replace(/\\{2,}/g, '\\');
  if (DRIVE_ONLY.test(joined)) return `${joined}\\`;
  if (DRIVE_ROOT.test(joined)) return joined;
  return joined.replace(/\\+$/, '');
}

/** Why a (normalized) folder path cannot be right, in plain words; null when it looks fine or is empty. */
export function folderPathProblem(normalized: string): string | null {
  if (!normalized) return null;
  const body = normalized.startsWith(LONG_PATH_PREFIX) ? normalized.slice(LONG_PATH_PREFIX.length) : normalized;
  if (FORBIDDEN_CHARS.test(body) || CONTROL_CHARS.test(body)) {
    return 'This path has characters Windows does not allow in folder names (< > " | ? *).';
  }
  if (!WINDOWS_PATH.test(normalized)) return 'Enter the full path, starting with a drive letter such as C:\\.';
  return null;
}
