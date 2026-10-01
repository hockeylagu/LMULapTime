import React, { ReactNode } from 'react';

export interface TelemetryGridLine {
  label: string;
  borderClassName: string;
  labelClassName: string;
  yPercent?: number;
}

export interface TelemetryStaticTraceProps {
  chart: ReactNode;
  gridLines: readonly TelemetryGridLine[];
  gridClassName: string;
}

function areStaticTracePropsEqual(previous: TelemetryStaticTraceProps, next: TelemetryStaticTraceProps): boolean {
  if (previous.chart !== next.chart || previous.gridClassName !== next.gridClassName || previous.gridLines.length !== next.gridLines.length) {
    return false;
  }

  return previous.gridLines.every((line, index) => {
    const nextLine = next.gridLines[index];
    return line.label === nextLine.label
      && line.borderClassName === nextLine.borderClassName
      && line.labelClassName === nextLine.labelClassName
      && line.yPercent === nextLine.yPercent;
  });
}

const OPACITY_CLASS = /(^|\s)opacity-\d+(?=\s|$)/g;
const TEXT_COLOR_CLASS = /(^|\s)text-(?:lmu-[a-z-]+|white)(?:\/\d+)?(?=\s|$)/g;

/**
 * A channel's traces, on their own compositor layer (`will-change: transform`): the scrub cursor
 * and the value badges move over them on every frame, and without a layer of its own each move
 * re-rasterises every trace path under them (a full-resolution lap is one path of ~25,000 vertices
 * per trace). Drawn before the grid so the grid lines stay on top, as they were.
 *
 * A compact 24px title row stays above the plotting area. The SVG viewBox and ticks
 * cover the same scale, using the remaining height with only a 6px bottom inset.
 * The grid is drawn twice at the same explicit tick positions: the lines, dimmed by the channel's grid opacity,
 * then the scale labels at full strength in the neutral muted tier, so a label stays readable
 * (4.5:1) however faint its line is. The channel's color stays on its trace.
 */
export const TelemetryStaticTrace: React.FC<TelemetryStaticTraceProps> = React.memo(({
  chart,
  gridLines,
  gridClassName,
}) => (
  <div className="absolute inset-x-0 top-6 bottom-1.5" data-testid="telemetry-plot-area">
    <div className="absolute inset-0 will-change-transform" data-testid="telemetry-trace-layer">
      {chart}
    </div>
    <div className={gridClassName} aria-hidden="true">
      {gridLines.map(({ label, borderClassName, labelClassName, yPercent }, index) => (
        <div key={label} style={{ position: 'absolute', top: `${yPercent ?? index / Math.max(1, gridLines.length - 1) * 100}%`, left: 12, right: 12, height: 0 }} className={`${borderClassName} ${labelClassName}`}></div>
      ))}
    </div>
    <div className={gridClassName.replace(OPACITY_CLASS, '$1')}>
      {gridLines.map(({ label, labelClassName, yPercent }, index) => (
        <div key={label} style={{ position: 'absolute', top: `${yPercent ?? index / Math.max(1, gridLines.length - 1) * 100}%`, left: 12, transform: index === 0 ? 'none' : index === gridLines.length - 1 ? 'translateY(-100%)' : 'translateY(-50%)' }} className={`border-b border-transparent w-full ${labelClassName.replace(TEXT_COLOR_CLASS, '$1')} text-lmu-muted`}>
          {label}
        </div>
      ))}
    </div>
  </div>
), areStaticTracePropsEqual);
