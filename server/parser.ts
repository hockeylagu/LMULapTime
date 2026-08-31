import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import {
  DetailedSession,
  DriverData,
  LapData,
  SessionMetadata,
  SessionProgressionPoint,
  SessionSettings,
  SessionWeather,
  TireWear,
  TrackSummary,
} from './types.js';
import {
  formatTime,
  formatElapsedSeconds,
  parseTimeStringToSeconds,
  getDisplayTrackName,
  computeTheoreticalBest,
} from '../src/utils/formatters.js';
import { calculatePaceCategory } from './referenceLaptimes.js';
import { matchesTrack, matchesCarClass } from '../src/utils/paceCategory.js';

export { getDisplayTrackName };

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

interface ReplayFileEntry {
  name: string;
  path: string;
  sizeBytes: number;
  trackName: string;
  sessionCode: string; // e.g. P1, Q1, R1
  mtime: number;
}

const updateMinTime = (current: number | null, next: number | null): number | null =>
  next !== null && next > 0 && (current === null || next < current) ? next : current;

const computeAverageLapTime = (laps: LapData[]): number | null => {
  const valid = laps.filter(l => l.isValid && l.lapTime);
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, l) => acc + (l.lapTime || 0), 0);
  return parseFloat((sum / valid.length).toFixed(3));
};

export class LmuParser {
  private replaysMap: ReplayFileEntry[] = [];
  public configuredPlayerName: string = '';

  constructor(replaysDir?: string, resultsDir?: string) {
    this.detectPlayerName(resultsDir || replaysDir);
    if (replaysDir && fs.existsSync(replaysDir)) {
      this.indexReplays(replaysDir);
    }
  }

  public detectPlayerName(baseDir?: string) {
    try {
      const candidateUserDataDirs: string[] = [];

      if (baseDir) {
        const uIdx = baseDir.indexOf('UserData');
        if (uIdx !== -1) {
          candidateUserDataDirs.push(baseDir.substring(0, uIdx + 8));
        }
      }

      candidateUserDataDirs.push(
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData',
        path.join(process.cwd(), 'UserData')
      );

      for (const udDir of candidateUserDataDirs) {
        if (!fs.existsSync(udDir)) continue;

        const settingsPaths = [
          path.join(udDir, 'player', 'settings.json'),
          path.join(udDir, 'player', 'Settings.JSON'),
        ];

        for (const sp of settingsPaths) {
          if (fs.existsSync(sp)) {
            const raw = fs.readFileSync(sp, 'utf8');
            const parsed = JSON.parse(raw);
            const pName = parsed?.DRIVER?.['Player Name'] || parsed?.DRIVER?.PlayerName;
            if (pName && typeof pName === 'string' && pName.trim()) {
              this.configuredPlayerName = pName.trim();
              console.log(`[LmuParser] Dynamically detected LMU player profile name: "${this.configuredPlayerName}"`);
              return;
            }
          }
        }
      }
    } catch {
      // Ignore fallback
    }
  }

  public indexReplays(replaysDir: string) {
    try {
      const files = fs.readdirSync(replaysDir);
      this.replaysMap = files
        .filter(f => f.toLowerCase().endsWith('.vcr'))
        .map(f => {
          const filePath = path.join(replaysDir, f);
          const stat = fs.statSync(filePath);

          // Match e.g. "Circuit de Spa-Francorchamps P1 78.Vcr"
          const match = f.match(/^(.+?)\s+([PQR]\d+)\b/i);
          const trackName = match ? match[1].trim() : f.replace(/\.vcr$/i, '');
          const sessionCode = match ? match[2].toUpperCase() : '';

          return {
            name: f,
            path: filePath,
            sizeBytes: stat.size,
            trackName,
            sessionCode,
            mtime: stat.mtime.getTime(),
          };
        });
    } catch (err) {
      console.warn('Error indexing replays directory:', err);
    }
  }

