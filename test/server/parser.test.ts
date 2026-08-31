import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LmuParser, computeProgression, computeTrackSummaries, getDisplayTrackName } from '../../server/parser';
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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date(1780000000 * 1000) } as any);

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

    it('parses Qualifying session with wet weather and night time', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(sampleQualifyingXml);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

      const session = parser.parseSessionXml('dummy_qual.xml');
      expect(session?.sessionType).toBe('Qualifying');
      expect(session?.sessionName).toBe('Q1');
      expect(session?.weather?.condition).toBe('Wet');
      expect(session?.weather?.timeOfDay).toBe('Night');
    });

    it('parses Race session with morning time', () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(sampleRaceXml);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

      const session = parser.parseSessionXml('dummy_race.xml');
      expect(session?.sessionType).toBe('Race');
      expect(session?.sessionName).toBe('R1');
      expect(session?.weather?.timeOfDay).toBe('Morning');
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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

      const sessionP = parser.parseSessionXml('2026_01_01_12_00_00-01P1.xml');
      expect(sessionP?.sessionType).toBe('Practice');

      const sessionQ = parser.parseSessionXml('2026_01_01_12_00_00-01Q2.xml');
      expect(sessionQ?.sessionType).toBe('Qualifying');

      const sessionR = parser.parseSessionXml('2026_01_01_12_00_00-01R1.xml');
      expect(sessionR?.sessionType).toBe('Race');
    });
  });

  describe('parseWeather', () => {
    it('detects wet tires and various times of day', () => {
      const wetWeather = parser.parseWeather('2026/05/28 15:00', [
        { laps: [{ fCompound: 'Wet Tire', rCompound: 'Slick' }] } as any,
      ]);
      expect(wetWeather.condition).toBe('Wet');
      expect(wetWeather.timeOfDay).toBe('Daytime');

      const evening = parser.parseWeather('2026/05/28 19:30', []);
      expect(evening.timeOfDay).toBe('Evening');

      const morning = parser.parseWeather('2026/05/28 07:00', []);
      expect(morning.timeOfDay).toBe('Morning');

      const night = parser.parseWeather('2026/05/28 23:00', []);
      expect(night.timeOfDay).toBe('Night');
    });
  });

  describe('replay indexing and matching', () => {
    it('indexes replay directory and matches session', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['Circuit de Spa-Francorchamps P1 78.Vcr'] as any);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1048576, mtime: new Date(1780000000 * 1000) } as any);

      const p = new LmuParser('C:\\Replays');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(samplePracticeXml);

      const session = p.parseSessionXml('practice.xml');
      expect(session?.matchingReplayFile).toBeDefined();
      expect(session?.matchingReplayFile?.name).toBe('Circuit de Spa-Francorchamps P1 78.Vcr');
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
      expect(progression[1].avgLapTime).toBe(120.5);
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

      const mockSessions: any[] = [
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
      ];

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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

      const session = parser.parseSessionXml('no_sectors_test.xml');
      expect(session).not.toBeNull();
      const laps = session?.drivers[0].laps || [];
      expect(laps[0].lapTime).toBeNull();
      expect(laps[0].isValid).toBe(false);
      expect(laps[0].elapsedSeconds).toBe(130.5);
      expect(laps[0].elapsedTimeString).toBe('2:10.5');
      expect(laps[1].lapTime).toBeNull();
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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

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
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as any);

      const session = parser.parseSessionXml('no_player_tag.xml');
      expect(session).not.toBeNull();
      expect(session?.playerDriver?.name).toBe('Solo Driver');
      expect(session?.playerDriver?.bestLapTime).toBe(108.0);
    });
  });

  describe('getDisplayTrackName', () => {
    it('computes clean track names directly in parser', () => {
      expect(getDisplayTrackName('Spa-Francorchamps', 'GP')).toBe('Spa-Francorchamps');
      expect(getDisplayTrackName('Silverstone', 'National Circuit')).toBe('Silverstone (National Circuit)');
    });
  });
});
