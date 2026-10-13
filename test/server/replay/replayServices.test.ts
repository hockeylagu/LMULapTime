import { describe, expect, it, vi } from 'vitest';
import { dataPlugin } from '../../../server/plugins/dataPlugin.js';
import {
  cloneReplayMetadata,
  composeReplayMetadata,
} from '../../../server/replay/replayMetadataService.js';
import {
  applyPureOfficialLapValidation,
  downsampleTrajectoryResponse,
} from '../../../server/replay/decode/replayTransforms.js';
import {
  DetailedSession,
  DriverData,
  ReplayMetadata,
  ReplayTrajectoryData,
} from '../../../shared/types/index.js';
import { computeLapConsistencyStats } from '../../../src/utils/lapConsistency.js';

describe('Replay domain services and transforms', () => {
  describe('cloneReplayMetadata & composeReplayMetadata', () => {
    it('clones metadata deeply so cached original is not mutated', () => {
      const original: ReplayMetadata = {
        filename: 'Test_P1.Vcr',
        filePath: '/path/Test_P1.Vcr',
        fileSizeBytes: 1000,
        mtimeMs: 123456,
        timeSliceCount: 10,
        totalEvents: 1,
        durationSec: 10,
        drivers: [
          { slot: 1, name: 'Driver A', isPlayer: true, carClass: 'GTE' },
          { slot: 2, name: 'Driver B', isPlayer: false, carClass: 'LMP2' },
        ],
        laps: [{ lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
      };

      const cloned = cloneReplayMetadata(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.drivers).not.toBe(original.drivers);
      expect(cloned.drivers[0]).not.toBe(original.drivers[0]);
      if (cloned.laps && original.laps) {
        expect(cloned.laps).not.toBe(original.laps);
        expect(cloned.laps[0]).not.toBe(original.laps[0]);
      }

      // Mutating clone does not affect original
      cloned.trackVenue = 'Mutated Venue';
      cloned.drivers[0].carClass = 'Hyper';
      expect(original.trackVenue).toBeUndefined();
      expect(original.drivers[0].carClass).toBe('GTE');
    });

    it('overlays XML session details without modifying original metadata', () => {
      const original: ReplayMetadata = {
        filename: 'Monza_P1.Vcr',
        filePath: '/replays/Monza_P1.Vcr',
        fileSizeBytes: 2000,
        mtimeMs: 5000,
        timeSliceCount: 50,
        totalEvents: 2,
        durationSec: 60,
        drivers: [{ slot: 1, name: 'Original Player', isPlayer: true }],
      };

      const ann = {
        name: 'Original Player',
        carClass: 'Hyper',
        carType: 'Toyota GR010',
        bestLapTime: 91.2,
        laps: [
          { lapNumber: 1, lapTime: 91.2, s1: 30.1, s2: 30.2, s3: 30.9, isValid: true },
        ],
      };
      const session = {
        id: 'session-monza',
        trackVenue: 'Autodromo Nazionale Monza',
        trackCourse: 'Grand Prix',
        sessionType: 'Practice',
        drivers: [ann],
        playerDriver: ann,
      } as unknown as DetailedSession;

      const composed = composeReplayMetadata({
        metadata: original,
        replayName: 'Monza_P1.Vcr',
        matchedSession: session,
      });

      expect(composed.displayTrack).toBe('Autodromo Nazionale Monza');
      expect(composed.carClass).toBe('Hyper');
      expect(composed.carType).toBe('Toyota GR010');
      expect(composed.laps).toHaveLength(1);
      expect(composed.laps?.[0].isBest).toBe(true);

      // Verify original is pristine
      expect(original.carClass).toBeUndefined();
      expect(original.laps).toBeUndefined();
      expect(original.trackVenue).toBeUndefined();
    });

    it('takes each roster car from the linked session log, matched by driver name', () => {
      const original: ReplayMetadata = {
        filename: 'Monza R1 15.Vcr',
        filePath: '/replays/Monza R1 15.Vcr',
        fileSizeBytes: 2000,
        mtimeMs: 5000,
        timeSliceCount: 50,
        totalEvents: 2,
        durationSec: 60,
        drivers: [
          { slot: 0, name: 'Samuel Lague', vehicleId: '4_25_DKR_E8E7FBE8C', carType: 'Oreca 07 LMP2', carClass: 'LMP2', isPlayer: true },
          { slot: 1, name: 'Jules Wadoux', vehicleId: 'NEW_LIVERY_2027' },
        ],
      };
      const session = {
        id: 'session-monza-r1',
        trackVenue: 'Autodromo Nazionale Monza',
        trackCourse: 'Grand Prix',
        sessionType: 'Race',
        drivers: [
          { name: 'Samuel Lague', carClass: 'LMP3', carType: 'Ginetta G61-LT-P325 Evo', laps: [] },
          { name: 'Jules Wadoux', carClass: 'LMP3', carType: 'Duqueine D09 P3', laps: [] },
        ],
      } as unknown as DetailedSession;

      const composed = composeReplayMetadata({ metadata: original, replayName: 'Monza R1 15.Vcr', matchedSession: session });

      expect(composed.drivers.map(driver => [driver.carType, driver.carClass])).toEqual([
        ['Ginetta G61-LT-P325 Evo', 'LMP3'],
        ['Duqueine D09 P3', 'LMP3'],
      ]);
      expect(original.drivers[0].carClass).toBe('LMP2');
    });

    it('keeps the session car name when the data package names the car differently, taking only the class from the package', () => {
      const metadata: ReplayMetadata = {
        filename: 'Spa R1 1.Vcr', filePath: '/replays/Spa R1 1.Vcr', fileSizeBytes: 2000, mtimeMs: 5000,
        timeSliceCount: 50, totalEvents: 2, durationSec: 60,
        drivers: [{ slot: 0, name: 'Ann', vehicleId: 'GENESIS_1', carType: 'Genesis GMR-001', carClass: 'Hyper' }],
      };
      const session = {
        id: 'session-genesis', trackVenue: 'Spa', trackCourse: 'Grand Prix', sessionType: 'Race',
        drivers: [{ name: 'Ann', carType: 'Genesis GMR001', carClass: 'Hyper', laps: [] }],
      } as unknown as DetailedSession;
      const vehicle = vi.spyOn(dataPlugin, 'vehicle').mockReturnValue({
        model: 'Genesis GMR-001', carClass: 'Hyper',
      } as unknown as NonNullable<ReturnType<typeof dataPlugin.vehicle>>);
      try {
        const composed = composeReplayMetadata({ metadata, replayName: metadata.filename, matchedSession: session });
        expect(composed.drivers[0].carType).toBe('Genesis GMR001');
        expect(composed.drivers[0].carClass).toBe('Hyper');
      } finally {
        vehicle.mockRestore();
      }
    });

    it('composes player metadata only from the uniquely marked configured participant', () => {
      const metadata: ReplayMetadata = {
        filename: 'Practice.Vcr', filePath: '/replays/Practice.Vcr', fileSizeBytes: 2000, mtimeMs: 5000,
        timeSliceCount: 50, totalEvents: 2, durationSec: 60,
        carType: 'Joann car', carClass: 'GT3',
        drivers: [
          { slot: 1, name: 'Joann', carType: 'Joann car', carClass: 'GT3', isPlayer: false },
          { slot: 2, name: 'Ann', carType: 'Ann car', carClass: 'Hyper', isPlayer: true },
        ],
      };
      const session = {
        id: 'session-ann', trackVenue: 'Spa', trackCourse: 'Grand Prix', sessionType: 'Practice',
        drivers: [{ name: 'Ann', carType: 'Ann car', carClass: 'Hyper', bestLapTime: 90, laps: [
          { lapNumber: 1, lapTime: 90, s1: 30, s2: 30, s3: 30, isValid: true },
        ] }],
        playerDriver: { name: 'Ann', carType: 'Ann car', carClass: 'Hyper', bestLapTime: 90, laps: [
          { lapNumber: 1, lapTime: 90, s1: 30, s2: 30, s3: 30, isValid: true },
        ] },
      } as unknown as DetailedSession;

      const composed = composeReplayMetadata({ metadata, replayName: metadata.filename, matchedSession: session });

      expect(composed.carType).toBe('Ann car');
      expect(composed.carClass).toBe('Hyper');
      expect(composed.laps?.map(lap => lap.lapNumber)).toEqual([1]);
      expect(metadata.carType).toBe('Joann car');
    });

    it('falls back to filename track tokens when no matched session exists', () => {
      const original: ReplayMetadata = {
        filename: 'Spa-Francorchamps P1.Vcr',
        filePath: '/replays/Spa-Francorchamps P1.Vcr',
        fileSizeBytes: 2000,
        mtimeMs: 5000,
        timeSliceCount: 50,
        totalEvents: 2,
        durationSec: 60,
        drivers: [],
      };

      const composed = composeReplayMetadata({
        metadata: original,
        replayName: 'Spa-Francorchamps P1.Vcr',
      });

      expect(composed.displayTrack).toBe('Spa-Francorchamps');
      expect(composed.trackCourse).toBe('Spa-Francorchamps');
    });
  });

  describe('replayTransforms', () => {
    it('downsampleTrajectoryResponse creates a cloned copy without modifying original', () => {
      const original = {
        replayName: 'Test.Vcr',
        bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
        source: 'vcr',
        points: [
          { x: 0, y: 0, z: 0, speedKmh: 100 },
          { x: 1, y: 0, z: 1, speedKmh: 110 },
          { x: 2, y: 0, z: 2, speedKmh: 120 },
          { x: 3, y: 0, z: 3, speedKmh: 130 },
        ],
        pointsCount: 4,
        vcrRawPointsCount: 4,
        sectors: { s1Frame: 1, s2Frame: 2 },
      } as unknown as ReplayTrajectoryData;

      const downsampled = downsampleTrajectoryResponse(original, 2);
      expect(downsampled.points).toHaveLength(2);
      expect(downsampled.isFullResolution).toBe(false);
      expect(original.points).toHaveLength(4);
      expect(original.isFullResolution).toBeUndefined();
    });

    it('applyPureOfficialLapValidation does not mutate input trajectory laps', () => {
      const originalLap = { lapNumber: 1, lapTimeSec: 90.0, s1Sec: 30.0, s2Sec: 30.0, s3Sec: 30.0 };
      const original = {
        replayName: 'Test.Vcr',
        bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
        source: 'vcr',
        points: [{ x: 0, y: 0, z: 0 }],
        pointsCount: 1,
        laps: [originalLap],
      } as unknown as ReplayTrajectoryData;

      const session = {
        id: 'sess-val',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        sessionType: 'Qualifying',
        drivers: [],
      } as unknown as DetailedSession;

      const driver = {
        name: 'Official Driver',
        bestLapTime: 89.5,
        laps: [{ lapNumber: 1, lapTime: 89.5, s1: 29.8, s2: 30.0, s3: 29.7, isValid: true }],
      } as unknown as DriverData;

      const validated = applyPureOfficialLapValidation(original, session, driver);
      expect(validated.laps?.[0].validatedTimeSec).toBe(89.5);
      expect(validated.laps?.[0].timeDiffSec).toBe(0.5);
      expect(validated.validation?.driverName).toBe('Official Driver');

      // Verify original lap was not mutated
      expect(originalLap).not.toHaveProperty('validatedTimeSec');
      expect(originalLap).not.toHaveProperty('timeDiffSec');
    });

    it('uses parser classification for pit, out and invalid laps even when replay flags disagree', () => {
      const original: ReplayTrajectoryData = { replayName: 'Validation.Vcr', pointsCount: 1,
        bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1 },
        points: [{ x: 0, y: 0, z: 0 }],
        laps: [1, 2, 3, 4].map(lapNumber => ({ lapNumber, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30, isValid: true, isBest: lapNumber === 1 })) };
      const driver = { name: 'Official', laps: [
        { lapNumber: 1, lapTime: 90, isValid: true, isPitStop: true },
        { lapNumber: 2, lapTime: 90, isValid: true, isOutLap: true },
        { lapNumber: 3, lapTime: null, isValid: false },
        { lapNumber: 4, lapTime: 90, isValid: true },
      ] } as unknown as DriverData;
      const result = applyPureOfficialLapValidation(original, { id: 'official', trackVenue: 'Monza', trackCourse: 'GP' } as DetailedSession, driver);
      expect(result.laps?.[0]).toMatchObject({ isPitStop: true, isBest: false });
      expect(result.laps?.[1].isOutLap).toBe(true);
      expect(result.laps?.[2].isValid).toBe(false);
      expect(computeLapConsistencyStats(result.laps).lapCount).toBe(1);
      expect(original.laps?.[0].isPitStop).toBeUndefined();
    });
  });
});
