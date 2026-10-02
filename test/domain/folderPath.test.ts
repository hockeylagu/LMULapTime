import { describe, expect, it } from 'vitest';
import { folderPathProblem, normalizeFolderPath } from '../../shared/domain/folderPath.js';

describe('normalizeFolderPath', () => {
  it('trims and strips the quotes Explorer adds with "Copy as path"', () => {
    expect(normalizeFolderPath('  "C:\\Games\\LMU\\UserData\\LOG\\Results"  ')).toBe('C:\\Games\\LMU\\UserData\\LOG\\Results');
    expect(normalizeFolderPath("'D:\\LMU'")).toBe('D:\\LMU');
    expect(normalizeFolderPath('\u201CD:\\LMU\u201D')).toBe('D:\\LMU');
  });

  it('accepts forward slashes and a trailing separator', () => {
    expect(normalizeFolderPath('C:/Games/LMU/Replays/')).toBe('C:\\Games\\LMU\\Replays');
    expect(normalizeFolderPath('C:\\Games\\LMU\\\\')).toBe('C:\\Games\\LMU');
  });

  it('keeps a drive root, UNC shares, long-path prefixes, OneDrive and accented folders', () => {
    expect(normalizeFolderPath('C:')).toBe('C:\\');
    expect(normalizeFolderPath('D:\\')).toBe('D:\\');
    expect(normalizeFolderPath('\\\\nas\\share\\LMU\\')).toBe('\\\\nas\\share\\LMU');
    expect(normalizeFolderPath('\\\\?\\C:\\Very\\Long\\Path\\')).toBe('\\\\?\\C:\\Very\\Long\\Path');
    expect(normalizeFolderPath('C:\\Users\\José Núñez\\OneDrive - Équipe\\Documents\\LMU')).toBe('C:\\Users\\José Núñez\\OneDrive - Équipe\\Documents\\LMU');
  });

  it('drops pasted line breaks and leaves an empty value empty', () => {
    expect(normalizeFolderPath('C:\\LMU\r\n')).toBe('C:\\LMU');
    expect(normalizeFolderPath('   ')).toBe('');
    expect(normalizeFolderPath('""')).toBe('');
  });
});

describe('folderPathProblem', () => {
  it('accepts an empty value, drive paths, UNC and long-path prefixes', () => {
    expect(folderPathProblem('')).toBeNull();
    expect(folderPathProblem('C:\\LMU')).toBeNull();
    expect(folderPathProblem('\\\\nas\\share')).toBeNull();
    expect(folderPathProblem('\\\\?\\C:\\LMU')).toBeNull();
  });

  it('names forbidden characters and relative paths', () => {
    expect(folderPathProblem('C:\\LM*U')).toMatch(/characters Windows does not allow/);
    expect(folderPathProblem('LMU\\Results')).toMatch(/full path/);
  });
});