  public parseSessionXml(filePath: string): DetailedSession | null {
    try {
      const xmlContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = xmlParser.parse(xmlContent);
      if (!parsed?.rFactorXML?.RaceResults) {
        return null;
      }

      const raceResults = parsed.rFactorXML.RaceResults;
      const trackVenue = raceResults.TrackVenue || raceResults.TrackCourse || 'Unknown Track';
      const trackCourse = raceResults.TrackCourse || trackVenue;
      const trackEvent = raceResults.TrackEvent || '';
      const trackLengthMeters = parseFloat(raceResults.TrackLength) || null;
      const timeString = raceResults.TimeString || '';
      const timestamp = raceResults.DateTime ? parseInt(raceResults.DateTime, 10) * 1000 : Date.now();
      const filename = path.basename(filePath);

      // Determine session type (Qualify, Race, Practice)
      let sessionType: 'Practice' | 'Qualifying' | 'Race' | 'Unknown' = 'Unknown';
      let sessionName = 'Session';
      let sessionDataNode: any = null;

      if (raceResults.Qualify) {
        sessionType = 'Qualifying';
        sessionName = 'Q1';
        sessionDataNode = raceResults.Qualify;
      } else if (raceResults.Race) {
        sessionType = 'Race';
        sessionName = 'R1';
        sessionDataNode = raceResults.Race;
      } else if (raceResults.Practice1 || raceResults.Practice) {
        sessionType = 'Practice';
        sessionName = 'P1';
        sessionDataNode = raceResults.Practice1 || raceResults.Practice;
      } else {
        const fnMatch = filename.match(/([PQR]\d+)\.xml$/i);
        if (fnMatch) {
          sessionName = fnMatch[1].toUpperCase();
          if (sessionName.startsWith('P')) sessionType = 'Practice';
          else if (sessionName.startsWith('Q')) sessionType = 'Qualifying';
          else if (sessionName.startsWith('R')) sessionType = 'Race';
        }
      }

      // Parse Drivers
      const rawDrivers = sessionDataNode?.Driver || raceResults.Driver || [];
      const driversList = Array.isArray(rawDrivers) ? rawDrivers : [rawDrivers];
      const drivers: DriverData[] = driversList.map((d: any) => this.parseDriver(d)).filter(Boolean);

      // Compute Pace Categories for each lap and driver best lap
      drivers.forEach(driver => {
        driver.laps.forEach(lap => {
          if (lap.isValid && lap.lapTime) {
            const paceInfo = calculatePaceCategory(lap.lapTime, trackVenue, trackCourse, driver.carClass, driver.carType);
            if (paceInfo) {
              lap.paceCategory = paceInfo.category;
              lap.pacePercentage = paceInfo.percentage;
              lap.target100Sec = paceInfo.target100Sec;
            }
          }
        });

        if (driver.bestLapTime) {
          const bestPaceInfo = calculatePaceCategory(driver.bestLapTime, trackVenue, trackCourse, driver.carClass, driver.carType);
          if (bestPaceInfo) {
            driver.bestLapPaceCategory = bestPaceInfo.category;
            driver.bestLapPacePercentage = bestPaceInfo.percentage;
          }
        }
      });

      // Compute Gap to Leader across drivers per lap
      const leaderLapEtMap = new Map<number, number>();
      drivers.forEach(d => {
        d.laps.forEach(l => {
          if (l.elapsedSeconds !== null && l.elapsedSeconds !== undefined && l.elapsedSeconds > 0) {
            const currentMin = leaderLapEtMap.get(l.lapNum);
            if (currentMin === undefined || l.elapsedSeconds < currentMin) {
              leaderLapEtMap.set(l.lapNum, l.elapsedSeconds);
            }
          }
        });
      });

      drivers.forEach(d => {
        d.laps.forEach(l => {
          if (l.elapsedSeconds !== null && l.elapsedSeconds !== undefined && l.elapsedSeconds > 0) {
            const leaderEt = leaderLapEtMap.get(l.lapNum);
            if (leaderEt !== undefined) {
              const gap = parseFloat((l.elapsedSeconds - leaderEt).toFixed(3));
              l.gapToLeader = gap;
              l.gapToLeaderString = gap <= 0.001 ? 'LEADER' : `+${gap.toFixed(3)}s`;
            }
          }
        });
      });

      // Identify Player driver dynamically
      const targetName = this.configuredPlayerName.toLowerCase().trim();
      let mainPlayerDriver = targetName
        ? drivers.find(d => d.name.toLowerCase().includes(targetName) || targetName.includes(d.name.toLowerCase()))
        : undefined;

      if (!mainPlayerDriver) {
        mainPlayerDriver = drivers.find(d => d.isPlayer) || drivers[0];
      }

      if (mainPlayerDriver) {
        drivers.forEach(d => {
          d.isPlayer = (d.name === mainPlayerDriver.name);
        });
      }

      const playerDriver = mainPlayerDriver;

      // Find overall best lap of session
      let bestSessionLap: SessionMetadata['bestSessionLap'] = undefined;
      let minLapSec = Infinity;
      drivers.forEach(d => {
        if (d.bestLapTime && d.bestLapTime < minLapSec) {
          minLapSec = d.bestLapTime;
          bestSessionLap = {
            driverName: d.name,
            carType: d.carType,
            lapTime: d.bestLapTime,
            lapTimeString: d.bestLapTimeString,
          };
        }
      });

      // Compute weather and track conditions
      const weather = this.parseWeather(timeString, drivers);

      // Match replay file
      const xmlFileMtime = fs.statSync(filePath).mtime.getTime();
      const matchingReplay = this.findMatchingReplay(trackVenue, sessionName, timestamp, xmlFileMtime);

      // Parse Session Settings & Server Rules
      const parseNum = (val: any): number | undefined => {
        if (val === undefined || val === null || val === '') return undefined;
        const n = parseFloat(val);
        return isNaN(n) ? undefined : n;
      };

      const parseBool = (val: any): boolean | undefined => {
        if (val === undefined || val === null || val === '') return undefined;
        return val === '1' || val === 1 || val === true || val === 'true';
      };

      const modeSetting = raceResults.Setting ? String(raceResults.Setting) : undefined;
      const serverName = raceResults.ServerName ? String(raceResults.ServerName) : undefined;
      const damageMultiplier = parseNum(raceResults.DamageMult);
      const fuelMultiplier = parseNum(raceResults.FuelMult);
      const tireMultiplier = parseNum(raceResults.TireMult);
      const tireWarmers = parseBool(raceResults.TireWarmers);
      const fixedSetups = parseBool(raceResults.FixedSetups);
      const fixedUpgrades = parseBool(raceResults.FixedUpgrades);
      const parcFerme = parseNum(raceResults.ParcFerme);
      const mechFailRate = parseNum(raceResults.MechFailRate);
      const durationMinutes = parseNum(sessionDataNode?.Minutes || raceResults.RaceTime);
      const raceLaps = parseNum(raceResults.RaceLaps);
      const raceTimeMinutes = parseNum(raceResults.RaceTime);
      const vehiclesAllowed = raceResults.VehiclesAllowed ? String(raceResults.VehiclesAllowed) : undefined;

      const settings: SessionSettings = {
        modeSetting,
        serverName,
        damageMultiplier,
        fuelMultiplier,
        tireMultiplier,
        tireWarmers,
        fixedSetups,
        fixedUpgrades,
        parcFerme,
        mechFailRate,
        durationMinutes,
        raceLaps,
        raceTimeMinutes,
        vehiclesAllowed,
      };

      const id = filename.replace(/\.xml$/i, '');

      return {
        id,
        filename,
        filePath,
        trackVenue,
        trackCourse,
        trackEvent,
        trackLengthMeters,
        timeString,
        timestamp,
        sessionType,
        sessionName,
        weather,
        weatherInfo: weather.weatherString,
        settings,
        gameVersion: raceResults.GameVersion || '',
        driversCount: drivers.length,
        drivers,
        playerDriver,
        bestSessionLap,
        matchingReplayFile: matchingReplay ? {
          name: matchingReplay.name,
          path: matchingReplay.path,
          sizeBytes: matchingReplay.sizeBytes,
        } : undefined,
      };
    } catch (err) {
      console.error(`Failed to parse XML file ${filePath}:`, err);
      return null;
    }
  }

