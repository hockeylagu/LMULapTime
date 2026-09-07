export type ResolvedLapStatus = 'pit' | 'outlap' | 'valid' | 'inferred' | 'invalid';

export interface LapStatusFlags {
  isPitStop?: boolean;
  isOutLap?: boolean;
  isValid?: boolean;
  isInferred?: boolean;
}

export function resolveLapStatus(flags: LapStatusFlags): ResolvedLapStatus {
  if (flags.isPitStop) return 'pit';
  if (flags.isOutLap) return 'outlap';
  if (flags.isValid) return 'valid';
  if (flags.isInferred) return 'inferred';
  return 'invalid';
}
