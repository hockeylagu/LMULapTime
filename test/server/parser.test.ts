import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LmuParser, computeProgression, computeTrackSummaries, getDisplayTrackName, extractComparableLaps } from '../../server/parser';
import { DetailedSession } from '../../server/types';
import fs from 'fs';

const samplePracticeXml = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Circuit de Spa-Francorchamps</TrackVenue>
    <TrackCourse>GP</TrackCourse>
    <TrackLength>7004</TrackLength>
    <TimeString>2026/05/28 14:30</TimeString>
    <DateTime>1780000000</DateTime>
    <Practice1>
      <Driver>
        <Name>Sim Racer</Name>
        <isPlayer>1</isPlayer>
        <CarType>Ferrari 499P</CarType>
        <CarClass>Hypercar</CarClass>
        <CarNumber>50</CarNumber>
        <TeamName>Ferrari AF Corse</TeamName>
        <Position>1</Position>
        <ClassPosition>1</ClassPosition>
        <BestLapTime>122.450</BestLapTime>
        <Lap num="1" p="1" s1="35.100" s2="42.200" s3="45.150" topspeed="320.5" fcompound="Hard" rcompound="Hard">122.450</Lap>
        <Lap num="2" p="1" s1="34.900" s2="42.100" s3="45.000" topspeed="322.0" fcompound="Hard" rcompound="Hard">122.000</Lap>
        <Lap num="3" p="1" pit="1" s1="36.000" s2="45.000" s3="50.000">131.000</Lap>
      </Driver>
      <Driver>
        <Name>AI Driver</Name>
        <isPlayer>0</isPlayer>
        <CarType>Porsche 963</CarType>
        <CarClass>Hypercar</CarClass>
        <CarNumber>5</CarNumber>
        <Position>2</Position>
        <BestLapTime>123.100</BestLapTime>
        <Lap num="1" p="2" s1="35.500" s2="42.500" s3="45.100">123.100</Lap>
      </Driver>
    </Practice1>
  </RaceResults>
</rFactorXML>`;

const sampleQualifyingXml = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Autodromo Nazionale Monza</TrackVenue>
    <TrackCourse>Curva Grande</TrackCourse>
    <TimeString>2026/05/29 21:00</TimeString>
    <DateTime>1780050000</DateTime>
    <Qualify>
      <Driver>
        <Name>Sim Racer</Name>
        <isPlayer>1</isPlayer>
        <CarType>Porsche 911 GT3 R</CarType>
        <CarClass>LMGT3</CarClass>
        <BestLapTime>108.500</BestLapTime>
        <Lap num="1" p="1" s1="28.100" s2="38.200" s3="42.200" fcompound="Wet" rcompound="Wet">108.500</Lap>
      </Driver>
    </Qualify>
  </RaceResults>
</rFactorXML>`;

const sampleRaceXml = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Circuit Paul Ricard</TrackVenue>
    <TrackCourse>Paul Ricard - 1A-V2-Short</TrackCourse>
    <TimeString>2026/05/30 08:00</TimeString>
    <DateTime>1780100000</DateTime>
    <Race>
      <Driver>
        <Name>Sim Racer</Name>
        <isPlayer>1</isPlayer>
        <CarType>Oreca 07</CarType>
        <CarClass>LMP2</CarClass>
        <BestLapTime>95.000</BestLapTime>
        <Lap num="1" p="1" s1="25.000" s2="35.000" s3="35.000">95.000</Lap>
      </Driver>
    </Race>
  </RaceResults>