  public parseWeather(timeString: string, drivers: DriverData[]): SessionWeather {
    const isWet = (comp?: string) => /wet|rain|inter/i.test(comp || '');
    const hasWetTires = drivers.some(d =>
      d.laps?.some(l => isWet(l.fCompound) || isWet(l.rCompound))
    );

    const condition: 'Dry' | 'Wet' = hasWetTires ? 'Wet' : 'Dry';

    let hourNum = 14;
    if (timeString) {
      const match = timeString.match(/\s(\d{1,2}):/);
      if (match) hourNum = parseInt(match[1], 10);
    }

    let timeOfDay: 'Morning' | 'Daytime' | 'Evening' | 'Night' = 'Daytime';
    if (hourNum >= 5 && hourNum < 9) timeOfDay = 'Morning';
    else if (hourNum >= 9 && hourNum < 18) timeOfDay = 'Daytime';
    else if (hourNum >= 18 && hourNum < 21) timeOfDay = 'Evening';
    else timeOfDay = 'Night';

    const conditionIcon = condition === 'Wet' ? '🌧️' : timeOfDay === 'Night' ? '🌙' : timeOfDay === 'Evening' ? '🌇' : timeOfDay === 'Morning' ? '🌅' : '☀️';
    const weatherString = `${conditionIcon} ${condition} • ${timeOfDay}`;

    return {
      condition,
      timeOfDay,
      weatherString,
    };
  }

