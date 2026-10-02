import { parentPort } from 'node:worker_threads';
import { setWorkerReferenceLaptimes } from '../../benchmarks/referenceLaptimes.js';
import type { ReferenceLaptimesCache } from '../types.js';
import { LmuParser } from '../../sessions/parser.js';
import { parseReplayMetadata } from '../../replay/decode/replayParser.js';
import type { ReplayFileEntry } from '../../sessions/sessionXmlTypes.js';

const port = parentPort;
if (!port) throw new Error('File ingest worker requires a parent port');
port.on('message', (input: { kind: 'xml' | 'replay'; filePath: string; playerName?: string; replays?: ReplayFileEntry[]; referenceCache?: ReferenceLaptimesCache | null }) => {
  try {
    if (input.kind === 'replay') {
      port.postMessage({ result: parseReplayMetadata(input.filePath, { playerName: input.playerName }) });
    } else {
      setWorkerReferenceLaptimes(input.referenceCache ?? null);
      const parser = new LmuParser(undefined, undefined, { detectPlayer: false, readReplayMetadata: false });
      parser.configuredPlayerName = input.playerName || '';
      parser.addReplayEntries(input.replays || []);
      port.postMessage({ result: parser.parseSessionXml(input.filePath) });
    }
  } catch (error: unknown) {
    port.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
