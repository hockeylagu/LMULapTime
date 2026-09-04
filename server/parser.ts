import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import {
  DetailedSession,
  DriverData,
  LapData,
  LapIncident,
  LapPenalty,
  LapTrackLimit,
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
  parseDateStringToTimestamp,
  getSessionTypeWeight,
  compareSessions,
} from '../src/utils/formatters.js';
import { calculatePaceCategory } from './referenceLaptimes.js';
import { matchesTrack } from '../src/utils/paceCategory.js';

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
  const completedLaps = laps.filter(l => l.lapTime !== null && l.lapTime > 0);
  if (completedLaps.length === 0) return null;

  const hasMultipleLaps = completedLaps.length > 1;
  const cleanFlyingCandidates = completedLaps.filter((l, idx, arr) => {
    const prevLap = idx > 0 ? arr[idx - 1] : null;
    const prevIsValidPitStop = Boolean(prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0);
    const isOut = Boolean(l.isOutLap || prevIsValidPitStop);
    return !l.isPitStop && !isOut;
  });

  // 1. Prefer valid flying laps (lapNum > 1, not pit stop, and not out-lap)
  const validFlying = cleanFlyingCandidates.filter(l => l.isValid && (!hasMultipleLaps || l.lapNum > 1));
  if (validFlying.length > 0) {
    const sum = validFlying.reduce((acc, l) => acc + (l.lapTime || 0), 0);
    return parseFloat((sum / validFlying.length).toFixed(3));
  }

  // 2. Otherwise any valid non-pit non-out laps (including lap 1 if it's the only valid non-pit lap)
  const anyValid = cleanFlyingCandidates.filter(l => l.isValid);
  if (anyValid.length > 0) {
    const sum = anyValid.reduce((acc, l) => acc + (l.lapTime || 0), 0);
    return parseFloat((sum / anyValid.length).toFixed(3));
  }

  // 3. Otherwise non-pit non-out flying laps
  const nonPitFlying = cleanFlyingCandidates.filter(l => !hasMultipleLaps || l.lapNum > 1);
  if (nonPitFlying.length > 0) {
    const sum = nonPitFlying.reduce((acc, l) => acc + (l.lapTime || 0), 0);
    return parseFloat((sum / nonPitFlying.length).toFixed(3));
  }

  // 4. Fallback to cleanFlyingCandidates, or completedLaps
  const fallback = cleanFlyingCandidates.length > 0 ? cleanFlyingCandidates : completedLaps;
  const sum = fallback.reduce((acc, l) => acc + (l.lapTime || 0), 0);
  return parseFloat((sum / fallback.length).toFixed(3));
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

      let baseTimestamp = raceResults.DateTime ? parseInt(raceResults.DateTime, 10) * 1000 : 0;
      if (!baseTimestamp && timeString) {
        baseTimestamp = parseDateStringToTimestamp(timeString);
      }
      if (!baseTimestamp) {
        try {
          const stats = fs.statSync(filePath);
          baseTimestamp = Math.floor(stats.mtimeMs);
        } catch {
          baseTimestamp = Date.now();
        }
      }
      // Add session type weight (Practice < Quali < Race) so same-date sessions order chronologically
      const timestamp = baseTimestamp + getSessionTypeWeight(sessionType, sessionName);

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

      // Parse Incidents, Track Limits, Penalties, and Damage from Stream container
      const streamNode = sessionDataNode?.Stream ?? raceResults.Stream;
      if (streamNode) {
        this.parseStreamEvents(streamNode, drivers);
      }

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

      const rawSetting = sessionDataNode?.Setting ?? raceResults.Setting;
      const rawServerName = sessionDataNode?.ServerName ?? raceResults.ServerName;
      const rawDamage = sessionDataNode?.DamageMult ?? raceResults.DamageMult;
      const rawFuel = sessionDataNode?.FuelMult ?? raceResults.FuelMult;
      const rawTire = sessionDataNode?.TireMult ?? raceResults.TireMult;
      const rawWarmers = sessionDataNode?.TireWarmers ?? raceResults.TireWarmers;
      const rawSetups = sessionDataNode?.FixedSetups ?? raceResults.FixedSetups;
      const rawUpgrades = sessionDataNode?.FixedUpgrades ?? raceResults.FixedUpgrades;
      const rawParcFerme = sessionDataNode?.ParcFerme ?? raceResults.ParcFerme;
      const rawMechFail = sessionDataNode?.MechFailRate ?? raceResults.MechFailRate;
      const rawDuration = sessionDataNode?.Minutes ?? raceResults.Minutes ?? sessionDataNode?.RaceTime ?? raceResults.RaceTime;
      const rawRaceLaps = sessionDataNode?.RaceLaps ?? raceResults.RaceLaps;
      const rawRaceTime = sessionDataNode?.RaceTime ?? raceResults.RaceTime;
      const rawVehiclesAllowed = sessionDataNode?.VehiclesAllowed ?? raceResults.VehiclesAllowed;

      const hasAnySetting = [
        rawSetting, rawServerName, rawDamage, rawFuel, rawTire, rawWarmers,
        rawSetups, rawUpgrades, rawParcFerme, rawMechFail, rawDuration, rawRaceLaps, rawRaceTime, rawVehiclesAllowed
      ].some(v => v !== undefined && v !== null && v !== '');

      const settings: SessionSettings | undefined = hasAnySetting ? {
        modeSetting: rawSetting ? String(rawSetting) : undefined,
        serverName: rawServerName ? String(rawServerName) : undefined,
        damageMultiplier: parseNum(rawDamage),
        fuelMultiplier: parseNum(rawFuel),
        tireMultiplier: parseNum(rawTire),
        tireWarmers: parseBool(rawWarmers),
        fixedSetups: parseBool(rawSetups),
        fixedUpgrades: parseBool(rawUpgrades),
        parcFerme: parseNum(rawParcFerme),
        mechFailRate: parseNum(rawMechFail),
        durationMinutes: parseNum(rawDuration),
        raceLaps: parseNum(rawRaceLaps),
        raceTimeMinutes: parseNum(rawRaceTime),
        vehiclesAllowed: rawVehiclesAllowed ? String(rawVehiclesAllowed) : undefined,
      } : undefined;

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

    // Mark out-laps: any lap immediately following a valid pit stop (completed in-lap)
    for (let i = 0; i < laps.length; i++) {
      const prevLap = i > 0 ? laps[i - 1] : null;
      const prevIsValidPitStop = Boolean(prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0);
      if (prevIsValidPitStop && !laps[i].isPitStop) {
        laps[i].isOutLap = true;
      }
    }

    // Best Laps & Sectors - Strictly calculated from valid completed laps (before any inference)
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

    // Infer lap time for incomplete laps from session elapsed time if it makes sense and is possible
    for (let i = 0; i < laps.length; i++) {
      const curLap = laps[i];
      if (curLap.lapTime === null || curLap.lapTime <= 0) {
        let inferredTime: number | null = null;

        // Case 1: All 3 sectors are present (sometimes LMU logs sectors but omits body time on cut tracks)
        if (curLap.s1 !== null && curLap.s2 !== null && curLap.s3 !== null && curLap.s1 > 0 && curLap.s2 > 0 && curLap.s3 > 0) {
          inferredTime = parseFloat((curLap.s1 + curLap.s2 + curLap.s3).toFixed(3));
        }

        // Case 2: Infer from session elapsed time delta vs previous lap
        if (inferredTime === null && typeof curLap.elapsedSeconds === 'number' && curLap.elapsedSeconds > 0) {
          const prevLapEt = i > 0 ? laps[i - 1].elapsedSeconds : null;
          if (typeof prevLapEt === 'number' && prevLapEt > 0) {
            const deltaEt = parseFloat((curLap.elapsedSeconds - prevLapEt).toFixed(3));

            if (deltaEt > 0) {
              const knownSectors = (curLap.s1 || 0) + (curLap.s2 || 0) + (curLap.s3 || 0);
              const passesSectorCheck = knownSectors === 0 || deltaEt >= knownSectors;

              // Reasonable lap duration threshold:
              // Cap at 3.5x bestLapTime or 600s (10 minutes) to avoid counting extended garage idle time
              const maxAllowed = bestLapTime ? Math.max(bestLapTime * 3.5, 300) : 600;
              const minAllowed = 10;

              if (passesSectorCheck && deltaEt >= minAllowed && deltaEt <= maxAllowed) {
                inferredTime = deltaEt;

                // If S1 and S2 are present but S3 is missing, deduce S3
                if (curLap.s1 !== null && curLap.s2 !== null && (curLap.s3 === null || curLap.s3 <= 0)) {
                  const s3Est = parseFloat((deltaEt - curLap.s1 - curLap.s2).toFixed(3));
                  if (s3Est > 0) {
                    curLap.s3 = s3Est;
                  }
                }
              }
            }
          }
        }

        if (inferredTime !== null && inferredTime > 0) {
          curLap.lapTime = inferredTime;
          curLap.lapTimeString = formatTime(inferredTime);
          curLap.isInferred = true;
          // curLap.isValid remains false to keep official leaderboards and records uncorrupted
        }
      }
    }

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

    // Compute Fuel & VE Averages across valid flying laps (exclude pit laps, out laps, and negative/anomalous fuel values)
    const validFuelLaps = laps.filter(l => l.isValid && !l.isPitStop && !l.isOutLap && l.fuelUsed !== null && l.fuelUsed !== undefined && l.fuelUsed > 0 && l.fuelUsed < 25);
    const avgFuelPerLap = validFuelLaps.length > 0
      ? parseFloat((validFuelLaps.reduce((acc, l) => acc + (l.fuelUsed || 0), 0) / validFuelLaps.length).toFixed(2))
      : null;
    const estFuelStintLaps = avgFuelPerLap && avgFuelPerLap > 0
      ? Math.floor(100 / avgFuelPerLap)
      : null;

    // Virtual Energy (VE / NRG) applies to both Hypercar and LMGT3 under FIA WEC BoP stint rules
    const validVeLaps = laps.filter(l => l.isValid && !l.isPitStop && !l.isOutLap && l.virtualEnergyUsed !== null && l.virtualEnergyUsed !== undefined && l.virtualEnergyUsed > 0 && l.virtualEnergyUsed < 25);
    const avgVePerLap = validVeLaps.length > 0
      ? parseFloat((validVeLaps.reduce((acc, l) => acc + (l.virtualEnergyUsed || 0), 0) / validVeLaps.length).toFixed(2))
      : null;
    const estVeStintLaps = avgVePerLap && avgVePerLap > 0
      ? Math.floor(100 / avgVePerLap)
      : null;

    // Completed laps (valid or not, but completed with recorded lap time)
    const completedLaps = laps.filter(l => l.lapTime !== null && l.lapTime > 0);

    // Starting Grid, Finish Position & Position Deltas
    const parsedGrid = parseInt(d.GridPos ?? d.GridPosition ?? d.QualPosition ?? d.Grid, 10);
    const gridPosition: number | null = !isNaN(parsedGrid) && parsedGrid > 0
      ? parsedGrid
      : (laps.length > 0 && laps[0].position > 0 ? laps[0].position : null);

    const parsedClassGrid = parseInt(d.ClassGridPos ?? d.ClassGridPosition ?? d.ClassGrid, 10);
    const classGridPosition: number | null = !isNaN(parsedClassGrid) && parsedClassGrid > 0
      ? parsedClassGrid
      : null;

    const positionGain: number | null = gridPosition !== null && position > 0
      ? gridPosition - position
      : null;

    const classPositionGain: number | null = classGridPosition !== null && classPosition > 0
      ? classGridPosition - classPosition
      : null;

    // Finish Status, DNF Reason, and Pit Stops
    const rawFinishStatus = d.FinishStatus ? String(d.FinishStatus).trim() : '';
    const dnfReason = d.Reason ? String(d.Reason).trim() : undefined;
    const finishStatus = rawFinishStatus || (dnfReason ? `DNF (${dnfReason})` : (position > 0 ? 'Finished' : undefined));

    const rawPitstops = parseInt(d.Pitstops ?? d.PitStops ?? d.NumPitstops, 10);
    const pitStopsCount = !isNaN(rawPitstops) && rawPitstops >= 0
      ? rawPitstops
      : laps.filter(l => l.isPitStop).length;

    // Laps Led (Laps in P1) and Peak/Lowest positions reached
    const lapsLedCount = laps.filter(l => l.position === 1).length;
    const validPositions = [
      ...(gridPosition ? [gridPosition] : []),
      ...(position > 0 ? [position] : []),
      ...laps.map(l => l.position).filter(p => p > 0)
    ];
    const highestPosition = validPositions.length > 0 ? Math.min(...validPositions) : null;
    const lowestPosition = validPositions.length > 0 ? Math.max(...validPositions) : null;

    // Final gap to leader at finish
    const lastLapWithGap = [...laps].reverse().find(l => l.gapToLeaderString);
    const finishGapToLeaderString = lastLapWithGap?.gapToLeaderString;

    return {
      name,
      carType,
      carClass,
      carNumber,
      teamName,
      isPlayer,
      position,
      classPosition,
      gridPosition,
      classGridPosition,
      positionGain,
      classPositionGain,
      finishStatus,
      dnfReason,
      pitStopsCount,
      lapsLedCount,
      highestPosition,
      lowestPosition,
      finishGapToLeaderString,
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
      lapsCount: completedLaps.length,
      totalIncidents: 0,
      totalTrackLimits: 0,
      totalPenalties: 0,
      incidents: [],
      trackLimits: [],
      penalties: [],
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
    const isPitStop = (l['@_pit'] === '1' || l['@_pit'] === 1 || (l['@_et'] === '--.---' && lapNum > 1)) && !(lapNum === 1 && (lapTime === null || lapTime <= 0));

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
      incidentCount: 0,
      trackLimitCount: 0,
      penaltyCount: 0,
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

  private parseStreamEvents(streamNode: any, drivers: DriverData[]) {
    if (!streamNode || !drivers || drivers.length === 0) return;

    const cleanDriverName = (raw?: string): string => {
      if (!raw) return '';
      return String(raw)
        .replace(/#\d+/g, '')
        .replace(/\(\d+\)/g, '')
        .trim()
        .toLowerCase();
    };

    const driversWithClean = drivers.map(d => ({
      driver: d,
      clean: cleanDriverName(d.name),
    }));

    const matchDriver = (rawName?: string): DriverData | undefined => {
      const clean = cleanDriverName(rawName);
      if (!clean) return undefined;
      const found = driversWithClean.find(({ clean: dClean }) =>
        dClean === clean || dClean.includes(clean) || clean.includes(dClean)
      );
      return found?.driver;
    };

    const matchLapForDriver = (driver: DriverData, et?: number, explicitLapNum?: number): LapData | undefined => {
      if (!driver.laps || driver.laps.length === 0) return undefined;

      if (explicitLapNum !== undefined && explicitLapNum > 0) {
        const explicitLap = driver.laps.find(l => l.lapNum === explicitLapNum);
        if (explicitLap) return explicitLap;
      }

      if (et === undefined || isNaN(et)) {
        return driver.laps[0];
      }

      for (let i = 0; i < driver.laps.length; i++) {
        const lap = driver.laps[i];
        const nextLap = i + 1 < driver.laps.length ? driver.laps[i + 1] : undefined;
        const isLastLap = i === driver.laps.length - 1;

        const startEt = lap.elapsedSeconds !== null && lap.elapsedSeconds !== undefined && lap.elapsedSeconds > 0
          ? lap.elapsedSeconds
          : (i > 0 && driver.laps[i - 1].elapsedSeconds ? driver.laps[i - 1].elapsedSeconds! : 0);

        let endEt: number;
        if (nextLap && nextLap.elapsedSeconds !== null && nextLap.elapsedSeconds !== undefined && nextLap.elapsedSeconds > 0) {
          endEt = nextLap.elapsedSeconds;
        } else if (lap.lapTime !== null && lap.lapTime > 0) {
          endEt = startEt + lap.lapTime;
        } else {
          endEt = Infinity;
        }

        if (et >= startEt && (et < endEt || (isLastLap && et <= endEt + 120))) {
          return lap;
        }
      }

      if (driver.laps.length > 0) {
        const firstLap = driver.laps[0];
        if (firstLap.elapsedSeconds && et < firstLap.elapsedSeconds) {
          return firstLap;
        }
        return driver.laps[driver.laps.length - 1];
      }

      return undefined;
    };

    // 1. Process Incidents
    const rawIncidents = streamNode.Incident ? (Array.isArray(streamNode.Incident) ? streamNode.Incident : [streamNode.Incident]) : [];
    rawIncidents.forEach((inc: any) => {
      const et = inc['@_et'] !== undefined ? parseFloat(inc['@_et']) : undefined;
      const text = typeof inc === 'object' && inc['#text'] ? inc['#text'] : (typeof inc === 'string' ? inc : '');
      if (!text) return;

      const match = text.match(/^(.+?)(?:#\d+)?\(\d+\)\s+reported contact\s+\(([0-9.]+)\)\s+with\s+(.+)$/i);
      if (!match) return;

      const rawDriver = match[1].trim();
      const force = parseFloat(match[2]);
      const target = match[3].trim();
      const driver = matchDriver(rawDriver);
      if (!driver) return;

      const isOtherVehicle = /^another vehicle/i.test(target);
      const otherVehicle = isOtherVehicle
        ? target.replace(/^another vehicle\s+/i, '').replace(/(?:#\d+)?\(\d+\)$/, '').trim()
        : undefined;
      const isWallImpact = !isOtherVehicle;

      const forceStr = !isNaN(force) && force > 0 ? ` (${force.toFixed(0)}N)` : '';
      const description = isOtherVehicle
        ? `Contact with ${otherVehicle || 'vehicle'}${forceStr}`
        : `Contact with ${target || 'barrier'}${forceStr}`;

      const lap = matchLapForDriver(driver, et);

      const incident: LapIncident = {
        type: 'contact',
        description,
        details: description,
        lapNum: lap ? lap.lapNum : undefined,
        elapsedSeconds: et,
        force: !isNaN(force) ? force : undefined,
        otherVehicle,
        isWallImpact,
      };

      if (!driver.incidents) driver.incidents = [];
      driver.incidents.push(incident);

      if (lap) {
        if (!lap.incidents) lap.incidents = [];
        lap.incidents.push(incident);
        lap.incidentCount = lap.incidents.length;
      }
    });

    // 2. Process Sector Damage
    const rawSectors = streamNode.Sector ? (Array.isArray(streamNode.Sector) ? streamNode.Sector : [streamNode.Sector]) : [];
    rawSectors.forEach((sec: any) => {
      const et = sec['@_et'] !== undefined ? parseFloat(sec['@_et']) : undefined;
      const text = typeof sec === 'object' && sec['#text'] ? sec['#text'] : (typeof sec === 'string' ? sec : '');
      if (!text) return;

      const match = text.match(/^(.+?)(?:#\d+)?\(\d+\)\s+reports new\s+(.+)$/i);
      if (!match) return;

      const rawDriver = match[1].trim();
      const damageType = match[2].trim();
      const driver = matchDriver(rawDriver);
      if (!driver) return;

      const lap = matchLapForDriver(driver, et);

      const incident: LapIncident = {
        type: 'damage',
        description: `New ${damageType} reported`,
        details: `New ${damageType} reported`,
        lapNum: lap ? lap.lapNum : undefined,
        elapsedSeconds: et,
      };

      if (!driver.incidents) driver.incidents = [];
      driver.incidents.push(incident);

      if (lap) {
        if (!lap.incidents) lap.incidents = [];
        lap.incidents.push(incident);
        lap.incidentCount = lap.incidents.length;
      }
    });

    // 3. Process TrackLimits
    const rawTrackLimits = streamNode.TrackLimits ? (Array.isArray(streamNode.TrackLimits) ? streamNode.TrackLimits : [streamNode.TrackLimits]) : [];
    rawTrackLimits.forEach((tl: any) => {
      const rawDriver = tl['@_Driver'] || tl['@_driver'];
      const driver = matchDriver(rawDriver);
      if (!driver) return;

      const et = tl['@_et'] !== undefined ? parseFloat(tl['@_et']) : undefined;
      const lapAttr = tl['@_Lap'] !== undefined ? parseInt(tl['@_Lap'], 10) : undefined;
      const explicitLapNum = lapAttr !== undefined && !isNaN(lapAttr) ? lapAttr + 1 : undefined;

      const warnPts = parseFloat(tl['@_WarningPoints'] ?? tl['@_warningpoints'] ?? 0);
      const curPts = parseFloat(tl['@_CurrentPoints'] ?? tl['@_currentpoints'] ?? 0);
      const action = typeof tl === 'object' && tl['#text'] ? String(tl['#text']).trim() : (typeof tl === 'string' ? tl : 'Warning');

      const isWarning = action.toLowerCase().includes('warning') || warnPts > 0;
      const desc = isWarning
        ? `Track limits violation (+${warnPts || 0.25} pts)`
        : `Track limits review (${action || 'No Further Action'})`;

      const lap = matchLapForDriver(driver, et, explicitLapNum);

      const trackLimit: LapTrackLimit = {
        description: desc,
        lapNum: lap ? lap.lapNum : explicitLapNum,
        elapsedSeconds: et,
        warningPoints: !isNaN(warnPts) ? warnPts : undefined,
        currentPoints: !isNaN(curPts) ? curPts : undefined,
        action,
      };

      if (!driver.trackLimits) driver.trackLimits = [];
      driver.trackLimits.push(trackLimit);

      if (lap) {
        if (!lap.trackLimits) lap.trackLimits = [];
        lap.trackLimits.push(trackLimit);
        lap.trackLimitCount = lap.trackLimits.length;
      }
    });

    // 4. Process Penalties
    const rawPenalties = streamNode.Penalty ? (Array.isArray(streamNode.Penalty) ? streamNode.Penalty : [streamNode.Penalty]) : [];
    rawPenalties.forEach((p: any) => {
      const rawDriver = p['@_Driver'] || p['@_driver'];
      const driver = matchDriver(rawDriver);
      if (!driver) return;

      const et = p['@_et'] !== undefined ? parseFloat(p['@_et']) : undefined;
      const penalty = String(p['@_Penalty'] || p['@_penalty'] || 'Penalty');
      const reason = String(p['@_Reason'] || p['@_reason'] || 'Infraction');
      const text = typeof p === 'object' && p['#text'] ? String(p['#text']).trim() : `${penalty}: ${reason}`;

      const lap = matchLapForDriver(driver, et);

      const item: LapPenalty = {
        penalty,
        reason,
        lapNum: lap ? lap.lapNum : undefined,
        elapsedSeconds: et,
        description: text,
      };

      if (!driver.penalties) driver.penalties = [];
      driver.penalties.push(item);

      if (lap) {
        if (!lap.penalties) lap.penalties = [];
        lap.penalties.push(item);
        lap.penaltyCount = lap.penalties.length;
      }
    });

    drivers.forEach(d => {
      d.totalIncidents = d.incidents ? d.incidents.length : 0;
      d.totalTrackLimits = d.trackLimits ? d.trackLimits.length : 0;
      d.totalPenalties = d.penalties ? d.penalties.length : 0;
    });
  }
}

/**
 * Computes chronological session-over-session improvement points for a driver or overall.
 */
export function computeProgression(sessions: DetailedSession[], targetDriverName?: string): SessionProgressionPoint[] {
  const sorted = [...sessions].sort((a, b) => compareSessions(a, b, 'asc'));

  return sorted.map(s => {
    let driver = targetDriverName
      ? s.drivers.find(d => d.name.toLowerCase() === targetDriverName.toLowerCase())
      : s.playerDriver || s.drivers[0];

    if (!driver && s.drivers.length > 0) {
      driver = s.drivers[0];
    }

    const cleanLaps = (driver?.laps || []).filter(l => l.isValid && l.lapTime !== null && l.lapTime > 0);
    const cleanLapsCount = cleanLaps.length;
    const totalLapsCount = driver?.lapsCount || 0;
    const avgLapTime = driver?.laps ? computeAverageLapTime(driver.laps) : null;

    // Top 3 Clean Lap Average (filters out lap 1, pit stops, and out-laps after valid pit stops)
    const hasMultipleLaps = cleanLaps.length > 1;
    const validFlyingLaps = cleanLaps.filter((l, idx, arr) => {
      const prevLap = idx > 0 ? arr[idx - 1] : null;
      const prevIsValidPitStop = Boolean(prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0);
      const isOut = Boolean(l.isOutLap || prevIsValidPitStop);
      return (!hasMultipleLaps || l.lapNum > 1) && !l.isPitStop && !isOut;
    });
    const lapsForTop3 = validFlyingLaps.length > 0 ? validFlyingLaps : cleanLaps.filter(l => !l.isPitStop && !l.isOutLap);
    const sortedLaps = [...lapsForTop3].sort((a, b) => (a.lapTime || 0) - (b.lapTime || 0));
    const top3Slice = sortedLaps.slice(0, 3);
    const top3AvgLapTime = top3Slice.length > 0
      ? parseFloat((top3Slice.reduce((sum, l) => sum + (l.lapTime || 0), 0) / top3Slice.length).toFixed(3))
      : null;

    // Theoretical Gap (Execution gap: Actual Best - Theoretical Best)
    const theoreticalGap = (driver?.bestLapTime && driver?.theoreticalBest)
      ? parseFloat((driver.bestLapTime - driver.theoreticalBest).toFixed(3))
      : null;

    // Consistency score (%) based on standard deviation of clean flying laps
    const lapsForConsistency = validFlyingLaps.length >= 2 ? validFlyingLaps : (cleanLaps.length >= 2 ? cleanLaps : validFlyingLaps);
    const consistAvg = lapsForConsistency.length > 0
      ? lapsForConsistency.reduce((sum, l) => sum + (l.lapTime || 0), 0) / lapsForConsistency.length
      : null;
    const stdDev = (consistAvg !== null && lapsForConsistency.length > 1)
      ? Math.sqrt(
          lapsForConsistency.reduce((sum, l) => sum + Math.pow((l.lapTime || 0) - consistAvg, 2), 0) /
            lapsForConsistency.length
        )
      : null;
    const consistencyScore = (consistAvg !== null && stdDev !== null && consistAvg > 0)
      ? parseFloat(Math.max(0, Math.min(100, (1 - stdDev / consistAvg) * 100)).toFixed(1))
      : null;

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
      top3AvgLapTime,
      theoreticalGap,
      consistencyScore,
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
  let overallTrackBestLap: any = null;
  let bestS1: number | null = null;
  let bestS2: number | null = null;
  let bestS3: number | null = null;

  matchingSessions.forEach(s => {
    if (filters.sessionId && s.id !== filters.sessionId) {
      // If a specific session is requested for isolation, but we still search all matching sessions for all-time stats
    }

    // Check all drivers in matching sessions to determine overall track record without driver restriction
    (s.drivers || []).forEach(d => {
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

      (d.laps || []).forEach(l => {
        if (l.isValid && l.lapTime && l.lapTime > 0) {
          if (!overallTrackBestLap || l.lapTime < overallTrackBestLap.lapTime) {
            overallTrackBestLap = {
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
              isOverallTrackBest: true,
              tag: `🏆 All-Time Best (${d.name})`,
            };
          }
        }
      });
    });

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
          isOutLap: l.isOutLap || false,
          isValid: l.isValid,
          isInferred: l.isInferred || false,
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
    overallTrackBestLap,
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

