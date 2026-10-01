import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelemetryStaticTrace } from '../../../../src/components/replay/telemetry/TelemetryStaticTrace.js';

describe('TelemetryStaticTrace', () => {
  const gridLines = [{ label: '100%', borderClassName: 'border-b', labelClassName: 'text-[10px]' }];

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

  it('keeps the grid opacity on the lines and draws the labels at full strength in the muted tier', () => {
    render(
      <TelemetryStaticTrace
        chart={<svg />}
        gridLines={[{ label: '250 km/h', borderClassName: 'border-b border-lmu-info/40', labelClassName: 'text-[10px] text-lmu-info font-mono' }]}
        gridClassName="absolute inset-0 flex opacity-20"
      />
    );
    const label = screen.getByText('250 km/h');
    expect(label).toHaveClass('text-lmu-muted', 'font-mono', 'border-transparent');
    expect(label).not.toHaveClass('text-lmu-info');
    expect(label.parentElement).not.toHaveClass('opacity-20');
    const line = label.parentElement?.previousElementSibling?.firstElementChild;
    expect(line).toHaveClass('border-lmu-info/40');
    expect(line?.parentElement).toHaveClass('opacity-20');
  });
  it('updates explicit tick positions when the scale changes', () => {
    const chart = <svg />;
    const { rerender } = render(<TelemetryStaticTrace chart={chart} gridLines={[{ ...gridLines[0], label: 'G4', yPercent: 49.2857 }]} gridClassName="absolute inset-0" />);
    const label = screen.getByText('G4');
    expect(label).toHaveStyle({ top: '49.2857%' });
    expect(label.parentElement?.previousElementSibling?.firstElementChild).toHaveStyle({ top: '49.2857%', height: '0px' });
    rerender(<TelemetryStaticTrace chart={chart} gridLines={[{ ...gridLines[0], label: 'G4', yPercent: 50 }]} gridClassName="absolute inset-0" />);
    expect(screen.getByText('G4')).toHaveStyle({ top: '50%' });
  });
});
