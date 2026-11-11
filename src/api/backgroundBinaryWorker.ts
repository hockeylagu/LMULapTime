import { fetchBinary } from './apiClient.js';

/** Worker side of `fetchBinaryInBackground`: reads one file per request and hands its bytes over without copying them. */
interface Request { id: number; url: string }
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage(message: unknown, transfer?: Transferable[]): void };

scope.onmessage = ({ data: { id, url } }) => {
  fetchBinary(url).then(
    bytes => { scope.postMessage({ id, bytes }, [bytes]); },
    (error: unknown) => { scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); },
  );
};
