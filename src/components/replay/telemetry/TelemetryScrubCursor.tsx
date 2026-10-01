import { useLayoutEffect, useRef, useState } from 'react';

/** Align both edges to physical pixels so movement does not change apparent thickness. */
export function pixelAlignedCursor(pct: number, left: number, width: number, ratio: number) {
  const scale = ratio > 0 ? ratio : 1;
  return {
    left: Math.round((left + pct / 100 * width) * scale) / scale - left,
    width: Math.max(1, Math.round(scale)) / scale,
  };
}

export function TelemetryScrubCursor({ cursorPct, className = '' }: { cursorPct: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ left: number; width: number; ratio: number } | null>(null);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const rect = parent.getBoundingClientRect();
      setBounds({ left: rect.left, width: rect.width, ratio: window.devicePixelRatio || 1 });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(parent);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const style = bounds ? pixelAlignedCursor(cursorPct, bounds.left, bounds.width, bounds.ratio)
    : { left: `${cursorPct}%`, width: 1 };
  return <div ref={ref} data-testid="telemetry-scrub-cursor" aria-hidden="true"
    style={style} className={`absolute inset-y-0 bg-white pointer-events-none z-30 ${className}`} />;
}
