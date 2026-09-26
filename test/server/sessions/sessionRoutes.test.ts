import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSessionRouter,
  filterSessions,
  parseSessionFilters,
} from '../../../server/routes/sessionRoutes.js';
import { DetailedSession } from '../../../server/core/types.js';
import { ServerContext } from '../../../server/core/serverContext.js';

describe('sessionRoutes and filterSessions', () => {
  const mockSessions: DetailedSession[] = [
    {
      id: 'sess_1',
      filename: 'sess_1.xml',
      filePath: '/path/1',
      trackVenue: 'Spa',
      trackCourse: 'GP',
      trackEvent: '',
      trackLengthMeters: 7004,
      timeString: '2026/05/28 14:00',
      timestamp: 1000,
      sessionType: 'Practice',
      sessionName: 'P1',
      driversCount: 1,
      drivers: [
        {
          name: 'Driver Alpha',
          isPlayer: true,
          carType: 'Ferrari 499P',
          carClass: 'Hypercar',
          carNumber: '50',
          teamName: 'AF',
          position: 1,
          classPosition: 1,
          bestLapTime: 120.0,
          bestLapTimeString: '2:00.000',
          bestS1: 30,
          bestS2: 45,
          bestS3: 45,
          theoreticalBest: 120.0,
          theoreticalBestString: '2:00.000',
          lapsCount: 2,
          laps: [
            { lapNum: 1, position: 1, lapTime: 120.0, lapTimeString: '2:00.000', s1: 30, s2: 45, s3: 45, topSpeed: 300, fCompound: 'Hard', rCompound: 'Hard', isValid: true, isPitStop: false },
          ],
        },
      ],
      playerDriver: {
        name: 'Driver Alpha',
        isPlayer: true,
        carType: 'Ferrari 499P',
        carClass: 'Hypercar',
        carNumber: '50',
        teamName: 'AF',
        position: 1,
        classPosition: 1,
        bestLapTime: 120.0,
        bestLapTimeString: '2:00.000',
        bestS1: 30,
        bestS2: 45,
        bestS3: 45,
        theoreticalBest: 120.0,
        theoreticalBestString: '2:00.000',
        lapsCount: 2,
        laps: [],
      },
    },
    {
      id: 'sess_2',
      filename: 'sess_2.xml',
      filePath: '/path/2',
      trackVenue: 'Monza',
      trackCourse: 'GP',
      trackEvent: '',
      trackLengthMeters: 5793,
      timeString: '2026/05/29 14:00',
      timestamp: 2000,
      sessionType: 'Qualifying',
      sessionName: 'Q1',
      driversCount: 1,
      drivers: [
        {
          name: 'Driver Beta',
          isPlayer: false,
          carType: 'Porsche 963',
          carClass: 'Hypercar',
          carNumber: '5',
          teamName: 'Penske',
          position: 1,
          classPosition: 1,
          bestLapTime: 96.0,
          bestLapTimeString: '1:36.000',
          bestS1: 27,
          bestS2: 38,
          bestS3: 31,
          theoreticalBest: 96.0,
          theoreticalBestString: '1:36.000',
          lapsCount: 3,
          laps: [
            { lapNum: 1, position: 1, lapTime: 96.0, lapTimeString: '1:36.000', s1: 27, s2: 38, s3: 31, topSpeed: 330, fCompound: 'Medium', rCompound: 'Medium', isValid: true, isPitStop: false },
          ],
        },
      ],
      playerDriver: undefined,
    },
    {
      id: 'sess_empty',
      filename: 'sess_empty.xml',
      filePath: '/path/empty',
      trackVenue: 'Bahrain',
      trackCourse: 'Grand Prix',
      trackEvent: '',
      trackLengthMeters: 5412,
      timeString: '2026/05/30 14:00',
      timestamp: 3000,
      sessionType: 'Practice',
      sessionName: 'P2',
      driversCount: 0,
      drivers: [],
      playerDriver: undefined,
    },
  ];

  describe('parseSessionFilters', () => {
    it('parses valid query parameters into SessionFilterOptions', () => {
      const filters = parseSessionFilters({
        track: 'Spa',
        car: 'Ferrari',
        carClass: 'Hypercar',
        driver: 'Alpha',
        sessionType: 'Practice',
        hideEmpty: 'true',
      });

      expect(filters.track).toBe('Spa');
      expect(filters.car).toBe('Ferrari');
      expect(filters.carClass).toBe('Hypercar');
      expect(filters.driver).toBe('Alpha');
      expect(filters.sessionType).toBe('Practice');
      expect(filters.hideEmpty).toBe(true);
    });

    it('handles filterEmpty alias and undefined fields', () => {
      const filters = parseSessionFilters({ filterEmpty: 'true' });
      expect(filters.hideEmpty).toBe(true);
      expect(filters.track).toBeUndefined();
    });
  });

  describe('filterSessions', () => {
    it('filters out empty sessions when hideEmpty is true', () => {
      const result = filterSessions(mockSessions, { hideEmpty: true });
      expect(result).toHaveLength(2);
      expect(result.some(s => s.id === 'sess_empty')).toBe(false);
    });

    it('filters sessions by track matching', () => {
      const result = filterSessions(mockSessions, { track: 'Spa' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sess_1');
    });

    it('filters sessions by sessionType matching', () => {
      const result = filterSessions(mockSessions, { sessionType: 'Qualifying' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sess_2');
    });

    it('filters sessions by driver name', () => {
      const result = filterSessions(mockSessions, { driver: 'Beta' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sess_2');
    });

    it('filters sessions by car model substring', () => {
      const result = filterSessions(mockSessions, { car: 'Ferrari' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sess_1');
    });

    it('ignores "All" sentinel values across all filter fields', () => {
      const result = filterSessions(mockSessions, {
        track: 'All',
        car: 'All',
        carClass: 'All',
        driver: 'All',
        sessionType: 'All',
      });
      expect(result).toHaveLength(3);
    });
  });

  describe('createSessionRouter integration', () => {
    let app: express.Express;

    beforeEach(() => {
      const context = {
        loadSessions: () => mockSessions,
      } as unknown as ServerContext;

      app = express();
      app.use('/api', createSessionRouter(context));
    });

    it('GET /api/sessions returns filtered sessions metadata without drivers payload', async () => {
      const res = await request(app).get('/api/sessions?track=Spa');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('sess_1');
      expect(res.body[0].drivers).toBeUndefined();
    });

    it('GET /api/progression applies shared session filters and computes progression', async () => {
      const res = await request(app).get('/api/progression?track=Spa&driver=Driver Alpha');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].sessionId).toBe('sess_1');
      expect(res.body[0].driverName).toBe('Driver Alpha');
    });
  });
});
