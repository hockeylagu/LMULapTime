import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseReplayMetadata } from '../../../server/replay/replayParser.js';
import { extractReplayTrajectory } from '../../../server/replay/replayTrajectory.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';

describe('replayWeather - Class 1 Type 10 meteorology decoding', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-vcr-weather-test-'));

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('identifies dry conditions when no rain packets are present', () => {
    const filePath = path.join(tempDir, 'dry_session.vcr');
    const buf = createSliceVcrBuffer({
      trackName: 'Sebring_Dry',
      slices: [
        { sTime: 10.0, driverSlot: 1, x: 10.0, y: 0.0, z: 10.0, throttle: 100, brake: 0 },
        { sTime: 10.1, driverSlot: 1, x: 20.0, y: 0.0, z: 20.0, throttle: 100, brake: 0 },
      ],
    });
    fs.writeFileSync(filePath, buf);

    const meta = parseReplayMetadata(filePath);
    expect(meta.hasRain).toBe(false);
    expect(meta.maxRainIntensity).toBeUndefined();
    expect(meta.weatherCondition).toBe('Dry');

    const traj = extractReplayTrajectory(filePath, { driverSlot: 1 });
    expect(traj.weatherCondition).toBe('Dry');
    expect(traj.weatherEvents).toBeUndefined();
    expect(traj.points[0].rainIntensity).toBeUndefined();
  });

  it('decodes ambient temperature and heavy rain from Class 1 Type 10 packets', () => {
    const filePath = path.join(tempDir, 'wet_session.vcr');
    const buf = createSliceVcrBuffer({
      trackName: 'Sebring_Wet',
      slices: [
        {
          sTime: 10.0,
          driverSlot: 1,
          x: 10.0,
          y: 0.0,
          z: 10.0,
          throttle: 50,
          brake: 20,
          weather: { ambientTemp: 22.0, trackTemp: 27.3, rainIntensity: 18 },
        },
        {
          sTime: 10.1,
          driverSlot: 1,
          x: 15.0,
          y: 0.0,
          z: 15.0,
          throttle: 40,
          brake: 0,
        },
      ],
    });
    fs.writeFileSync(filePath, buf);

    const meta = parseReplayMetadata(filePath);
    expect(meta.hasRain).toBe(true);
    expect(meta.maxRainIntensity).toBe(18);
    expect(meta.weatherCondition).toBe('Wet');
    expect(meta.ambientTemp).toBeCloseTo(22.0, 0);
    expect(meta.trackTemp).toBeCloseTo(27.3, 0);

    const traj = extractReplayTrajectory(filePath, { driverSlot: 1 });
    expect(traj.weatherCondition).toBe('Wet');
    expect(traj.maxRainIntensity).toBe(18);
    expect(traj.ambientTemp).toBeCloseTo(22.0, 0);
    expect(traj.trackTemp).toBeCloseTo(27.3, 0);
    expect(traj.weatherEvents).toBeDefined();
    expect(traj.weatherEvents?.length).toBeGreaterThan(0);
    expect(traj.weatherEvents?.[0].rainIntensity).toBe(18);
    expect(traj.weatherEvents?.[0].ambientTemp).toBeCloseTo(22.0, 0);
    expect(traj.weatherEvents?.[0].trackTemp).toBeCloseTo(27.3, 0);

    // Verify trajectory points receive weather metrics once broadcast is received
    expect(traj.points[1].rainIntensity).toBe(18);
    expect(traj.points[1].ambientTemp).toBeCloseTo(22.0, 0);
    expect(traj.points[1].trackTemp).toBeCloseTo(27.3, 0);
  });

  it('classifies trace or changing precipitation as Dynamic Weather', () => {
    const filePath = path.join(tempDir, 'dynamic_session.vcr');
    const buf = createSliceVcrBuffer({
      trackName: 'Spa_Dynamic',
      slices: [
        {
          sTime: 5.0,
          driverSlot: 1,
          x: 100.0,
          y: 0.0,
          z: 100.0,
          weather: { ambientTemp: 24.5, rainIntensity: 5 },
        },
      ],
    });
    fs.writeFileSync(filePath, buf);

    const meta = parseReplayMetadata(filePath);
    expect(meta.hasRain).toBe(true);
    expect(meta.maxRainIntensity).toBe(5);
    expect(meta.weatherCondition).toBe('Dynamic Weather');

    const traj = extractReplayTrajectory(filePath, { driverSlot: 1 });
    expect(traj.weatherCondition).toBe('Dynamic Weather');
    expect(traj.maxRainIntensity).toBe(5);
  });
});
