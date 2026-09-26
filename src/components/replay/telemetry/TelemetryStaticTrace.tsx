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

export const TelemetryStaticTrace: React.FC<TelemetryStaticTraceProps> = React.memo(({
  chart,
  gridLines,
  gridClassName,
}) => (
  <>
    <div className={gridClassName}>
      {gridLines.map(({ label, borderClassName, labelClassName }) => (
        <div key={label} className={`${borderClassName} w-full ${labelClassName}`}>{label}</div>
      ))}
    </div>
    {chart}
  </>
), areStaticTracePropsEqual);