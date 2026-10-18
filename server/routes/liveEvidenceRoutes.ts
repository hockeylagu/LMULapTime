import { Router } from 'express';
import type { ServerContext } from '../core/serverContext.js';
import { LiveEvidenceReader } from '../live/capture/evidenceReader.js';
import { getLiveLapEvidence } from '../live/capture/evidenceService.js';
import { LiveEvidenceReadError } from '../live/capture/readError.js';

export function createLiveEvidenceRouter(context: ServerContext, directory: string,
  reader: Pick<LiveEvidenceReader, 'read'> = new LiveEvidenceReader(), recorderOpen: () => boolean = () => false): Router {
  const router = Router();
  router.get('/session/:sessionId/live-evidence', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const ordinal = (value: unknown): number | null => typeof value === 'string' && /^\d{1,7}$/.test(value)
      && Number.isSafeInteger(Number(value)) ? Number(value) : null;
    const driverOrdinal = ordinal(req.query.driverOrdinal);
    const lapOrdinal = ordinal(req.query.lapOrdinal);
    if (driverOrdinal === null || lapOrdinal === null || Object.keys(req.query).some(key => !['driverOrdinal', 'lapOrdinal'].includes(key))) {
      return res.status(400).json({ error: 'driverOrdinal and lapOrdinal must be non-negative integers; no other query parameters are supported' });
    }
    const result = await getLiveLapEvidence(context.sessionDb.getDb(), directory,
      { sessionId: req.params.sessionId, driverOrdinal, lapOrdinal }, () => Boolean(context.getScanStatus().heldForLiveSession),
      // The recorder may hold the file read-write (finishing it, or writing an XML link): retry later.
      request => recorderOpen()
        ? Promise.reject(new LiveEvidenceReadError('busy', 'The recorder is still writing live captures; retry shortly'))
        : reader.read(request));
    return result ? res.json(result) : res.status(404).json({ error: 'Session lap not found' });
  });
  return router;
}