</rFactorXML>`;

describe('parser server module', () => {
  let parser: LmuParser;

  beforeEach(() => {
    parser = new LmuParser();
  });

  describe('LmuParser XML parsing', () => {
    it('returns null for non-existent or invalid XML', () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('File not found');
      });
      expect(parser.parseSessionXml('nonexistent.xml')).toBeNull();
    });

    it('returns null if XML is not an rFactor/LMU session XML', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue('<root><invalid>data</invalid></root>');
      expect(parser.parseSessionXml('invalid.xml')).toBeNull();
    });

    it('parses Practice session accurately with drivers, laps, and theoretical best', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(samplePracticeXml);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date(1780000000 * 1000) } as unknown as fs.Stats);

      const session = parser.parseSessionXml('dummy_practice.xml');
      expect(session).not.toBeNull();
      expect(session?.sessionType).toBe('Practice');
      expect(session?.sessionName).toBe('P1');
      expect(session?.trackVenue).toBe('Circuit de Spa-Francorchamps');
      expect(session?.driversCount).toBe(2);
      expect(session?.bestSessionLap?.lapTimeString).toBe('2:02.000');
      expect(session?.playerDriver?.name).toBe('Sim Racer');
      expect(session?.playerDriver?.isPlayer).toBe(true);
      expect(session?.playerDriver?.laps.length).toBe(3);
      expect(session?.playerDriver?.bestLapTime).toBe(122.000);
      expect(session?.playerDriver?.bestS1).toBe(34.900);
      expect(session?.playerDriver?.theoreticalBest).toBe(122.000);
      expect(session?.playerDriver?.laps[2].isPitStop).toBe(true);
    });

    it('parses Qualifying session and does not infer weather from tire compounds', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(sampleQualifyingXml);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('dummy_qual.xml');
      expect(session?.sessionType).toBe('Qualifying');
      expect(session?.sessionName).toBe('Q1');
      expect(session?.weather).toBeUndefined();
    });

    it('parses Race session and does not infer weather from tire compounds', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(sampleRaceXml);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('dummy_race.xml');
      expect(session?.sessionType).toBe('Race');
      expect(session?.sessionName).toBe('R1');
      expect(session?.weather).toBeUndefined();
    });

    it('parses weather when explicit Weather tag is present in XML', () => {
      const xmlWithWeather = sampleQualifyingXml.replace('</RaceResults>', '<Weather>Wet</Weather></RaceResults>');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlWithWeather);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('dummy_qual_weather.xml');
      expect(session?.weather?.condition).toBe('Wet');
      expect(session?.weather?.timeOfDay).toBe('Night');
    });

    it('infers session type from filename suffix if xml node is generic', () => {
      const genericXml = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Spa</TrackVenue>
    <Driver><Name>Racer</Name></Driver>
  </RaceResults>
</rFactorXML>`;
      vi.spyOn(fs, 'readFileSync').mockReturnValue(genericXml);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const sessionP = parser.parseSessionXml('2026_01_01_12_00_00-01P1.xml');
      expect(sessionP?.sessionType).toBe('Practice');

      const sessionQ = parser.parseSessionXml('2026_01_01_12_00_00-01Q2.xml');
      expect(sessionQ?.sessionType).toBe('Qualifying');

      const sessionR = parser.parseSessionXml('2026_01_01_12_00_00-01R1.xml');
      expect(sessionR?.sessionType).toBe('Race');
    });
  });

  describe('parseWeather', () => {
    it('returns undefined when no explicit weather data is in the XML', () => {
      expect(parser.parseWeather('2026/05/28 15:00', undefined)).toBeUndefined();
      expect(parser.parseWeather('2026/05/28 15:00', '')).toBeUndefined();
    });

    it('parses explicit XML weather data when provided', () => {
      const wetWeather = parser.parseWeather('2026/05/28 15:00', 'Wet');
      expect(wetWeather).toBeDefined();
      expect(wetWeather?.condition).toBe('Wet');
      expect(wetWeather?.timeOfDay).toBe('Daytime');
      expect(wetWeather?.weatherString).toContain('Wet');

      const evening = parser.parseWeather('2026/05/28 19:30', 'Clear');
      expect(evening?.timeOfDay).toBe('Evening');

      const morning = parser.parseWeather('2026/05/28 07:00', 'Dry');
      expect(morning?.timeOfDay).toBe('Morning');

      const night = parser.parseWeather('2026/05/28 23:00', 'Rain');
      expect(night?.timeOfDay).toBe('Night');
      expect(night?.weatherString).toContain('Rain');
    });
  });

  describe('replay indexing and matching', () => {
    it('indexes replay directory and matches session', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['Circuit de Spa-Francorchamps P1 78.Vcr'] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1048576, mtime: new Date(1780000000 * 1000) } as unknown as fs.Stats);

      const p = new LmuParser('C:\\Replays');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(samplePracticeXml);

      const session = p.parseSessionXml('practice.xml');
      expect(session?.matchingReplayFile).toBeDefined();
      expect(session?.matchingReplayFile?.name).toBe('Circuit de Spa-Francorchamps P1 78.Vcr');
    });

    it('accurately matches Monza Curva Grande and does not match standard Monza GP replay', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'Autodromo Nazionale Monza Q1 6.Vcr',
        'Monza Curva Grande Circuit Q1 3.Vcr',
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      vi.spyOn(fs, 'statSync').mockImplementation((p: fs.PathLike) => {
        const str = String(p);
        if (str.includes('Curva Grande')) {
          return { size: 1048576, mtime: new Date(1780050000 * 1000) } as unknown as fs.Stats;
        }
        return { size: 1048576, mtime: new Date(1780050010 * 1000) } as unknown as fs.Stats;
      });

      const p = new LmuParser('C:\\Replays');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(sampleQualifyingXml);

      const session = p.parseSessionXml('monza_cg.xml');
      expect(session?.matchingReplayFile).toBeDefined();
      expect(session?.matchingReplayFile?.name).toBe('Monza Curva Grande Circuit Q1 3.Vcr');
    });

    it('accurately matches Paul Ricard Short and does not match full layout replay', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'Circuit Paul Ricard R1 5.Vcr',
        'Paul Ricard - 1A-V2-Short R1 1.Vcr',
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      vi.spyOn(fs, 'statSync').mockImplementation((p: fs.PathLike) => {
        const str = String(p);
        if (str.includes('Short')) {
          return { size: 1048576, mtime: new Date(1780100000 * 1000) } as unknown as fs.Stats;
        }
        return { size: 1048576, mtime: new Date(1780100010 * 1000) } as unknown as fs.Stats;
      });

      const p = new LmuParser('C:\\Replays');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(sampleRaceXml);

      const session = p.parseSessionXml('pr_short.xml');
      expect(session?.matchingReplayFile).toBeDefined();
      expect(session?.matchingReplayFile?.name).toBe('Paul Ricard - 1A-V2-Short R1 1.Vcr');
    });

    it('accurately matches Bahrain Outer and Bahrain Paddock without cross-matching', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'Bahrain International Circuit P1 14.Vcr',
        'Bahrain Outer Circuit P1 19.Vcr',
        'Bahrain Paddock Circuit P1 18.Vcr',
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      const outerXml = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Bahrain International Circuit</TrackVenue>
    <TrackCourse>Bahrain Outer Circuit</TrackCourse>
    <TimeString>2026/08/10 09:00</TimeString>
    <DateTime>1786350000</DateTime>
    <Practice1>
      <Driver>
        <Name>Sim Racer</Name>
        <isPlayer>1</isPlayer>
        <CarType>Ferrari 499P</CarType>
        <CarClass>Hypercar</CarClass>
        <BestLapTime>54.200</BestLapTime>
        <Lap num="1" p="1" s1="15.000" s2="20.000" s3="19.200">54.200</Lap>
      </Driver>
    </Practice1>
  </RaceResults>
</rFactorXML>`;

      const paddockXml = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Bahrain International Circuit</TrackVenue>
    <TrackCourse>Bahrain Paddock Circuit</TrackCourse>
    <TimeString>2026/08/12 18:50</TimeString>
    <DateTime>1786550000</DateTime>
    <Practice1>
      <Driver>
        <Name>Sim Racer</Name>
        <isPlayer>1</isPlayer>
        <CarType>Ferrari 499P</CarType>
        <CarClass>Hypercar</CarClass>
        <BestLapTime>62.100</BestLapTime>
        <Lap num="1" p="1" s1="18.000" s2="22.000" s3="22.100">62.100</Lap>
      </Driver>
    </Practice1>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'statSync').mockImplementation((p: fs.PathLike) => {
        const str = String(p);
        if (str.includes('Outer')) {
          return { size: 1048576, mtime: new Date(1786350000 * 1000) } as unknown as fs.Stats;
        }
        if (str.includes('Paddock')) {
          return { size: 1048576, mtime: new Date(1786550000 * 1000) } as unknown as fs.Stats;
        }
        return { size: 1048576, mtime: new Date(1786350005 * 1000) } as unknown as fs.Stats;
      });

      const p = new LmuParser('C:\\Replays');

      vi.spyOn(fs, 'readFileSync').mockReturnValue(outerXml);
      const outerSession = p.parseSessionXml('bahrain_outer.xml');
      expect(outerSession?.matchingReplayFile).toBeDefined();
      expect(outerSession?.matchingReplayFile?.name).toBe('Bahrain Outer Circuit P1 19.Vcr');

      vi.spyOn(fs, 'readFileSync').mockReturnValue(paddockXml);
      const paddockSession = p.parseSessionXml('bahrain_paddock.xml');
      expect(paddockSession?.matchingReplayFile).toBeDefined();
      expect(paddockSession?.matchingReplayFile?.name).toBe('Bahrain Paddock Circuit P1 18.Vcr');
    });
  });

  describe('computeProgression', () => {
    it('computes chronological progression points for sessions', () => {
      const mockSessions: DetailedSession[] = [
        {
          id: 'sess2',
          filename: 'sess2.xml',
          filePath: '/path/2',
          trackVenue: 'Spa',
          trackCourse: 'GP',
          trackEvent: '',
          trackLengthMeters: 7004,
          timeString: '2026/05/29 14:00',
          timestamp: 2000,
          sessionType: 'Qualifying',
          sessionName: 'Q1',
          driversCount: 1,
          drivers: [
            {
              name: 'Player',
              isPlayer: true,
              carType: 'Ferrari 499P',
              carClass: 'LMH',
              carNumber: '50',
              teamName: 'AF',
              position: 1,
              classPosition: 1,
              bestLapTime: 120.0,
              bestLapTimeString: '2:00.000',
              bestS1: 34.0,
              bestS2: 41.0,
              bestS3: 45.0,
              theoreticalBest: 120.0,
              theoreticalBestString: '2:00.000',
              lapsCount: 2,
              laps: [
                { lapNum: 1, position: 1, lapTime: 121.0, lapTimeString: '2:01.000', s1: 34, s2: 42, s3: 45, topSpeed: 320, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
                { lapNum: 2, position: 1, lapTime: 120.0, lapTimeString: '2:00.000', s1: 34, s2: 41, s3: 45, topSpeed: 322, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
              ],
            },
          ],
          playerDriver: undefined,
        },
        {
          id: 'sess1',
          filename: 'sess1.xml',
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
              name: 'Player',
              isPlayer: true,
              carType: 'Ferrari 499P',
              carClass: 'LMH',
              carNumber: '50',
              teamName: 'AF',
              position: 1,
              classPosition: 1,
              bestLapTime: 122.0,
              bestLapTimeString: '2:02.000',
              bestS1: 35.0,
              bestS2: 42.0,
              bestS3: 45.0,
              theoreticalBest: 122.0,
              theoreticalBestString: '2:02.000',
              lapsCount: 1,
              laps: [
                { lapNum: 1, position: 1, lapTime: 122.0, lapTimeString: '2:02.000', s1: 35, s2: 42, s3: 45, topSpeed: 320, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
              ],
            },
          ],
          playerDriver: undefined,
        },
      ];

      const progression = computeProgression(mockSessions, 'Player');
      expect(progression.length).toBe(2);
      // Verify chronological order (timestamp 1000 first, 2000 second)
      expect(progression[0].sessionId).toBe('sess1');
      expect(progression[0].bestLapTime).toBe(122.0);
      expect(progression[1].sessionId).toBe('sess2');
      expect(progression[1].bestLapTime).toBe(120.0);
      expect(progression[1].cleanLapsCount).toBe(2);
      expect(progression[1].avgLapTime).toBe(120.0);
      expect(progression[1].top3AvgLapTime).toBe(120.0);
      expect(progression[1].theoreticalGap).toBe(0);
      expect(progression[1].consistencyScore).toBe(99.6);
    });
  });

  describe('computeTrackSummaries', () => {
    it('aggregates sessions and driver bests per track', () => {
      const mockSessions: DetailedSession[] = [
        {
          id: 's1',
          filename: 's1.xml',
          filePath: '',
          trackVenue: 'Spa',
          trackCourse: 'GP',
          trackEvent: '',
          trackLengthMeters: 7004,
          timeString: '2026/05/28',
          timestamp: 1000,
          sessionType: 'Practice',
          sessionName: 'P1',
          driversCount: 1,
          playerDriver: {
            name: 'Player',
            isPlayer: true,
            carType: 'Ferrari 499P',
            carClass: 'LMH',
            carNumber: '50',
            teamName: '',
            position: 1,
            classPosition: 1,
            bestLapTime: 122.0,
            bestLapTimeString: '2:02.000',
            bestS1: 35.0,
            bestS2: 42.0,
            bestS3: 45.0,
            theoreticalBest: 122.0,
            theoreticalBestString: '2:02.000',
            lapsCount: 5,
            laps: [],
          },
          drivers: [],
        },
        {
          id: 's2',
          filename: 's2.xml',
          filePath: '',
          trackVenue: 'Spa',
          trackCourse: 'GP',
          trackEvent: '',
          trackLengthMeters: 7004,
          timeString: '2026/05/29',
          timestamp: 2000,
          sessionType: 'Qualifying',
          sessionName: 'Q1',
          driversCount: 1,
          playerDriver: {
            name: 'Player',
            isPlayer: true,
            carType: 'Porsche 963',
            carClass: 'LMH',
            carNumber: '5',
            teamName: '',
            position: 1,
            classPosition: 1,
            bestLapTime: 120.5,
            bestLapTimeString: '2:00.500',
            bestS1: 34.0,
            bestS2: 41.5,
            bestS3: 45.0,
            theoreticalBest: 120.5,
            theoreticalBestString: '2:00.500',
            lapsCount: 4,
            laps: [],
          },
          drivers: [],
        },
      ];

      const summaries = computeTrackSummaries(mockSessions);
      expect(summaries['Spa']).toBeDefined();
      const spaSummary = summaries['Spa'];
      expect(spaSummary.sessionsCount).toBe(2);
      expect(spaSummary.totalLaps).toBe(9);
      expect(spaSummary.bestLapTime).toBe(120.5);
      expect(spaSummary.bestLapCar).toBe('Porsche 963');
      expect(spaSummary.bestS1).toBe(34.0);
      expect(spaSummary.bestS2).toBe(41.5);
      expect(spaSummary.bestS3).toBe(45.0);
      expect(spaSummary.theoreticalBest).toBe(120.5);
      expect(spaSummary.carsUsed).toEqual(['Ferrari 499P', 'Porsche 963']);
    });
  });

  describe('extractComparableLaps layout isolation', () => {
    it('does not mix Sebring Full and Sebring School laps when filtering', async () => {
      const { extractComparableLaps } = await import('../../server/parser');

      const mockSessions = [
        {
          id: 'sebring_full_1',
          trackVenue: 'Sebring International Raceway',
          trackCourse: '12h',
          sessionType: 'Practice',
          sessionName: 'P1',
          drivers: [
            {
              name: 'Driver 1',
              isPlayer: true,
              carType: 'Porsche 911 GT3 R',
              carClass: 'LMGT3',
              bestLapTime: 121.5,
              laps: [
                { lapNum: 1, lapTime: 121.5, s1: 30.0, s2: 45.0, s3: 46.5, isValid: true, isPitStop: false },
              ],
            },
          ],
        },
        {
          id: 'sebring_school_1',
          trackVenue: 'Sebring International Raceway',
          trackCourse: 'School',
          sessionType: 'Practice',
          sessionName: 'P1',
          drivers: [
            {
              name: 'Driver 1',
              isPlayer: true,
              carType: 'Porsche 911 GT3 R',
              carClass: 'LMGT3',
              bestLapTime: 63.2,
              laps: [
                { lapNum: 1, lapTime: 63.2, s1: 15.0, s2: 24.0, s3: 24.2, isValid: true, isPitStop: false },
              ],
            },
          ],
        },
      ] as unknown as DetailedSession[];

      // Query Full track
      const fullResults = extractComparableLaps(mockSessions, { trackName: 'Sebring International Raceway' });
      expect(fullResults.laps.length).toBe(1);
      expect(fullResults.laps[0].lapTime).toBe(121.5);
      expect(fullResults.allTimeBestLap?.lapTime).toBe(121.5);

      // Query School track
      const schoolResults = extractComparableLaps(mockSessions, { trackName: 'Sebring (school)' });
      expect(schoolResults.laps.length).toBe(1);
      expect(schoolResults.laps[0].lapTime).toBe(63.2);
      expect(schoolResults.allTimeBestLap?.lapTime).toBe(63.2);
    });
  });

  describe('Tire wear and fuel parsing', () => {
    it('parses twfl, twfr, twrl, twrr, corner compounds, and fuel attributes correctly', () => {
      const xmlWithTireWear = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Spa</TrackVenue>
    <Practice1>
      <Driver>
        <Name>Tire Tester</Name>
        <isPlayer>1</isPlayer>
        <CarType>Ferrari 499P</CarType>
        <CarClass>Hypercar</CarClass>
        <Lap num="1" p="1" s1="35.0" s2="42.0" s3="45.0" twfl="0.957" twfr="0.961" twrl="0.957" twrr="0.957" FL="0,Soft" FR="0,Soft" RL="0,Soft" RR="0,Soft" fuel="0.663" fuelUsed="0.024">122.000</Lap>
        <Lap num="2" p="1" s1="34.8" s2="41.9" s3="44.8" twfl="0.933" twfr="0.941" twrl="0.925" twrr="0.937" fcompound="Soft" rcompound="Soft" fuel="0.639" fuelUsed="0.024">121.500</Lap>
      </Driver>
    </Practice1>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlWithTireWear);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('tire_test.xml');
      expect(session).not.toBeNull();
      const laps = session?.drivers[0].laps || [];
      expect(laps.length).toBe(2);

      // Lap 1 checks
      expect(laps[0].tireWear).toBeDefined();
      expect(laps[0].tireWear?.fl).toBe(95.7);
      expect(laps[0].tireWear?.fr).toBe(96.1);
      expect(laps[0].tireWear?.rl).toBe(95.7);
      expect(laps[0].tireWear?.rr).toBe(95.7);
      expect(laps[0].tireWear?.avg).toBe(95.8);
      expect(laps[0].flCompound).toBe('Soft');
      expect(laps[0].fuel).toBe(66.3);
      expect(laps[0].fuelUsed).toBe(2.4);

      // Lap 2 checks
      expect(laps[1].tireWear?.fl).toBe(93.3);
      expect(laps[1].tireWear?.fr).toBe(94.1);
      expect(laps[1].tireWear?.rl).toBe(92.5);
      expect(laps[1].tireWear?.rr).toBe(93.7);
      expect(laps[1].tireWear?.avg).toBe(93.4);
    });

    it('parses Virtual Energy and calculates stint averages for driver', () => {
      const xmlWithVE = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Le Mans</TrackVenue>
    <Practice1>
      <Driver>
        <Name>Hypercar Ace</Name>
        <isPlayer>1</isPlayer>
        <CarType>Ferrari 499P</CarType>
        <CarClass>Hypercar</CarClass>
        <Lap num="1" p="1" s1="40.0" s2="60.0" s3="50.0" fuel="0.900" fuelUsed="0.030" ve="0.950" veUsed="0.040">150.000</Lap>
        <Lap num="2" p="1" s1="39.8" s2="59.8" s3="49.8" fuel="0.870" fuelUsed="0.030" ve="0.910" veUsed="0.040">149.400</Lap>
      </Driver>
    </Practice1>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlWithVE);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('ve_test.xml');
      expect(session).not.toBeNull();
      const driver = session?.drivers[0];
      expect(driver?.laps[0].virtualEnergy).toBe(95.0);
      expect(driver?.laps[0].virtualEnergyUsed).toBe(4.0);
      expect(driver?.avgFuelPerLap).toBe(3.0);
      expect(driver?.estFuelStintLaps).toBe(33);
      expect(driver?.avgVePerLap).toBe(4.0);
      expect(driver?.estVeStintLaps).toBe(25);
    });
  });

  describe('Session settings and server configuration parsing', () => {
    it('parses settings, multipliers, tire warmers, and rules correctly', () => {
      const xmlWithSettings = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <Setting>Race Weekend</Setting>
    <ServerName>LMU Championship Server</ServerName>
    <TrackVenue>Spa</TrackVenue>
    <DamageMult>50</DamageMult>
    <FuelMult>2</FuelMult>
    <TireMult>1</TireMult>
    <TireWarmers>1</TireWarmers>
    <FixedSetups>0</FixedSetups>
    <FixedUpgrades>0</FixedUpgrades>
    <ParcFerme>3</ParcFerme>
    <MechFailRate>1</MechFailRate>
    <VehiclesAllowed>Ferrari_488_GTE_EVO,</VehiclesAllowed>
    <Practice1>
      <Minutes>60</Minutes>
      <Driver><Name>Racer</Name></Driver>
    </Practice1>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlWithSettings);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('settings_test.xml');
      expect(session).not.toBeNull();
      expect(session?.settings).toBeDefined();
      expect(session?.settings?.modeSetting).toBe('Race Weekend');
      expect(session?.settings?.serverName).toBe('LMU Championship Server');
      expect(session?.settings?.damageMultiplier).toBe(50);
      expect(session?.settings?.fuelMultiplier).toBe(2);
      expect(session?.settings?.tireMultiplier).toBe(1);
      expect(session?.settings?.tireWarmers).toBe(true);
      expect(session?.settings?.fixedSetups).toBe(false);
      expect(session?.settings?.parcFerme).toBe(3);
      expect(session?.settings?.durationMinutes).toBe(60);
      expect(session?.settings?.vehiclesAllowed).toBe('Ferrari_488_GTE_EVO,');
    });
  });

  describe('Timing Timestamps (et), Gaps, Pit Durations & Laps without sectors', () => {
    it('extracts et, formats elapsed time, computes gap to leader, and estimates pit duration', () => {
      const xmlWithEt = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Spa</TrackVenue>
    <Race>
      <Driver>
        <Name>Leader</Name>
        <isPlayer>0</isPlayer>
        <CarType>Ferrari 499P</CarType>
        <CarClass>Hypercar</CarClass>
        <Lap num="1" p="1" s1="35.0" s2="42.0" s3="45.0" et="122.000">122.000</Lap>
        <Lap num="2" p="1" s1="34.8" s2="41.9" s3="44.8" et="243.500">121.500</Lap>
      </Driver>
      <Driver>
        <Name>Chaser</Name>
        <isPlayer>1</isPlayer>
        <CarType>Porsche 963</CarType>
        <CarClass>Hypercar</CarClass>
        <Lap num="1" p="2" s1="35.5" s2="42.5" s3="45.5" et="123.500">123.500</Lap>
        <Lap num="2" p="2" pit="1" et="278.000">154.500</Lap>
      </Driver>
    </Race>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlWithEt);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('et_test.xml');
      expect(session).not.toBeNull();
      
      const leader = session?.drivers.find(d => d.name === 'Leader');
      const chaser = session?.drivers.find(d => d.name === 'Chaser');

      // Leader checks
      expect(leader?.laps[0].elapsedSeconds).toBe(122.0);
      expect(leader?.laps[0].elapsedTimeString).toBe('2:02.0');
      expect(leader?.laps[0].gapToLeaderString).toBe('LEADER');
      expect(leader?.laps[1].gapToLeaderString).toBe('LEADER');

      // Chaser checks
      expect(chaser?.laps[0].elapsedSeconds).toBe(123.5);
      expect(chaser?.laps[0].gapToLeader).toBe(1.5);
      expect(chaser?.laps[0].gapToLeaderString).toBe('+1.500s');

      // Pit Stop duration check
      expect(chaser?.laps[1].isPitStop).toBe(true);
      expect(chaser?.laps[1].pitStopDuration).toBeGreaterThan(0);
      expect(chaser?.laps[1].pitStopDurationString).toMatch(/\+\d+(\.\d+)?s/);
    });

    it('preserves elapsed time without fabricating false lap times on incomplete laps', () => {
      const xmlWithoutSectors = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Monza</TrackVenue>
    <Practice1>
      <Driver>
        <Name>Outlap Driver</Name>
        <isPlayer>1</isPlayer>
        <Lap num="1" p="1" et="130.500"></Lap>
        <Lap num="2" p="1" et="240.200"></Lap>
      </Driver>
    </Practice1>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlWithoutSectors);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('no_sectors_test.xml');
      expect(session).not.toBeNull();
      const laps = session?.drivers[0].laps || [];
      expect(laps[0].lapTime).toBeNull();
      expect(laps[0].isValid).toBe(false);
      expect(laps[0].elapsedSeconds).toBe(130.5);
      expect(laps[0].elapsedTimeString).toBe('2:10.5');
      // Lap 2 elapsed time delta (240.2 - 130.5 = 109.7s) is inferred, but marked invalid/incomplete
      expect(laps[1].lapTime).toBe(109.7);
      expect(laps[1].isInferred).toBe(true);
      expect(laps[1].isValid).toBe(false);
      expect(laps[1].elapsedSeconds).toBe(240.2);
      expect(laps[1].elapsedTimeString).toBe('4:00.2');
    });

    it('does not fabricate valid laps from incomplete outlaps or unverified BestLapTime XML tag', () => {
      const xmlWithOutlapOnly = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <Practice1>
      <TrackVenue>Silverstone Circuit</TrackVenue>
      <TrackCourse>WEC</TrackCourse>
      <TimeString>2026/08/29 20:39:37</TimeString>
      <Driver>
        <Name>Outlap Driver</Name>
        <CarType>BMW M4 LMGT3</CarType>
        <CarClass>LMGT3</CarClass>
        <isPlayer>1</isPlayer>
        <BestLapTime>1:15.767</BestLapTime>
        <Lap num="1" p="1" et="75.767">--:--.---</Lap>
      </Driver>
    </Practice1>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlWithOutlapOnly);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('outlap_test.xml');
      expect(session).not.toBeNull();
      const driver = session?.drivers[0];
      expect(driver?.laps[0].isValid).toBe(false);
      expect(driver?.laps[0].lapTime).toBeNull();
      expect(driver?.bestLapTime).toBeNull();
      expect(driver?.bestLapTimeString).toBe('--:--.---');
      expect(driver?.bestLapPaceCategory).toBeUndefined();
      expect(driver?.bestLapPacePercentage).toBeUndefined();
    });

    it('safely handles 0 fuel usage without dividing by zero or crashing', () => {
      const xmlZeroFuel = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Circuit de Spa-Francorchamps</TrackVenue>
    <Practice1>
      <Driver>
        <Name>Electric Driver</Name>
        <CarType>Ferrari 499P</CarType>
        <CarClass>Hypercar</CarClass>
        <isPlayer>1</isPlayer>
        <Lap num="1" s1="35.0" s2="42.0" s3="45.0" fuel="100.0" ve="100.0">122.0</Lap>
        <Lap num="2" s1="35.0" s2="42.0" s3="45.0" fuel="100.0" ve="100.0">122.0</Lap>
      </Driver>
    </Practice1>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlZeroFuel);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('zero_fuel.xml');
      expect(session).not.toBeNull();
      const driver = session?.drivers[0];
      expect(driver?.avgFuelPerLap).toBeNull();
      expect(driver?.estFuelStintLaps).toBeNull();
      expect(driver?.avgVePerLap).toBeNull();
      expect(driver?.estVeStintLaps).toBeNull();
    });

    it('auto-detects player driver when isPlayer tag is omitted', () => {
      const xmlNoPlayerTag = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Autodromo Nazionale Monza</TrackVenue>
    <Qualify>
      <Driver>
        <Name>Solo Driver</Name>
        <CarType>BMW M4 LMGT3</CarType>
        <CarClass>LMGT3</CarClass>
        <Lap num="1" s1="28.0" s2="38.0" s3="42.0">108.0</Lap>
      </Driver>
    </Qualify>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlNoPlayerTag);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('no_player_tag.xml');
      expect(session).not.toBeNull();
      expect(session?.playerDriver?.name).toBe('Solo Driver');
      expect(session?.playerDriver?.bestLapTime).toBe(108.0);
    });

    it('infers lap time and missing sector from session elapsed time for incomplete laps', () => {
      const xmlIncompleteLaps = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Circuit de la Sarthe</TrackVenue>
    <Race>
      <Driver>
        <Name>LeMans Driver</Name>
        <isPlayer>1</isPlayer>
        <CarType>Ferrari 499P</CarType>
        <CarClass>Hypercar</CarClass>
        <Lap num="1" et="200.000" s1="33.000" s2="82.000" s3="95.000">210.000</Lap>
        <Lap num="2" et="410.500" s1="33.200" s2="82.800">--.----</Lap>
        <Lap num="3" et="620.000" s1="33.100" s2="82.500" s3="94.400">210.000</Lap>
        <Lap num="4" et="2000.000" s1="33.000">--.----</Lap>
      </Driver>
    </Race>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlIncompleteLaps);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('incomplete_laps.xml');
      expect(session).not.toBeNull();
      const driver = session?.drivers[0];
      expect(driver).toBeDefined();

      const laps = driver!.laps;
      expect(laps.length).toBe(4);

      // Lap 1: Normal valid lap
      expect(laps[0].lapTime).toBe(210.0);
      expect(laps[0].isValid).toBe(true);
      expect(laps[0].isInferred).toBeUndefined();

      // Lap 2: Incomplete lap (--.----) with et=410.500 vs prev et=200.000 -> inferred = 210.500s
      expect(laps[1].lapTime).toBe(210.5);
      expect(laps[1].lapTimeString).toBe('3:30.500');
      expect(laps[1].isInferred).toBe(true);
      expect(laps[1].isValid).toBe(false); // Keeps official clean lap records intact
      // S3 deduced: 210.5 - 33.2 - 82.8 = 94.5s
      expect(laps[1].s3).toBe(94.5);

      // Lap 4: Incomplete lap with et=2000.000 (1380s delta - 23 minutes in garage) -> does NOT make sense to infer
      expect(laps[3].lapTime).toBeNull();
      expect(laps[3].lapTimeString).toBe('--:--.---');
      expect(laps[3].isInferred).toBeUndefined();

      // Official driver best lap time should strictly reflect valid clean laps
      expect(driver?.bestLapTime).toBe(210.0);
    });

    it('does not mark lap 2 as an out-lap when lap 1 is practice start with no lap time, and treats lap 2 as valid', () => {
      const xmlPracticeStart = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <Setting>Practice 1</Setting>
    <TrackVenue>Circuit de Spa-Francorchamps</TrackVenue>
    <TrackCourse>Grand Prix</TrackCourse>
    <TrackEvent>Spa 6 Hours</TrackEvent>
    <TrackLength>7004.0</TrackLength>
    <TimeString>2026/05/28 12:00</TimeString>
    <Driver>
      <Name>Test Driver</Name>
      <CarType>Porsche 911 GT3 R</CarType>
      <CarClass>LMGT3</CarClass>
      <CarNumber>92</CarNumber>
      <TeamName>Manthey EMA</TeamName>
      <isPlayer>1</isPlayer>
      <GridPos>1</GridPos>
      <Position>1</Position>
      <Lap num="1" p="2" et="--.---" topspeed="324.9">--.----</Lap>
      <Lap num="2" p="1" et="215.585" s1="34.925" s2="84.641" s3="96.019" topspeed="327.0">215.585</Lap>
    </Driver>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlPracticeStart);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('practice_start.xml');
      expect(session).not.toBeNull();
      const driver = session?.drivers[0];
      expect(driver).toBeDefined();

      const laps = driver!.laps;
      expect(laps.length).toBe(2);

      // Lap 1 is practice start from pit lane / garage without completed lap time
      expect(laps[0].lapNum).toBe(1);
      expect(laps[0].lapTime).toBeNull();
      expect(laps[0].isPitStop).toBe(false);

      // Lap 2 is the first full flying lap: should be VALID and NOT an out lap
      expect(laps[1].lapNum).toBe(2);
      expect(laps[1].lapTime).toBe(215.585);
      expect(laps[1].isValid).toBe(true);
      expect(laps[1].isOutLap).toBeUndefined();

      // Average lap time should include lap 2 as a valid clean lap
      expect(driver?.avgLapTime).toBe(215.585);
    });

    it('does not mark lap 2 as an out-lap in Qualifying when lap 1 is start lap, and treats lap 2 as valid', () => {
      const xmlQualiStart = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <Setting>Qualifying 1</Setting>
    <TrackVenue>Circuit de Spa-Francorchamps</TrackVenue>
    <TrackCourse>Grand Prix</TrackCourse>
    <TrackEvent>Spa 6 Hours</TrackEvent>
    <TrackLength>7004.0</TrackLength>
    <TimeString>2026/05/28 14:00</TimeString>
    <Driver>
      <Name>Quali Driver</Name>
      <CarType>Ferrari 499P</CarType>
      <CarClass>Hypercar</CarClass>
      <CarNumber>50</CarNumber>
      <TeamName>Ferrari AF Corse</TeamName>
      <isPlayer>1</isPlayer>
      <GridPos>1</GridPos>
      <Position>1</Position>
      <Lap num="1" p="1" et="--.---" topspeed="310.5">--.----</Lap>
      <Lap num="2" p="1" et="120.500" s1="34.000" s2="41.000" s3="45.500" topspeed="325.0">120.500</Lap>
    </Driver>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlQualiStart);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('quali_start.xml');
      expect(session).not.toBeNull();
      const driver = session?.drivers[0];
      expect(driver).toBeDefined();

      const laps = driver!.laps;
      expect(laps.length).toBe(2);

      // Lap 1 is untimed session start lap
      expect(laps[0].lapNum).toBe(1);
      expect(laps[0].lapTime).toBeNull();
      expect(laps[0].isPitStop).toBe(false);

      // Lap 2 is valid flying lap and not an out-lap
      expect(laps[1].lapNum).toBe(2);
      expect(laps[1].lapTime).toBe(120.5);
      expect(laps[1].isValid).toBe(true);
      expect(laps[1].isOutLap).toBeUndefined();

      // Average lap time is the flying lap 2 time
      expect(driver?.avgLapTime).toBe(120.5);
    });
  });

  describe('getDisplayTrackName', () => {
    it('computes clean track names directly in parser', () => {
      expect(getDisplayTrackName('Spa-Francorchamps', 'GP')).toBe('Spa-Francorchamps');
      expect(getDisplayTrackName('Silverstone', 'National Circuit')).toBe('Silverstone (National Circuit)');
    });
  });

  describe('extractComparableLaps', () => {
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
        driversCount: 2,
        playerDriver: {
          name: 'Player Driver',
          isPlayer: true,
          carType: 'Porsche 911 GT3 R',
          carClass: 'LMGT3',
          carNumber: '92',
          teamName: 'Manthey',
          position: 2,
          classPosition: 2,
          bestLapTime: 122.5,
          bestLapTimeString: '2:02.500',
          theoreticalBest: 122.0,
          theoreticalBestString: '2:02.000',
          lapsCount: 2,
          laps: [
            { lapNum: 1, position: 2, lapTime: 124.0, lapTimeString: '2:04.000', s1: 31.0, s2: 46.0, s3: 47.0, isValid: true },
            { lapNum: 2, position: 2, lapTime: 122.5, lapTimeString: '2:02.500', s1: 30.5, s2: 45.5, s3: 46.5, isValid: true },
          ],
        },
        drivers: [
          {
            name: 'Player Driver',
            isPlayer: true,
            carType: 'Porsche 911 GT3 R',
            carClass: 'LMGT3',
            carNumber: '92',
            teamName: 'Manthey',
            position: 2,
            classPosition: 2,
            bestLapTime: 122.5,
            bestLapTimeString: '2:02.500',
            lapsCount: 2,
            laps: [
              { lapNum: 1, position: 2, lapTime: 124.0, lapTimeString: '2:04.000', s1: 31.0, s2: 46.0, s3: 47.0, isValid: true },
              { lapNum: 2, position: 2, lapTime: 122.5, lapTimeString: '2:02.500', s1: 30.5, s2: 45.5, s3: 46.5, isValid: true },
            ],
          },
          {
            name: 'Alien AI Opponent',
            isPlayer: false,
            carType: 'Ferrari 296 GT3',
            carClass: 'LMGT3',
            carNumber: '55',
            teamName: 'AF Corse',
            position: 1,
            classPosition: 1,
            bestLapTime: 120.0,
            bestLapTimeString: '2:00.000',
            lapsCount: 2,
            laps: [
              { lapNum: 1, position: 1, lapTime: 121.0, lapTimeString: '2:01.000', s1: 30.0, s2: 45.0, s3: 46.0, isValid: true },
              { lapNum: 2, position: 1, lapTime: 120.0, lapTimeString: '2:00.000', s1: 29.8, s2: 44.5, s3: 45.7, isValid: true },
            ],
          },
        ],
      },
    ] as unknown as DetailedSession[];

    it('extracts comparable laps and finds personal best and overall track best without driver restriction', () => {
      const result = extractComparableLaps(mockSessions, {
        trackName: 'Spa',
        carClass: 'LMGT3',
        playerOnly: true,
      });

      // Player laps are extracted
      expect(result.laps.length).toBe(2);
      expect(result.laps[0].driverName).toBe('Player Driver');

      // Player personal best is 122.5s
      expect(result.allTimeBestLap).toBeDefined();
      expect(result.allTimeBestLap?.lapTime).toBe(122.5);
      expect(result.allTimeBestLap?.driverName).toBe('Player Driver');

      // Overall track best is the Alien AI Opponent (120.0s), even with playerOnly: true!
      expect(result.overallTrackBestLap).toBeDefined();
      expect(result.overallTrackBestLap?.lapTime).toBe(120.0);
      expect(result.overallTrackBestLap?.driverName).toBe('Alien AI Opponent');
      expect(result.overallTrackBestLap?.isOverallTrackBest).toBe(true);

      // Best sectors across player laps (when playerOnly is true)
      expect(result.bestS1).toBe(30.5);
      expect(result.bestS2).toBe(45.5);
      expect(result.bestS3).toBe(46.5);
    });

    it('filters strictly by carClass and returns empty when class does not match', () => {
      const result = extractComparableLaps(mockSessions, {
        trackName: 'Spa',
        carClass: 'Hypercar',
      });

      expect(result.laps.length).toBe(0);
      expect(result.allTimeBestLap).toBeNull();
      expect(result.overallTrackBestLap).toBeNull();
    });
  });

  describe('Stream Incidents, Track Limits, Damage, and Penalties', () => {
    it('parses incidents, track limits, penalties, and damage and maps them to laps and drivers', () => {
      const xmlWithStream = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <TrackVenue>Spa</TrackVenue>
    <Race>
      <Stream>
        <Incident et="120.5">Player Driver(1) reported contact (750.25) with another vehicle AI Rival(2)</Incident>
        <Incident et="120.5">AI Rival(2) reported contact (710.00) with another vehicle Player Driver(1)</Incident>
        <Incident et="245.0">Player Driver(1) reported contact (4500.00) with Immovable</Incident>
        <Sector et="250.0">Player Driver(1) reports new suspension damage</Sector>
        <TrackLimits Driver="Player Driver" ID="1" Lap="0" WarningPoints="0.25" CurrentPoints="0.25" et="150.0">Warning</TrackLimits>
        <TrackLimits Driver="Player Driver" ID="1" Lap="1" WarningPoints="0" CurrentPoints="0.25" et="280.0">No Further Action</TrackLimits>
        <Penalty Driver="AI Rival" ID="2" Penalty="Drive Thru" Reason="Speeding" et="130.0">AI Rival received Drive Thru for Speeding</Penalty>
      </Stream>
      <Driver>
        <Name>Player Driver</Name>
        <isPlayer>1</isPlayer>
        <CarType>Ferrari 499P</CarType>
        <CarClass>Hypercar</CarClass>
        <Lap num="1" p="1" s1="35.0" s2="42.0" s3="45.0" et="100.0">122.0</Lap>
        <Lap num="2" p="1" s1="36.0" s2="45.0" s3="50.0" et="222.0">131.0</Lap>
      </Driver>
      <Driver>
        <Name>AI Rival</Name>
        <isPlayer>0</isPlayer>
        <CarType>Porsche 963</CarType>
        <CarClass>Hypercar</CarClass>
        <Lap num="1" p="2" s1="35.5" s2="42.5" s3="45.5" et="100.0">123.5</Lap>
        <Lap num="2" p="2" s1="35.0" s2="42.0" s3="45.0" et="223.5">122.0</Lap>
      </Driver>
    </Race>
  </RaceResults>
</rFactorXML>`;

      const readSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlWithStream);
      const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      try {
        const session = parser.parseSessionXml('stream_test.xml');
        expect(session).not.toBeNull();

        const player = session?.drivers.find(d => d.name === 'Player Driver');
        const rival = session?.drivers.find(d => d.name === 'AI Rival');

        expect(player).toBeDefined();
        expect(rival).toBeDefined();

        // Check Player totals
        expect(player?.totalIncidents).toBe(3); // 1 vehicle contact + 1 wall contact + 1 suspension damage
        expect(player?.totalTrackLimits).toBe(2);
        expect(player?.totalPenalties).toBe(0);

        // Check Player Lap 1 events (et between 100.0 and 222.0)
        const pLap1 = player?.laps[0];
        expect(pLap1?.incidentCount).toBe(1);
        expect(pLap1?.incidents?.[0].type).toBe('contact');
        expect(pLap1?.incidents?.[0].otherVehicle).toBe('AI Rival');
        expect(pLap1?.incidents?.[0].force).toBe(750.25);
        expect(pLap1?.incidents?.[0].isWallImpact).toBe(false);

        expect(pLap1?.trackLimitCount).toBe(1);
        expect(pLap1?.trackLimits?.[0].warningPoints).toBe(0.25);
        expect(pLap1?.trackLimits?.[0].action).toBe('Warning');

        // Check Player Lap 2 events (et between 222.0 and 353.0)
        const pLap2 = player?.laps[1];
        expect(pLap2?.incidentCount).toBe(2);
        // Wall contact
        expect(pLap2?.incidents?.[0].type).toBe('contact');
        expect(pLap2?.incidents?.[0].isWallImpact).toBe(true);
        expect(pLap2?.incidents?.[0].force).toBe(4500);
        // Suspension damage
        expect(pLap2?.incidents?.[1].type).toBe('damage');
        expect(pLap2?.incidents?.[1].description).toContain('suspension damage');

        expect(pLap2?.trackLimitCount).toBe(1);
        expect(pLap2?.trackLimits?.[0].action).toBe('No Further Action');

        // Check AI Rival penalties and incidents
        expect(rival?.totalPenalties).toBe(1);
        expect(rival?.penalties?.[0].penalty).toBe('Drive Thru');
        expect(rival?.penalties?.[0].reason).toBe('Speeding');
        expect(rival?.laps[0].penaltyCount).toBe(1);

        expect(rival?.totalIncidents).toBe(1);
        expect(rival?.laps[0].incidents?.[0].otherVehicle).toBe('Player Driver');
      } finally {
        readSpy.mockRestore();
        statSpy.mockRestore();
      }
    });
  });
});
