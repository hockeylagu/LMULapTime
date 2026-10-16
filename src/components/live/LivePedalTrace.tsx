import { useEffect, useRef } from 'react';
import { LMU_COLORS, TELEMETRY_COLORS } from '../../utils/themeColors.js';
import { PEDAL_WINDOW_SECONDS, type PedalBuffer } from './pedalBuffer.js';

/** A longer silence than this between two samples is a gap in the data: the line breaks instead of bridging it. */
export const PEDAL_GAP_SECONDS = 0.25;
const LINE_WIDTH = 6;
const PAD = LINE_WIDTH;
/** Layout size of the trace in the 2560 x 1440 frame, used when the canvas has no layout yet. */
const FALLBACK_WIDTH = 2448;
const FALLBACK_HEIGHT = 282;

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = LMU_COLORS.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let step = 0; step <= 4; step += 1) {
    const y = PAD + ((height - 2 * PAD) * step) / 4;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  for (let second = 0; second <= PEDAL_WINDOW_SECONDS; second += 5) {
    const x = (width * second) / PEDAL_WINDOW_SECONDS;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  ctx.stroke();
}

function drawLine(
  ctx: CanvasRenderingContext2D, buffer: PedalBuffer, key: 'throttle' | 'brake', color: string, width: number, height: number,
): void {
  const newest = buffer.latest;
  if (newest === null) return;
  const left = newest - PEDAL_WINDOW_SECONDS;
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let previousT: number | null = null;
  for (const sample of buffer.visible) {
    const x = ((sample.t - left) / PEDAL_WINDOW_SECONDS) * width;
    const y = PAD + (1 - Math.min(1, Math.max(0, sample[key]))) * (height - 2 * PAD);
    if (previousT === null || sample.t - previousT > PEDAL_GAP_SECONDS) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    previousT = sample.t;
  }
  ctx.stroke();
}

/** The last 20 seconds of throttle and brake on one fixed 0-100 % scale: lines and grid only, drawn on demand. */
export function LivePedalTrace({ buffer }: { buffer: PedalBuffer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame: number | null = null;
    const draw = () => {
      frame = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const width = canvas.clientWidth || FALLBACK_WIDTH;
      const height = canvas.clientHeight || FALLBACK_HEIGHT;
      // The frame is scaled by a transform: size the backing store from the pixels the canvas really covers.
      const rect = canvas.getBoundingClientRect();
      const ratio = (rect.width > 0 ? rect.width / width : 1) * (window.devicePixelRatio || 1);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawGrid(ctx, width, height);
      drawLine(ctx, buffer, 'throttle', TELEMETRY_COLORS.throttle, width, height);
      drawLine(ctx, buffer, 'brake', TELEMETRY_COLORS.brake, width, height);
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(draw); };
    const unsubscribe = buffer.subscribe(schedule);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      unsubscribe();
      window.removeEventListener('resize', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [buffer]);

  return <canvas ref={canvasRef} data-testid="pedal-trace" aria-hidden="true" className="block h-full w-full" />;
}
