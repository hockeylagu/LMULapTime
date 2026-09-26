import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LmuParser } from '../../../server/sessions/parser.js';
import fs from 'fs';

describe('parser server module - stream events and timing timestamps', () => {
  let parser: LmuParser;

  beforeEach(() => {
    parser = new LmuParser();
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
      expect(laps[1].isValid).toBe(false);
      expect(laps[1].s3).toBe(94.5);

      // Lap 4: Incomplete lap with et=2000.000 (1380s delta - 23 minutes in garage) -> does NOT make sense to infer
      expect(laps[3].lapTime).toBeNull();
      expect(laps[3].lapTimeString).toBe('--:--.---');
      expect(laps[3].isInferred).toBeUndefined();

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

      expect(driver?.avgLapTime).toBe(120.5);
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
        expect(player?.totalIncidents).toBe(3);
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
        expect(pLap2?.incidents?.[0].type).toBe('contact');
        expect(pLap2?.incidents?.[0].isWallImpact).toBe(true);
        expect(pLap2?.incidents?.[0].force).toBe(4500);
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