  private parseDriver(d: any): DriverData {
    const name = String(d.Name || 'Unknown Driver');
    const carType = String(d.CarType || d.VehName || 'Unknown Car');
    const carClass = String(d.CarClass || 'General');
    const carNumber = String(d.CarNumber || '');
    const teamName = String(d.TeamName || '');
    const isPlayer = String(d.isPlayer) === '1' || d.isPlayer === true;
    const position = parseInt(d.Position, 10) || 0;
    const classPosition = parseInt(d.ClassPosition, 10) || 0;

    const rawLaps = d.Lap || [];
    const lapsList = Array.isArray(rawLaps) ? rawLaps : [rawLaps];
    const laps: LapData[] = lapsList.map((l: any, idx: number) => this.parseLap(l, idx + 1));

    // Best Laps & Sectors - Strictly calculated from valid completed laps
    const validLaps = laps.filter(l => l.isValid && l.lapTime !== null && l.lapTime > 0);
    const bestLapTime: number | null = validLaps.length > 0
      ? Math.min(...validLaps.map(l => l.lapTime as number))
      : null;

    let bestS1: number | null = null;
    let bestS2: number | null = null;
    let bestS3: number | null = null;

    validLaps.forEach(lap => {
      bestS1 = updateMinTime(bestS1, lap.s1);
      bestS2 = updateMinTime(bestS2, lap.s2);
      bestS3 = updateMinTime(bestS3, lap.s3);
    });

    const theoreticalBest = computeTheoreticalBest(bestS1, bestS2, bestS3);
    const avgLapTime = computeAverageLapTime(laps);
    const top3LapsCount = laps.filter(l => l.isValid && l.position > 0 && l.position <= 3).length;

    // Calculate pit stop loss relative to driver's clean reference lap time
    const refLapTime = avgLapTime || bestLapTime;
    laps.forEach(lap => {
      if (lap.isPitStop && lap.lapTime && refLapTime && lap.lapTime > refLapTime) {
        const pitLoss = parseFloat((lap.lapTime - refLapTime).toFixed(1));
        if (pitLoss > 0) {
          lap.pitStopDuration = pitLoss;
          lap.pitStopDurationString = `+${pitLoss}s`;
        }
      }
    });

    // Compute Fuel & VE Averages across valid flying laps (exclude pit laps and negative/anomalous fuel values)
    const validFuelLaps = laps.filter(l => l.isValid && !l.isPitStop && l.fuelUsed !== null && l.fuelUsed !== undefined && l.fuelUsed > 0 && l.fuelUsed < 25);
    const avgFuelPerLap = validFuelLaps.length > 0
      ? parseFloat((validFuelLaps.reduce((acc, l) => acc + (l.fuelUsed || 0), 0) / validFuelLaps.length).toFixed(2))
      : null;
    const estFuelStintLaps = avgFuelPerLap && avgFuelPerLap > 0
      ? Math.floor(100 / avgFuelPerLap)
      : null;

    // Virtual Energy (VE / NRG) applies to both Hypercar and LMGT3 under FIA WEC BoP stint rules
    const validVeLaps = laps.filter(l => l.isValid && !l.isPitStop && l.virtualEnergyUsed !== null && l.virtualEnergyUsed !== undefined && l.virtualEnergyUsed > 0 && l.virtualEnergyUsed < 25);
    const avgVePerLap = validVeLaps.length > 0
      ? parseFloat((validVeLaps.reduce((acc, l) => acc + (l.virtualEnergyUsed || 0), 0) / validVeLaps.length).toFixed(2))
      : null;
    const estVeStintLaps = avgVePerLap && avgVePerLap > 0
      ? Math.floor(100 / avgVePerLap)
      : null;

    return {
      name,
      carType,
      carClass,
      carNumber,
      teamName,
      isPlayer,
      position,
      classPosition,
      bestLapTime,
      bestLapTimeString: formatTime(bestLapTime),
      bestS1,
      bestS2,
      bestS3,
      theoreticalBest,
      theoreticalBestString: formatTime(theoreticalBest),
      bestLapPaceCategory: undefined,
      bestLapPacePercentage: undefined,
      avgLapTime,
      avgLapTimeString: formatTime(avgLapTime),
      avgFuelPerLap,
      estFuelStintLaps,
      avgVePerLap,
      estVeStintLaps,
      top3LapsCount,
      lapsCount: laps.length,
      laps,
    };
  }

