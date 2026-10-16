import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { openMapping } from '../../../server/live/sharedMemory.js';

const nodeRequire = createRequire(import.meta.url);

describe('shared memory', () => {
  it('returns null for a mapping that does not exist', () => {
    expect(openMapping('$lmu-live-test-missing$', 64)).toBeNull();
  });

  // A mapping this test creates itself (not the game's), to exercise the real Windows calls.
  it.skipIf(process.platform !== 'win32')('reads a named mapping through the Windows API and closes it', () => {
    const koffi = nodeRequire('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const create = kernel32.func('void* __stdcall CreateFileMappingW(intptr_t file, void* attributes, uint32 protect, uint32 high, uint32 low, str16 name)');
    const mapView = kernel32.func('void* __stdcall MapViewOfFile(void* handle, uint32 access, uint32 high, uint32 low, size_t bytes)');
    const unmap = kernel32.func('int __stdcall UnmapViewOfFile(void* view)');
    const close = kernel32.func('int __stdcall CloseHandle(void* handle)');
    const name = `$lmu-live-test-${process.pid}$`;
    const owner = create(-1, null, 4, 0, 256, name);
    const writable = mapView(owner, 2, 0, 0, 256);
    try {
      koffi.encode(writable, 0, 'uint32_t', 0xcafebabe);
      koffi.encode(writable, 8, 'double', 12.5);
      const mapping = openMapping(name, 256);
      expect(mapping).not.toBeNull();
      expect(mapping?.readU32(0)).toBe(0xcafebabe);
      expect(mapping?.read(8, 8).readDoubleLE(0)).toBe(12.5);
      expect(openMapping(name, 65536)).toBeNull();
      mapping?.close();
      mapping?.close();
    } finally {
      unmap(writable);
      close(owner);
    }
  });
});
