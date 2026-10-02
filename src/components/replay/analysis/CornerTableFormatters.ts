export function speedDeltaClass(delta: number): string {
  if (Math.abs(delta) < 1) return 'text-lmu-muted';
  return delta > 0 ? 'text-lmu-gain font-bold' : 'text-lmu-loss font-medium';
}

export function timeDeltaClass(delta: number): string {
  if (Math.abs(delta) < 0.02) return 'text-lmu-muted';
  return delta < 0 ? 'text-lmu-gain font-bold' : 'text-lmu-loss font-medium';
}

export function formatSpeedDelta(delta: number): string {
  if (Math.abs(delta) < 1) return '±0';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function formatTimeDelta(delta: number): string {
  if (Math.abs(delta) < 0.02) return '±0.000s';
  return delta < 0 ? `${delta.toFixed(3)}s` : `+${delta.toFixed(3)}s`;
}

export function formatBrakingDelta(delta: number | null): string {
  if (delta === null) return '--';
  if (Math.abs(delta) < 1) return '±0m';
  return delta > 0 ? `+${delta}m` : `${delta}m`;
}

export function brakingDeltaClass(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 1) return 'text-lmu-muted';
  return delta > 0 ? 'text-lmu-gain font-bold' : 'text-lmu-loss font-medium';
}

export function throttleDeltaClass(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 1) return 'text-lmu-muted';
  return delta < 0 ? 'text-lmu-gain font-bold' : 'text-lmu-loss font-medium';
}

export function formatDistPoint(distM: number | null): string {
  return distM === null ? '--' : `${distM}m`;
}

export function timeDeltaBadgeClass(delta: number): string {
  if (Math.abs(delta) < 0.02) return 'bg-lmu-raised text-lmu-text-soft border-lmu-rule/60';
  return delta < 0
    ? 'bg-lmu-gain-strong/15 text-lmu-gain border-lmu-gain-strong/30'
    : 'bg-lmu-loss-strong/15 text-lmu-loss border-lmu-loss-strong/30';
}