  private parseLap(l: any, fallbackNum: number): LapData {
    const lapNum = parseInt(l['@_num'], 10) || fallbackNum;
    const position = parseInt(l['@_p'], 10) || 0;

    const bodyVal = typeof l === 'object' && l['#text'] ? l['#text'] : (typeof l === 'string' || typeof l === 'number' ? String(l) : '');
    const lapTime = parseTimeStringToSeconds(bodyVal);

    const s1 = parseTimeStringToSeconds(l['@_s1']);
    const s2 = parseTimeStringToSeconds(l['@_s2']);
    const s3 = parseTimeStringToSeconds(l['@_s3']);
    const topSpeed = parseFloat(l['@_topspeed']) || null;
    const fCompound = l['@_fcompound'] ? String(l['@_fcompound']).split(',').pop()?.trim() || String(l['@_fcompound']) : '';
    const rCompound = l['@_rcompound'] ? String(l['@_rcompound']).split(',').pop()?.trim() || String(l['@_rcompound']) : '';
    const isPitStop = l['@_pit'] === '1' || l['@_pit'] === 1 || l['@_et'] === '--.---';

    const rawEt = l['@_et'];
    const elapsedSeconds = rawEt !== undefined && rawEt !== null && rawEt !== '--.---' && rawEt !== '' && !isNaN(parseFloat(rawEt))
      ? parseFloat(parseFloat(rawEt).toFixed(3))
      : null;
    const elapsedTimeString = elapsedSeconds !== null && elapsedSeconds >= 0
      ? formatElapsedSeconds(elapsedSeconds)
      : undefined;

    const cleanCompound = (val?: any): string | undefined => {
      if (!val) return undefined;
      const str = String(val).split(',').pop()?.trim();
      return str || undefined;
    };

    const flCompound = cleanCompound(l['@_FL'] || l['@_fl']);
    const frCompound = cleanCompound(l['@_FR'] || l['@_fr']);
    const rlCompound = cleanCompound(l['@_RL'] || l['@_rl']);
    const rrCompound = cleanCompound(l['@_RR'] || l['@_rr']);

    const parsePercentVal = (val: any): number | null => {
      if (val === undefined || val === null || val === '') return null;
      const parsed = parseFloat(val);
      if (isNaN(parsed)) return null;
      // If LMU outputs fraction e.g. 0.957 -> convert to 95.7%
      const pct = parsed <= 1.0 && parsed >= 0 ? parsed * 100 : parsed;
      return parseFloat(pct.toFixed(1));
    };

    const fl = parsePercentVal(l['@_twfl']);
    const fr = parsePercentVal(l['@_twfr']);
    const rl = parsePercentVal(l['@_twrl']);
    const rr = parsePercentVal(l['@_twrr']);

    let tireWear: TireWear | undefined = undefined;
    if (fl !== null || fr !== null || rl !== null || rr !== null) {
      const validWearVals = [fl, fr, rl, rr].filter((v): v is number => v !== null);
      const avg = validWearVals.length > 0
        ? parseFloat((validWearVals.reduce((a, b) => a + b, 0) / validWearVals.length).toFixed(1))
        : 100;
      tireWear = {
        fl: fl ?? avg,
        fr: fr ?? avg,
        rl: rl ?? avg,
        rr: rr ?? avg,
        avg,
      };
    }

    const fuel = parsePercentVal(l['@_fuel']);
    const rawFuelUsed = l['@_fuelUsed'] !== undefined
      ? parseFloat(l['@_fuelUsed'])
      : l['@_fuelused'] !== undefined
      ? parseFloat(l['@_fuelused'])
      : null;
    const fuelUsed = rawFuelUsed !== null && !isNaN(rawFuelUsed) ? parsePercentVal(rawFuelUsed) : null;

    const virtualEnergy = parsePercentVal(l['@_ve'] ?? l['@_VE']);
    const rawVeUsed = l['@_veUsed'] ?? l['@_veused'] ?? l['@_VEUsed'];
    const virtualEnergyUsed = rawVeUsed !== undefined ? parsePercentVal(rawVeUsed) : null;

    const isValid = lapTime !== null && lapTime > 0;

    return {
      lapNum,
      position,
      lapTime,
      lapTimeString: formatTime(lapTime),
      s1,
      s2,
      s3,
      topSpeed,
      fCompound,
      rCompound,
      flCompound,
      frCompound,
      rlCompound,
      rrCompound,
      tireWear,
      fuel,
      fuelUsed,
      virtualEnergy,
      virtualEnergyUsed,
      elapsedSeconds,
      elapsedTimeString,
      isPitStop,
      isValid,
    };
  }

