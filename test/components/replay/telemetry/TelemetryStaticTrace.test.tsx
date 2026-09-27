import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelemetryStaticTrace } from '../../../../src/components/replay/telemetry/TelemetryStaticTrace.js';

describe('TelemetryStaticTrace', () => {
  const gridLines = [{ label: '100%', borderClassName: 'border-b', labelClassName: 'text-[9px]' }];

  it('puts the traces on their own layer, under the grid lines', () => {
    render(
      <div>
        <TelemetryStaticTrace chart={<svg data-testid="chart" />} gridLines={gridLines} gridClassName="absolute inset-0" />
      </div>
    );
    const layer = screen.getByTestId('telemetry-trace-layer');
    expect(layer).toHaveClass('will-change-transform', 'absolute', 'inset-0');
    expect(layer).toContainElement(screen.getByTestId('chart'));
    // Drawn first: the grid (positioned, later in the DOM) stays on top of the traces.
    expect(layer.compareDocumentPosition(screen.getByText('100%'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
