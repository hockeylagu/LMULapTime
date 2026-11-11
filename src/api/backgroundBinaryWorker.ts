import { fetchBinaryPart } from './backgroundBinary.js';

/** Worker side of `fetchBinaryInBackground`: reads one file (or its start) per request and hands its bytes over without copying them. */
interface Request { id: number; url: string; end?: number }
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage(message: unknown, transfer?: Transferable[]): void };

scope.onmessage = ({ data: { id, url, end } }) => {
  fetchBinaryPart(url, end).then(
    bytes => { scope.postMessage({ id, bytes }, [bytes]); },
    (error: unknown) => { scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); },
  );
};