  private findMatchingReplay(
    trackVenue: string,
    sessionCode: string,
    sessionTimestampMs: number,
    xmlFileMtimeMs: number
  ): ReplayFileEntry | undefined {
    if (this.replaysMap.length === 0) return undefined;

    const normXmlTrack = trackVenue.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normSession = sessionCode.toLowerCase();

    const getMinDiff = (v: ReplayFileEntry) =>
      Math.min(Math.abs(v.mtime - sessionTimestampMs), Math.abs(v.mtime - xmlFileMtimeMs));

    const candidates = this.replaysMap.filter(v => {
      const minDiff = getMinDiff(v);
      if (minDiff > 600000) return false;

      const normVcrTrack = v.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const trackMatches = matchesTrack(v.trackName, trackVenue, '') || normXmlTrack.includes(normVcrTrack) || normVcrTrack.includes(normXmlTrack);
      const sessionMatches = v.sessionCode.toLowerCase() === normSession;

      return trackMatches && (sessionMatches || minDiff < 180000);
    });

    if (candidates.length === 0) return undefined;

    candidates.sort((a, b) => getMinDiff(a) - getMinDiff(b));
    return candidates[0];
  }
}

/**
 * Computes chronological session-over-session improvement points for a driver or overall.
 */
export function computeProgression(sessions: DetailedSession[], targetDriverName?: string): SessionProgressionPoint[] {
  const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp);

  return sorted.map(s => {
    let driver = targetDriverName
      ? s.drivers.find(d => d.name.toLowerCase() === targetDriverName.toLowerCase())
      : s.playerDriver || s.drivers[0];

    if (!driver && s.drivers.length > 0) {
      driver = s.drivers[0];
    }

    const cleanLapsCount = driver?.laps.filter(l => l.isValid && l.lapTime).length || 0;
    const totalLapsCount = driver?.lapsCount || 0;
    const avgLapTime = driver?.laps ? computeAverageLapTime(driver.laps) : null;

    return {
      sessionId: s.id,
      timestamp: s.timestamp,
      dateString: s.timeString,
      sessionType: s.sessionType,
      sessionName: s.sessionName,
      trackVenue: s.trackVenue,
      trackCourse: s.trackCourse,
      displayTrack: getDisplayTrackName(s.trackVenue, s.trackCourse),
      weatherInfo: s.weatherInfo,
      carType: driver?.carType || 'Unknown Car',
      carClass: driver?.carClass || 'General',
      driverName: driver?.name || 'Unknown',
      bestLapTime: driver?.bestLapTime || null,
      bestS1: driver?.bestS1 || null,
      bestS2: driver?.bestS2 || null,
      bestS3: driver?.bestS3 || null,
      theoreticalBest: driver?.theoreticalBest || null,
      cleanLapsCount,
      totalLapsCount,
      avgLapTime,
      matchingReplayFile: s.matchingReplayFile?.name,
    };
  });
}

