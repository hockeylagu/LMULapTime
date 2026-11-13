import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Replay3DLoading, Replay3DStreaming } from '../../../../../src/components/replay/view3d/laps/Replay3DLoading.js';
import { describeLoad, NO_LOAD_PROGRESS } from '../../../../../src/components/replay/view3d/laps/loadProgress.js';

const started = {...NO_LOAD_PROGRESS, track: 1};

describe('3D replay load progress', () => {
  it('starts empty on fetching the track, and names the first step still running', () => {
    expect(describeLoad(NO_LOAD_PROGRESS)).toEqual({fraction: 0, label: 'Fetching the track and car'});
    expect(describeLoad(started).label).toBe('Loading scenery');
    const scenery = describeLoad({...started, scenery: {resident: 1, total: 4}, cars: 1});
    expect(scenery.label).toBe('Loading scenery · 1 of 4'); // The car is ready, the scenery is not: it names the scenery.
    expect(scenery.fraction).toBeCloseTo(0.1 + 0.55 / 4 + 0.1);
    expect(describeLoad({...started, scenery: {resident: 4, total: 4}}).label).toBe('Preparing the car');
    expect(describeLoad({...started, scenery: {resident: 4, total: 4}, cars: 1, lighting: 1}).label).toBe('Preparing graphics');
  });

  it('is full once every step is done', () => {
    expect(describeLoad({...started, scenery: {resident: 2, total: 2}, cars: 1, lighting: 1, shaders: 1}))
      .toEqual({fraction: 1, label: 'Starting'});
  });
});

describe('3D replay loading card', () => {
  it('shows the bar at the share done with the step it is on', () => {
    render(<Replay3DLoading progress={{...started, scenery: {resident: 2, total: 4}}} onRetry={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading 3D replay');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '38');
    expect(screen.getByText('38%')).toBeInTheDocument();
    expect(screen.getByText('Loading scenery · 2 of 4')).toBeInTheDocument();
  });

  it('starts at zero before any progress arrives', () => {
    render(<Replay3DLoading onRetry={() => {}} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('Fetching the track and car')).toBeInTheDocument();
  });

  it('shows a failure with a retry in place of the bar', () => {
    const onRetry = vi.fn();
    render(<Replay3DLoading progress={started} error="Track package missing" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Track package missing');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Retry 3D scene'}));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('3D replay streaming note', () => {
  it('counts the circuit scenery still streaming in, and is gone once it is all in', () => {
    const {rerender} = render(<Replay3DStreaming progress={{...started, circuit: {resident: 12, total: 40}}} />);
    expect(screen.getByTestId('replay-3d-streaming')).toHaveTextContent('Streaming scenery12/40');
    rerender(<Replay3DStreaming progress={{...started, circuit: {resident: 40, total: 40}}} />);
    expect(screen.queryByTestId('replay-3d-streaming')).not.toBeInTheDocument();
    rerender(<Replay3DStreaming />);
    expect(screen.queryByTestId('replay-3d-streaming')).not.toBeInTheDocument();
  });

  it('counts the textures still sharpening, alone once the scenery is all in', () => {
    const {rerender} = render(<Replay3DStreaming progress={{...started, circuit: {resident: 12, total: 40}, textures: {sharp: 5, total: 20}}} />);
    expect(screen.getByTestId('replay-3d-streaming')).toHaveTextContent('Streaming scenery12/40Sharpening textures5/20');
    rerender(<Replay3DStreaming progress={{...started, circuit: {resident: 40, total: 40}, textures: {sharp: 18, total: 20}}} />);
    expect(screen.getByTestId('replay-3d-streaming')).toHaveTextContent('Sharpening textures18/20');
    expect(screen.getByTestId('replay-3d-streaming')).not.toHaveTextContent('Streaming scenery');
  });
});
