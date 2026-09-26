import React, { ReactNode } from 'react';

export interface TelemetryGridLine {
  label: string;
  borderClassName: string;
  labelClassName: string;
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
      && line.labelClassName === nextLine.labelClassName;
  });
}

/**
 * A channel's traces, on their own compositor layer (`will-change: transform`): the scrub cursor
 * and the value badges move over them on every frame, and without a layer of its own each move
 * re-rasterises every trace path under them (a full-resolution lap is one path of ~25,000 vertices
 * per trace). Drawn before the grid so the grid lines stay on top, as they were.
 */
export const TelemetryStaticTrace: React.FC<TelemetryStaticTraceProps> = React.memo(({
  chart,
  gridLines,
  gridClassName,
}) => (
  <>
    <div className="absolute inset-0 will-change-transform" data-testid="telemetry-trace-layer">
      {chart}
    </div>
    <div className={gridClassName}>
      {gridLines.map(({ label, borderClassName, labelClassName }) => (
        <div key={label} className={`${borderClassName} w-full ${labelClassName}`}>{label}</div>
      ))}
    </div>
  </>
), areStaticTracePropsEqual);