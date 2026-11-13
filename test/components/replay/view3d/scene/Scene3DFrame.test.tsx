import { createRef, useState, type RefObject } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Scene3DFrame } from '../../../../../src/components/replay/view3d/scene/Scene3DFrame.js';
import type { CameraMode } from '../../../../../src/components/replay/view3d/camera/cameraModes.js';

afterEach(cleanup);

interface Camera { zoom: (direction: number) => void; reset: () => void; center: () => void }
interface FrameProps { ready?: boolean; error?: string; active?: boolean; onToggleView?: () => void; onRetry?: () => void; scene?: RefObject<Camera | null> }

function Frame({ ready = true, error, active = true, onToggleView = vi.fn(), onRetry = vi.fn(), scene = createRef<Camera>() }: FrameProps) {
  const [mode, setMode] = useState<CameraMode>('chase');
  return (
    <Scene3DFrame surface={createRef()} host={createRef()} scene={scene} state={{ key: 'k', ready, error }} mode={mode} onModeChange={setMode} followMode="follow"
      onRetry={onRetry} onToggleView={onToggleView} active={active} ariaLabel="Test 3D" top={<p>top slot</p>} overlays={<p>overlay slot</p>} bottom={<p>bottom slot</p>}>
      <p>content slot</p>
    </Scene3DFrame>
  );
}

it('places each view panel in its slot on the shared surface', () => {
  render(<Frame />);
  const surface = screen.getByLabelText('Test 3D');
  expect(surface).toHaveAttribute('data-replay-surface', 'map');
  expect(surface).toHaveAttribute('data-replay-view', '3d');
  for (const text of ['top slot', 'content slot', 'overlay slot', 'bottom slot']) expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByLabelText(/^3D track\. Drag to orbit/)).toBeInTheDocument();
  expect(screen.getByTestId('map-controls-overlay')).toBeInTheDocument();
});

it('drives the scene camera from its buttons and switches the view', () => {
  const scene = { current: { zoom: vi.fn(), reset: vi.fn(), center: vi.fn() } }, onToggleView = vi.fn();
  render(<Frame scene={scene} onToggleView={onToggleView} />);
  fireEvent.click(screen.getByTestId('map-controls-overlay').querySelectorAll('button')[0]);
  expect(scene.current.zoom).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /2D/ }));
  expect(onToggleView).toHaveBeenCalledOnce();
});

it('shows the loading card with retry until the scene is ready, and takes the focus when shown', () => {
  const onRetry = vi.fn();
  const view = render(<Frame ready={false} error="No luck" onRetry={onRetry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('No luck');
  fireEvent.click(screen.getByRole('button', { name: 'Retry 3D scene' }));
  expect(onRetry).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('Test 3D')).toHaveFocus();
  view.rerender(<Frame ready active={false} />);
  expect(screen.queryByRole('alert')).toBeNull();
});
