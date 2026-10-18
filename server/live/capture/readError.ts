import type { LiveEvidenceUnavailableReason } from '../../../shared/types/liveEvidence.js';

export class LiveEvidenceReadError extends Error {
  public constructor(public readonly reason: LiveEvidenceUnavailableReason, message: string) { super(message); }
}
