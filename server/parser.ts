import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import {
  DetailedSession,
  DriverData,
  LapData,
  SessionMetadata,
  SessionProgressionPoint,
  SessionWeather,
  TrackSummary,
} from './types.js';
import {
  formatTime,
  parseTimeStringToSeconds,
  getDisplayTrackName,
  computeTheoreticalBest,
} from '../src/utils/formatters.js';
import { calculatePaceCategory } from './referenceLaptimes.js';

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

    // Best Laps & Sectors
    let bestLapTime: number | null = parseTimeStringToSeconds(d.BestLapTime);
    let bestS1: number | null = null;
    let bestS2: number | null = null;
    let bestS3: number | null = null;

    laps.forEach(lap => {
      if (lap.isValid && lap.lapTime) {
        bestLapTime = updateMinTime(bestLapTime, lap.lapTime);
      }
      bestS1 = updateMinTime(bestS1, lap.s1);
      bestS2 = updateMinTime(bestS2, lap.s2);
      bestS3 = updateMinTime(bestS3, lap.s3);
    });

    const theoreticalBest = computeTheoreticalBest(bestS1, bestS2, bestS3);

    const validLaps = laps.filter(l => l.isValid && l.lapTime);
    let avgLapTime: number | null = null;
    if (validLaps.length > 0) {
      const sum = validLaps.reduce((acc, l) => acc + (l.lapTime || 0), 0);
      avgLapTime = parseFloat((sum / validLaps.length).toFixed(3));
    }

    const top3LapsCount = laps.filter(l => l.isValid && l.position > 0 && l.position <= 3).length;

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
      avgLapTime,
      avgLapTimeString: formatTime(avgLapTime),
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
    const fCompound = l['@_fcompound'] ? String(l['@_fcompound']).split(',').pop() || String(l['@_fcompound']) : '';
    const rCompound = l['@_rcompound'] ? String(l['@_rcompound']).split(',').pop() || String(l['@_rcompound']) : '';
    const isPitStop = l['@_pit'] === '1' || l['@_pit'] === 1 || l['@_et'] === '--.---';

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
      const trackMatches = normXmlTrack.includes(normVcrTrack) || normVcrTrack.includes(normXmlTrack);
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

    const validLaps = driver?.laps.filter(l => l.isValid && l.lapTime) || [];
    const cleanLapsCount = validLaps.length;
    const totalLapsCount = driver?.lapsCount || 0;

    let avgLapTime: number | null = null;
    if (cleanLapsCount > 0) {
      const sum = validLaps.reduce((acc, l) => acc + (l.lapTime || 0), 0);
      avgLapTime = parseFloat((sum / cleanLapsCount).toFixed(3));
    }

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
