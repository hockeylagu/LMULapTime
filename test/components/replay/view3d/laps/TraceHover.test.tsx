import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { TraceHover } from '../../../../../src/components/replay/view3d/laps/TraceHover.js';
import { TelemetryHoverLine } from '../../../../../src/components/replay/telemetry/TelemetryHoverLine.js';
import type { TracePick } from '../../../../../src/components/replay/view3d/laps/replayScene.js';
import type { PointComparison } from '../../../../../src/utils/replayComparison.js';

const lap: ReplayTrajectoryData = {replayName: 'lap', pointsCount: 3, bounds: {minX: 0, maxX: 2, minZ: 0, maxZ: 0, spanX: 2, spanZ: 0},
  points: [0, 1, 2].map(i => ({x: i, y: 0, z: 0, timeSec: i, speedKmh: 100 + i, throttle: 90, understeerDeg: 3}))};
const baseline = {...lap, replayName: 'baseline', points: lap.points.map(point => ({...point, speedKmh: 200}))};
const comparisons = lap.points.map((_, i) => ({deltaTimeSec: 0.1 * i, baseline: {...baseline.points[i], understeerDeg: -1}})) as unknown as PointComparison[];

it('shows the hovered lap with the trace for both laps, and moves the cursor on a click but not on a drag', async () => {
  const host = createRef<HTMLDivElement>(), onSelectIndex = vi.fn();
  let answer: TracePick | null = {lap: 'baseline', index: 1, primaryIndex: 2};
  const scene = {current: {pickTrace: vi.fn(async () => answer), hoverTrace: vi.fn()}};
  render(<div><div ref={host} data-testid="host" />
    <div className="relative"><TelemetryHoverLine cumDists={[0, 10, 20]} viewStart={0} viewEnd={2} pctForIndex={i => i * 50} /></div>
    <TraceHover host={host} scene={scene} trajectory={lap} baseline={baseline} comparisons={comparisons} distances={[0, 10, 20]}
      trace={{id: 'under-over-steer', scale: {from: 'centre', limit: 8}}} onSelectIndex={onSelectIndex} active /></div>);
  const surface = screen.getByTestId('host');
  await act(async () => { fireEvent.pointerMove(surface, {clientX: 10, clientY: 10}); });
  const tooltip = screen.getByTestId('trace-hover-tooltip');
  // The baseline named first, its own speed; the delta, distance and lap trace at the lap's sample at that distance.
  expect(tooltip).toHaveTextContent('Baseline'); expect(tooltip).toHaveTextContent('200 km/h'); expect(tooltip).toHaveTextContent('+0.20s');
  expect(tooltip).toHaveTextContent('20m'); expect(tooltip).toHaveTextContent('+3.0 ° understeer'); expect(tooltip).toHaveTextContent('B: -1.0 ° oversteer');
  // A hover line on the curtain at the picked sample, and on the charts at its lap distance (20 m: the chart's last sample).
  expect(scene.current.hoverTrace).toHaveBeenLastCalledWith({lap: 'baseline', index: 1, primaryIndex: 2});
  expect(screen.getByTestId('telemetry-hover-line').style.left).not.toBe('');
  await act(async () => { fireEvent.pointerDown(surface, {clientX: 10, clientY: 10}); fireEvent.pointerUp(surface, {clientX: 40, clientY: 10}); });
  expect(onSelectIndex).not.toHaveBeenCalled();
  // A click's jitter (a move with the button down, within the slop) keeps the pick for the release.
  await act(async () => {
    fireEvent.pointerDown(surface, {clientX: 40, clientY: 10}); fireEvent.pointerMove(surface, {clientX: 41, clientY: 10, buttons: 1});
    fireEvent.pointerUp(surface, {clientX: 41, clientY: 11});
  });
  expect(onSelectIndex).toHaveBeenCalledWith(2);
  answer = null;
  await act(async () => { fireEvent.pointerMove(surface, {clientX: 60, clientY: 10}); });
  expect(screen.queryByTestId('trace-hover-tooltip')).not.toBeInTheDocument();
  expect(scene.current.hoverTrace).toHaveBeenLastCalledWith(null); expect(screen.queryByTestId('telemetry-hover-line')).not.toBeInTheDocument();
  expect(onSelectIndex).toHaveBeenCalledOnce(); // Hovering never moves the car.
});
