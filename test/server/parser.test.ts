import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LmuParser } from '../../server/sessions/parser.js';
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
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('File not found');
      });
      expect(parser.parseSessionXml('nonexistent.xml')).toBeNull();
      consoleSpy.mockRestore();
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

    it('never matches a replay from a different session type even when timestamps are close', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      // A Race replay recorded moments before a new Practice session should never be picked
      // for that Practice session just because the timestamps are only seconds apart.
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'Circuit de Spa-Francorchamps R1 8.Vcr',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1048576, mtime: new Date(1779999950 * 1000) } as unknown as fs.Stats);

      const p = new LmuParser('C:\\Replays');
      vi.spyOn(fs, 'readFileSync').mockReturnValue(samplePracticeXml);

      const session = p.parseSessionXml('practice.xml');
      expect(session?.matchingReplayFile).toBeUndefined();
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

    it('identifies fixed setup and warm tires in multiplayer beginner daily race', () => {
      const xmlFixedWarm = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <Setting>Multiplayer</Setting>
    <TrackVenue>Circuit de la Sarthe</TrackVenue>
    <FixedSetups>0</FixedSetups>
    <FreeSettings>63</FreeSettings>
    <TireWarmers>1</TireWarmers>
    <Race><Minutes>20</Minutes><Driver><Name>Racer</Name></Driver></Race>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlFixedWarm);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('fixed_warm_test.xml');
      expect(session?.settings?.fixedSetups).toBe(true);
      expect(session?.settings?.tireWarmers).toBe(true);
      expect(session?.settings?.freeSettings).toBe(63);
    });

    it('identifies open setup and cold tires (no blankets) in multiplayer intermediate daily race', () => {
      const xmlOpenCold = `<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
  <RaceResults>
    <Setting>Multiplayer</Setting>
    <TrackVenue>Daytona International Speedway</TrackVenue>
    <FixedSetups>0</FixedSetups>
    <FreeSettings>2147483647</FreeSettings>
    <TireWarmers>1</TireWarmers>
    <Race><Minutes>30</Minutes><Driver><Name>Racer</Name></Driver></Race>
  </RaceResults>
</rFactorXML>`;

      vi.spyOn(fs, 'readFileSync').mockReturnValue(xmlOpenCold);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

      const session = parser.parseSessionXml('open_cold_test.xml');
      expect(session?.settings?.fixedSetups).toBe(false);
      expect(session?.settings?.tireWarmers).toBe(false);
      expect(session?.settings?.freeSettings).toBe(2147483647);
    });
  });
});

