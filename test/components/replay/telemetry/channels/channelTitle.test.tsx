import { expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ChannelTitle, ChannelTitleContext } from '../../../../../src/components/replay/telemetry/channels/ChannelTitle.js';
import { openTraceView, setDockChannel, setTraceShown } from '../../../../../src/components/replay/map/telemetry/dockChannel.js';

const chart = (id: 'speed' | 'brake') => (
  <ChannelTitleContext.Provider value={id}><ChannelTitle className="text-lmu-info">{id.toUpperCase()}</ChannelTitle></ChannelTitleContext.Provider>
);

it('stands its chart as the 3D trace while a 3D view is open, and a second click brings the racing line back', () => {
  setTraceShown(false); setDockChannel('speed');
  render(<>{chart('speed')}{chart('brake')}</>);
  // No 3D view: a plain title.
  expect(screen.queryByRole('button')).toBeNull();
  let close = () => {};
  act(() => { close = openTraceView(); });
  const brake = screen.getByRole('button', { name: 'BRAKE' });
  fireEvent.click(brake);
  expect(brake).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'SPEED' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(brake);
  expect(brake).toHaveAttribute('aria-pressed', 'false');
  act(() => close());
  expect(screen.queryByRole('button')).toBeNull();
});
