import { createRequire } from 'node:module';

/** A read-only view of a named Windows file mapping (the rF2 shared memory plugin's buffers). */
export interface MappedBuffer {
  readonly size: number;
  readU32(offset: number): number;
  /** A copy of `length` bytes from `offset`. */
  read(offset: number, length: number): Buffer;
  /** Copy into caller-owned storage without allocating a new buffer. */
  readInto(offset: number, target: Buffer, targetOffset: number, length: number): void;
  close(): void;
}

type Handle = bigint | null;
interface Kernel32 {
  openFileMapping(access: number, inherit: number, name: string): Handle;
  mapViewOfFile(handle: bigint, access: number, high: number, low: number, bytes: number): Handle;
  unmapViewOfFile(view: bigint): number;
  closeHandle(handle: bigint): number;
}

const FILE_MAP_READ = 4;
const nodeRequire = createRequire(import.meta.url);
let kernel32: Kernel32 | null | undefined;

/** The Windows API through koffi (prebuilt, no compiler). Null off Windows or when koffi cannot load. */
function loadKernel32(): Kernel32 | null {
  if (kernel32 !== undefined) return kernel32;
  kernel32 = null;
  if (process.platform !== 'win32') return kernel32;
  try {
    const lib = nodeRequire('koffi').load('kernel32.dll');
    kernel32 = {
      openFileMapping: lib.func('void* __stdcall OpenFileMappingW(uint32 access, int inherit, str16 name)'),
      mapViewOfFile: lib.func('void* __stdcall MapViewOfFile(void* handle, uint32 access, uint32 high, uint32 low, size_t bytes)'),
      unmapViewOfFile: lib.func('int __stdcall UnmapViewOfFile(void* view)'),
      closeHandle: lib.func('int __stdcall CloseHandle(void* handle)'),
    };
  } catch (error: unknown) {
    console.warn('[Live] Windows shared memory is unavailable:', error);
  }
  return kernel32;
}

/** Opens the mapping `name` read-only. Null when it does not exist (or is smaller than `size`). */
export function openMapping(name: string, size: number): MappedBuffer | null {
  const api = loadKernel32();
  if (!api) return null;
  const handle = api.openFileMapping(FILE_MAP_READ, 0, name);
  if (handle === null) return null;
  const view = api.mapViewOfFile(handle, FILE_MAP_READ, 0, 0, size);
  if (view === null) {
    api.closeHandle(handle);
    return null;
  }
  const koffi = nodeRequire('koffi');
  // Keep the external view private: no consumer can retain mapped memory after close().
  // Snapshots still copy between the producer's version-counter checks.
  let bytes: Buffer;
  try { bytes = Buffer.from(koffi.view(view, size) as ArrayBuffer); }
  catch (error: unknown) {
    api.unmapViewOfFile(view);
    api.closeHandle(handle);
    throw error;
  }
  let closed = false;
  const checkRange = (offset: number, length: number): void => {
    if (closed) throw new Error('Shared memory mapping is closed');
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > size - length) {
      throw new RangeError('Shared memory read exceeds the mapping');
    }
  };
  const readInto = (offset: number, target: Buffer, targetOffset: number, length: number): void => {
    checkRange(offset, length);
    if (!Number.isSafeInteger(targetOffset) || targetOffset < 0 || targetOffset > target.length - length) {
      throw new RangeError('Shared memory read exceeds the destination');
    }
    bytes.copy(target, targetOffset, offset, offset + length);
  };
  return {
    size,
    // Retain the native uint32 load for the producer's version counters rather than
    // assembling a counter from separate byte reads while the producer may update it.
    readU32: offset => { checkRange(offset, 4); return koffi.decode(view, offset, 'uint32_t') as number; },
    read: (offset, length) => {
      checkRange(offset, length);
      const result = Buffer.allocUnsafe(length);
      readInto(offset, result, 0, length);
      return result;
    },
    readInto,
    close: () => {
      if (closed) return;
      closed = true;
      api.unmapViewOfFile(view);
      api.closeHandle(handle);
    },
  };
}