/**
 * Aggregates summary statistics per track.
 */
export function computeTrackSummaries(sessions: DetailedSession[]): Record<string, TrackSummary> {
  const map: Record<string, TrackSummary> = {};

  sessions.forEach(s => {
    const track = getDisplayTrackName(s.trackVenue, s.trackCourse);
    if (!map[track]) {
      map[track] = {
        trackVenue: track,
        sessionsCount: 0,
        totalLaps: 0,
        bestLapTime: null,
        bestLapDriver: '',
        bestLapCar: '',
        bestS1: null,
        bestS2: null,
        bestS3: null,
        theoreticalBest: null,
        carsUsed: [],
      };
    }

    const summary = map[track];
    summary.sessionsCount += 1;

    const p = s.playerDriver || s.drivers.find(d => d.isPlayer);
    if (p) {
      summary.totalLaps += p.lapsCount || 0;
      if (p.carType && !summary.carsUsed.includes(p.carType)) {
        summary.carsUsed.push(p.carType);
      }

      if (p.bestLapTime && (summary.bestLapTime === null || p.bestLapTime < summary.bestLapTime)) {
        summary.bestLapTime = p.bestLapTime;
        summary.bestLapDriver = p.name;
        summary.bestLapCar = p.carType;
      }
      summary.bestS1 = updateMinTime(summary.bestS1, p.bestS1);
      summary.bestS2 = updateMinTime(summary.bestS2, p.bestS2);
      summary.bestS3 = updateMinTime(summary.bestS3, p.bestS3);
    }

    summary.theoreticalBest = computeTheoreticalBest(summary.bestS1, summary.bestS2, summary.bestS3);
  });

  return map;
}

/**
 * Extracts and aggregates comparable laps across sessions matching a specific track and optional filters.
 */
