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
    const koffi = nodeRequire('koffi') as typeof import('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const create = kernel32.func('void* __stdcall CreateFileMappingW(intptr_t file, void* attributes, uint32 protect, uint32 high, uint32 low, str16 name)') as (file: number, attributes: null, protect: number, high: number, low: number, name: string) => bigint;
    const mapView = kernel32.func('void* __stdcall MapViewOfFile(void* handle, uint32 access, uint32 high, uint32 low, size_t bytes)') as (handle: bigint, access: number, high: number, low: number, bytes: number) => bigint;
    const unmap = kernel32.func('int __stdcall UnmapViewOfFile(void* view)') as (view: bigint) => number;
    const close = kernel32.func('int __stdcall CloseHandle(void* handle)') as (handle: bigint) => number;
    const name = `$lmu-live-test-${process.pid}$`;
    const owner = create(-1, null, 4, 0, 256, name);
    const writable = mapView(owner, 2, 0, 0, 256);
    try {
      koffi.encode(writable, 0, 'uint32_t', 0xcafebabe);
      koffi.encode(writable, 8, 'double', 12.5);
      const mapping = openMapping(name, 256);
      expect(mapping).not.toBeNull();
      if (!mapping) throw new Error('Test mapping did not open');
      try {
        expect(mapping.readU32(0)).toBe(0xcafebabe);
        const snapshot = mapping.read(8, 8);
        const target = Buffer.alloc(24, 0xff);
        mapping.readInto(8, target, 8, 8);
        expect(target.readDoubleLE(8)).toBe(12.5);
        expect(target.subarray(0, 8)).toEqual(Buffer.alloc(8, 0xff));
        expect(target.subarray(16)).toEqual(Buffer.alloc(8, 0xff));
        koffi.encode(writable, 8, 'double', 42.5);
        expect(snapshot.readDoubleLE(0)).toBe(12.5);
        expect(target.readDoubleLE(8)).toBe(12.5);
        mapping.readInto(8, target, 8, 8);
        expect(target.readDoubleLE(8)).toBe(42.5);
        expect(() => mapping.readU32(253)).toThrow(RangeError);
        expect(() => mapping.read(-1, 4)).toThrow(RangeError);
        expect(() => mapping.readInto(252, target, 0, 8)).toThrow(RangeError);
        expect(() => mapping.readInto(0, target, 20, 8)).toThrow(RangeError);
        expect(() => mapping.readInto(0, target, -1, 8)).toThrow(RangeError);
        expect(() => mapping.readInto(0, target, 0, -1)).toThrow(RangeError);
        expect(openMapping(name, 65536)).toBeNull();
      } finally { mapping.close(); }
      mapping.close();
      expect(() => mapping.readU32(0)).toThrow('closed');
      expect(() => mapping.read(0, 8)).toThrow('closed');
      expect(() => mapping.readInto(0, Buffer.alloc(8), 0, 8)).toThrow('closed');
    } finally {
      unmap(writable);
      close(owner);
    }
  });
});
