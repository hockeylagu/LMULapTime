import { expect, it } from 'vitest';
import type { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { lapCurtains } from '../../../../../src/components/replay/view3d/laps/traceValues.js';
import { TELEMETRY_COLORS, WHEEL_CORNER_COLORS } from '../../../../../src/utils/themeColors.js';
import { channelShare, chartY } from '../../../../../src/components/replay/telemetry/telemetryChannels.js';

const lapOf = (extra: (i: number) => Partial<ReplayTrajectoryPoint>): ReplayTrajectoryData => ({
  replayName: 'test', pointsCount: 4, bounds: {minX: 0, maxX: 30, minZ: 0, maxZ: 1, spanX: 30, spanZ: 1},
  points: Array.from({length: 4}, (_, i) => ({x: i * 10, y: 0, z: 0, timeSec: i, ...extra(i)})),
});

it('stands a single-value channel on the chart scale in the chart colours, both laps on one scale', () => {
  const lap = lapOf(i => ({throttle: i * 25})), baseline = lapOf(() => ({throttle: 100}));
  const {curtains, scale} = lapCurtains('throttle', lap, baseline)!;
  expect(scale).toEqual({from: 'bottom', min: 0, max: 100});
  expect(curtains.primary.edges).toEqual([[0, 0.25, 0.5, 0.75]]);
  expect([curtains.primary.edgeColours, curtains.baseline?.edgeColours]).toEqual([[TELEMETRY_COLORS.throttle], [TELEMETRY_COLORS.baseline]]);
  expect(curtains.baseline?.edges).toEqual([[1, 1, 1, 1]]);
});

it('stands a centred channel by its size and fills balance by its sign', () => {
  const lap = lapOf(i => ({understeerDeg: [4, -4, 16, undefined][i]}));
  const {curtains} = lapCurtains('under-over-steer', lap, null)!;
  expect(curtains.primary.edges[0].slice(0, 3)).toEqual([0.5, 0.5, 1]);
  expect(curtains.primary.edges[0][3]).toBeNaN();
  expect(curtains.primary.fillColours.slice(0, 2)).toEqual([TELEMETRY_COLORS.understeer, TELEMETRY_COLORS.oversteer]);
  expect(curtains.baseline).toBeNull();
});

it('gives per-wheel channels four edges in the wheel colours, the baseline at half opacity', () => {
  const temps = (t: number): [number, number, number, number] => [t, t + 100, t + 200, t + 300];
  const {curtains, scale} = lapCurtains('brake-temps', lapOf(() => ({brakeTemps: temps(100)})), lapOf(() => ({brakeTemps: temps(200)})))!;
  expect(scale).toEqual({from: 'bottom', min: 0, max: 600});
  expect(curtains.primary.edges.map(edge => edge[0])).toEqual([100, 200, 300, 400].map(t => t / 600));
  expect(curtains.primary.edgeColours).toEqual(Object.values(WHEEL_CORNER_COLORS));
  expect([curtains.primary.edgeOpacity, curtains.baseline?.edgeOpacity]).toEqual([1, 0.5]);
});

it('has no curtain for a lap without the channel, nor a delta without a comparison lap', () => {
  expect(lapCurtains('steer-force', lapOf(() => ({})), null)).toBeNull();
  expect(lapCurtains('delta', lapOf(() => ({})), null)).toBeNull();
  const delta = lapCurtains('delta', lapOf(() => ({})), lapOf(i => ({timeSec: i * 0.9})))!;
  expect(delta.scale.from).toBe('centre'); expect(delta.curtains.baseline).toBeNull();
});

it('clamps as the chart clamps', () => {
  expect(channelShare({from: 'bottom', min: 80, max: 100}, 70)).toBe(0);
  expect(channelShare({from: 'centre', limit: 3}, -4.5)).toBe(1);
  expect(chartY({from: 'centre', limit: 3}, -4.5, 42)).toBe(92);
  expect(chartY({from: 'bottom', min: 0, max: 100}, 50, 0)).toBe(52.5);
});