export function extractComparableLaps(
  sessions: DetailedSession[],
  filters: {
    trackName?: string;
    carClass?: string;
    carModel?: string;
    driverName?: string;
    sessionId?: string;
    playerOnly?: boolean;
  }
) {
  const normTrack = (filters.trackName || '').toLowerCase().trim();
  const targetClass = (filters.carClass || '').trim();
  const targetModel = (filters.carModel || '').toLowerCase().trim();
  const targetDriver = (filters.driverName || '').toLowerCase().trim();

  const matchingSessions = sessions.filter(s => {
    if (!normTrack || normTrack === 'all') return true;
    return matchesTrack(filters.trackName, s.trackVenue, s.trackCourse);
  });

  const laps: any[] = [];
  let allTimeBestLap: any = null;
  let bestS1: number | null = null;
  let bestS2: number | null = null;
  let bestS3: number | null = null;

  matchingSessions.forEach(s => {
    if (filters.sessionId && s.id !== filters.sessionId) {
      // If a specific session is requested for isolation, but we still search all matching sessions for all-time stats
    }

    const driversToProcess = filters.playerOnly
      ? (s.playerDriver ? [s.playerDriver] : s.drivers.filter(d => d.isPlayer))
      : s.drivers;

    driversToProcess.forEach(d => {
      if (targetDriver && targetDriver !== 'all' && !d.name.toLowerCase().includes(targetDriver)) {
        return;
      }

      if (targetClass && targetClass !== 'All') {
        const dClass = d.carClass || '';
        const dType = d.carType || '';
        const normTarget = targetClass.toUpperCase();
        const normD = `${dClass} ${dType}`.toUpperCase();
        
        const isLMH = (normTarget.includes('HYPER') || normTarget.includes('LMH')) && (normD.includes('HYPER') || normD.includes('LMH') || normD.includes('LMDH'));
        const isGT3 = (normTarget.includes('GT3') || normTarget.includes('LMGT3')) && (normD.includes('GT3') || normD.includes('LMGT3'));
        const isLMP2 = normTarget.includes('LMP2') && normD.includes('LMP2');
        const isGTE = normTarget.includes('GTE') && normD.includes('GTE');
        
        if (!isLMH && !isGT3 && !isLMP2 && !isGTE && !normD.includes(normTarget)) {
          return;
        }
      }

      if (targetModel && targetModel !== 'all' && d.carType.toLowerCase().trim() !== targetModel) {
        return;
      }

      const sessionBestTime = d.bestLapTime;

      (d.laps || []).forEach(l => {
        const isSessionBest = l.lapTime !== null && sessionBestTime !== null && Math.abs(l.lapTime - sessionBestTime) < 0.0005;
        
        const lapItem = {
          id: `${s.id}_${d.name}_lap_${l.lapNum}`,
          sessionId: s.id,
          sessionName: s.sessionName,
          sessionType: s.sessionType,
          dateString: s.timeString,
          timestamp: s.timestamp,
          driverName: d.name,
          carType: d.carType,
          carClass: d.carClass || 'General',
          lapNum: l.lapNum,
          lapTime: l.lapTime,
          lapTimeString: l.lapTimeString,
          s1: l.s1,
          s2: l.s2,
          s3: l.s3,
          s1String: formatTime(l.s1),
          s2String: formatTime(l.s2),
          s3String: formatTime(l.s3),
          topSpeed: l.topSpeed,
          fCompound: l.fCompound,
          rCompound: l.rCompound,
          flCompound: l.flCompound,
          frCompound: l.frCompound,
          rlCompound: l.rlCompound,
          rrCompound: l.rrCompound,
          tireWear: l.tireWear,
          fuel: l.fuel,
          fuelUsed: l.fuelUsed,
          virtualEnergy: l.virtualEnergy,
          virtualEnergyUsed: l.virtualEnergyUsed,
          elapsedSeconds: l.elapsedSeconds,
          elapsedTimeString: l.elapsedTimeString,
          pitStopDurationString: l.pitStopDurationString,
          gapToLeaderString: l.gapToLeaderString,
          isPitStop: l.isPitStop,
          isValid: l.isValid,
          paceCategory: l.paceCategory || null,
          pacePercentage: l.pacePercentage || null,
          isSessionBest,
        };

        if (l.isValid && l.lapTime && l.lapTime > 0) {
          if (!allTimeBestLap || l.lapTime < allTimeBestLap.lapTime) {
            allTimeBestLap = { ...lapItem, isAllTimePB: true, tag: '⭐ All-Time Best Lap' };
          }
          if (l.s1 && (bestS1 === null || l.s1 < bestS1)) bestS1 = l.s1;
          if (l.s2 && (bestS2 === null || l.s2 < bestS2)) bestS2 = l.s2;
          if (l.s3 && (bestS3 === null || l.s3 < bestS3)) bestS3 = l.s3;
        }

        if (!filters.sessionId || s.id === filters.sessionId) {
          laps.push(lapItem);
        }
      });
    });
  });

  const theoreticalBestSec = bestS1 !== null && bestS2 !== null && bestS3 !== null
    ? parseFloat((bestS1 + bestS2 + bestS3).toFixed(3))
    : null;

  return {
    laps,
    allTimeBestLap,
    bestS1,
    bestS2,
    bestS3,
    bestS1String: formatTime(bestS1),
    bestS2String: formatTime(bestS2),
    bestS3String: formatTime(bestS3),
    theoreticalBestSec,
    theoreticalBestString: formatTime(theoreticalBestSec),
    sessionsCount: matchingSessions.length,
  };
}

