import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RACE_AID, RACE_LAMP, RACE_POSE_CHANNELS, RACE_POSE_CHANNEL_COUNT, type RacePoseWindow } from '../../../../shared/domain/raceReplay/poseWindow.js';
import { RaceCarHud, racePosePoint } from '../../../../src/components/replay/race/RaceCarHud.js';
import { createRaceClock } from '../../../../src/components/replay/race/raceClock.js';
import type { RacePoseCache } from '../../../../src/components/replay/race/racePoseCache.js';

const channel = (name: typeof RACE_POSE_CHANNELS[number]) => RACE_POSE_CHANNELS.indexOf(name);

/** Car slot 7 over two samples at 10 Hz from 100 s: speed 200 → 220 km/h, third gear, TC on, limiter lit. */
function poseWindow(): RacePoseWindow {
  const data = new Float32Array(2 * RACE_POSE_CHANNEL_COUNT).fill(0);
  [200, 220].forEach((speed, sample) => {
    const base = sample * RACE_POSE_CHANNEL_COUNT;
    data[base + channel('speedKmh')] = speed;
    data[base + channel('throttle')] = 100;
    data[base + channel('steerYaw')] = 0.25;
    data[base + channel('gear')] = 3;
    data[base + channel('accelLatG')] = 0.6;
    data[base + channel('accelLonG')] = 0.8;
    data[base + channel('aids')] = RACE_AID.tcActive;
    data[base + channel('lamps')] = RACE_LAMP.pitLimiter;
  });
  return { fromSec: 100, hz: 10, count: 2, slots: [7], data };
}

describe('racePosePoint', () => {
  it('reads the followed car\'s pose as a lap sample', () => {
    const point = racePosePoint(poseWindow(), 7, 100.05);
    expect(point).toMatchObject({ speedKmh: 210, throttle: 100, steerYaw: 67.5, gear: 3, tcActive: true, absActive: false, pitLimiter: true, inPit: false });
    expect(point?.accelLatG).toBeCloseTo(0.6, 5);
  });

  it('has no reading without the car, its window or a pose then', () => {
    expect(racePosePoint(poseWindow(), 8, 100)).toBeNull();
    expect(racePosePoint(null, 7, 100)).toBeNull();
    expect(racePosePoint(poseWindow(), 7, 200)).toBeNull();
    expect(racePosePoint(poseWindow(), null, 100)).toBeNull();
  });
});

describe('RaceCarHud', () => {
  const poses = (window: RacePoseWindow | null) => ({ windowAt: () => window }) as unknown as RacePoseCache;

  it('shows the followed car\'s readings named by its number', () => {
    const clock = createRaceClock(0, 300, 100);
    render(<RaceCarHud clock={clock} poses={poses(poseWindow())} followSlot={7} car={{ slot: 7, name: 'Driver', carNumber: '4' }} />);
    expect(screen.getByText('#4')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getByTitle('Selected gear')).toHaveTextContent('GEAR3');
    expect(screen.getByText('1.00G')).toBeTruthy();
    expect(screen.getByText('25.0% L')).toBeTruthy();
    clock.dispose();
  });

  it('keeps its place with dashes while the car has no pose', () => {
    const clock = createRaceClock(0, 300, 100);
    render(<RaceCarHud clock={clock} poses={poses(null)} followSlot={7} />);
    expect(screen.getByTestId('gps-map-telemetry-hud')).toBeTruthy();
    expect(screen.getByTitle('Selected gear')).toHaveTextContent('GEAR--');
    clock.dispose();
  });
});
