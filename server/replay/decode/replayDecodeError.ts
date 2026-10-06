/**
 * The replay file itself could not be decoded: the decoder read it and rejected it. Recorded as `failed`
 * (see dbReplayIngestStore); any other error (a worker that exited, ran out of memory or was stopped with
 * the server, a storage error) says nothing about the file and is recorded as `interrupted`. Either is
 * tried again until MAX_DECODE_ATTEMPTS outcomes in a row on the same file version.
 */
export class ReplayDecodeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ReplayDecodeError';
  }
}

/** Runs a decode in this thread, marking what it throws as a decode failure of the file. */
export function decodeOrThrow<T>(decode: () => T): T {
  try {
    return decode();
  } catch (error: unknown) {
    // A system error (the file locked or gone) is not the decoder rejecting the file.
    if (typeof (error as NodeJS.ErrnoException)?.code === 'string') throw error;
    throw new ReplayDecodeError(error instanceof Error ? error.message : String(error));
  }
}
