import { createRequire } from 'node:module';

export interface GameProcessProbe {
  /** Null means process detection is unavailable; use the telemetry fallback. */
  read(): boolean | null;
  close(): void;
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const SYNCHRONIZE = 0x100000;
const WAIT_TIMEOUT = 258;

/** Read-only process discovery and a retained process handle, used only in the reader worker. */
export function createGameProcessProbe(executable = 'Le Mans Ultimate.exe'): GameProcessProbe {
  if (process.platform !== 'win32') return { read: () => null, close: () => {} };
  const nodeRequire = createRequire(import.meta.url);
  try {
    const lib = nodeRequire('koffi').load('kernel32.dll');
    const snapshot = lib.func('void* __stdcall CreateToolhelp32Snapshot(uint32 flags, uint32 pid)') as (flags: number, pid: number) => bigint | null;
    const first = lib.func('int __stdcall Process32FirstW(void* snapshot, void* entry)') as (handle: bigint, entry: Buffer) => number;
    const next = lib.func('int __stdcall Process32NextW(void* snapshot, void* entry)') as typeof first;
    const open = lib.func('void* __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)') as (access: number, inherit: number, pid: number) => bigint | null;
    const wait = lib.func('uint32 __stdcall WaitForSingleObject(void* handle, uint32 timeout)') as (handle: bigint, timeout: number) => number;
    const close = lib.func('int __stdcall CloseHandle(void* handle)') as (handle: bigint) => number;
    const lastError = lib.func('uint32 __stdcall GetLastError()') as () => number;
    // PROCESSENTRY32W contains one pointer-sized field before szExeFile.
    const is32Bit = process.arch === 'ia32';
    const entry = Buffer.alloc(is32Bit ? 556 : 568);
    const nameOffset = is32Bit ? 36 : 44;
    let handle: bigint | null = null;
    const release = (): void => {
      if (handle !== null) close(handle);
      handle = null;
    };
    return {
      close: release,
      read: () => {
        if (handle !== null) {
          const result = wait(handle, 0);
          if (result === WAIT_TIMEOUT) return true;
          release();
          // WAIT_FAILED is unknown, never evidence that the game exited.
          if (result !== 0) return null;
          // Report this instance's exit before discovering a replacement, so rapid restarts discard old mappings.
          return false;
        }
        const list = snapshot(2, 0); // TH32CS_SNAPPROCESS
        if (list === null || BigInt.asIntN(is32Bit ? 32 : 64, list) === -1n) return null;
        try {
          entry.writeUInt32LE(entry.length, 0);
          if (!first(list, entry)) return null;
          do {
            const name = entry.toString('utf16le', nameOffset).split('\0', 1)[0];
            if (name.toLowerCase() !== executable.toLowerCase()) continue;
            handle = open(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, entry.readUInt32LE(8));
            // Discovery still works when permissions prevent retaining a handle.
            if (handle === null) return true;
            const result = wait(handle, 0);
            if (result === WAIT_TIMEOUT) return true;
            release();
            return result === 0 ? false : null;
          } while (next(list, entry));
          return lastError() === 18 ? false : null; // ERROR_NO_MORE_FILES
        } finally {
          close(list);
        }
      },
    };
  } catch {
    return { read: () => null, close: () => {} };
  }
}
