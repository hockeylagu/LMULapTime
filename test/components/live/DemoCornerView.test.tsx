import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LiveTimingStore } from '../../../src/api/liveStream.js';
import { DemoCornerView, type CornerSample } from '../../../src/components/live/demo/DemoCornerView.js';
import { createDemoState } from '../../../src/components/live/demo/demoScenarios.js';
import { PedalBuffer } from '../../../src/components/live/pedalBuffer.js';

afterEach(cleanup);

function renderCorner(corner?: CornerSample | null): void {
  const store = new LiveTimingStore();
  render(<DemoCornerView snapshot={createDemoState('corners').snapshot!} store={store} buffer={new PedalBuffer()} corner={corner} />);
}

/** The grid's cells and the loss slot, by class: what decides where each value sits. */
function layout(): string[] {
  const grid = document.querySelector('section[aria-label^="Pedal trace"] > div');
  return [grid?.className ?? '', ...[...(grid?.children ?? [])].map(cell => `${cell.tagName}.${cell.className}`),
    grid?.querySelector('.inline-block')?.className ?? ''];
}

describe('DemoCornerView', () => {
  it('keeps every value in the same grid cell whatever the corner shows', () => {
    renderCorner();
    const filled = layout();
    expect(filled[filled.length - 1]).toContain('w-[5ch]');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('T4');
    expect(screen.getByLabelText('Lost 0.24 seconds')).toHaveTextContent('+0.24s');
    expect(screen.getByLabelText('Minimum speed 84 kilometres per hour')).toHaveTextContent('84');
    expect(screen.getByLabelText('Reference speed 92 kilometres per hour')).toHaveTextContent('92');
    cleanup();

    renderCorner(null);
    expect(layout()).toEqual(filled);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('—');
    expect(screen.getByLabelText('Loss unknown')).toHaveTextContent('—s');
    expect(screen.getByLabelText('Minimum speed unknown')).toHaveTextContent('—');
    expect(screen.getByLabelText('Reference speed unknown')).toHaveTextContent('—');
    cleanup();

    renderCorner({ turn: 'T19', lossSeconds: 14.2, minKmh: 298.6, refKmh: 299.4 });
    expect(layout()).toEqual(filled);
    expect(screen.getByLabelText('Lost 14.20 seconds')).toHaveTextContent('+9.99s');
    expect(screen.getByLabelText('Minimum speed 299 kilometres per hour')).toHaveTextContent('299');
    expect(screen.getByLabelText('Reference speed 299 kilometres per hour')).toHaveTextContent('299');
  });
});
