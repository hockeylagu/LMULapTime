import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import {
  DetailedSession,
  DriverData,
  LapData,
  SessionMetadata,
  SessionSettings,
  SessionWeather,
  TireWear,
} from '../core/types.js';
import { parseReplayMetadata, detectPlayerName } from '../replay/replayParser.js';
import {
  formatTime,
  formatElapsedSeconds,
  parseTimeStringToSeconds,
  computeTheoreticalBest,
  parseDateStringToTimestamp,
  getSessionTypeWeight,
  minValidTime,
} from '../../shared/domain/formatters.js';
import { calculatePaceCategory } from '../benchmarks/referenceLaptimes.js';
import { matchesTrack } from '../../shared/domain/paceCategory.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import {
  RawLapXmlNode,
  RawDriverXmlNode,
  RawStreamXmlNode,
  RawSessionXmlNode,
  ReplayFileEntry,
} from './sessionXmlTypes.js';
import { parseStreamEvents } from './sessionXmlStream.js';
import { computeAverageLapTime } from './sessionAnalytics.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

const updateMinTime = minValidTime;

export class LmuParser {
  private replaysMap: ReplayFileEntry[] = [];
  public configuredPlayerName: string = '';

  constructor(replaysDir?: string, resultsDir?: string) {
    this.detectPlayerName(resultsDir || replaysDir);
    if (replaysDir && fs.existsSync(replaysDir)) {
      this.indexReplays(replaysDir);
    }
  }

  public getReplaysList(): ReplayFileEntry[] {
    return [...this.replaysMap];
  }

  public detectPlayerName(baseDir?: string) {
    const detected = detectPlayerName(baseDir);
    if (detected) {
      this.configuredPlayerName = detected;
      console.log(`[LmuParser] Dynamically detected LMU player profile name: "${this.configuredPlayerName}"`);
    }
  }

  public addReplayEntry(entry: ReplayFileEntry) {
    const existingIndex = this.replaysMap.findIndex(r => r.name === entry.name);
    if (existingIndex >= 0) {
      this.replaysMap[existingIndex] = entry;
    } else {
      this.replaysMap.push(entry);
    }
  }

  public addReplayEntries(entries: ReplayFileEntry[]) {
    for (const e of entries) {
      this.addReplayEntry(e);
    }
  }

  public indexReplays(replaysDir: string) {
    try {
      if (!fs.existsSync(replaysDir)) return;
      const files = fs.readdirSync(replaysDir);
      for (const f of files.filter(file => file.toLowerCase().endsWith('.vcr'))) {
        const filePath = path.join(replaysDir, f);
        try {
          const stat = fs.statSync(filePath);
          const match = f.match(/^(.+?)\s+([PQR]\d+)\b/i);
          const trackName = match ? match[1].trim() : f.replace(/\.vcr$/i, '');
          const sessionCode = match ? match[2].toUpperCase() : '';

          this.addReplayEntry({
            name: f,
            path: filePath,
            sizeBytes: stat.size,
            trackName,
            sessionCode,
            mtime: stat.mtime.getTime(),
          });
        } catch { /* Ignore unreadable file. */ }
      }
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
      let sessionDataNode: RawSessionXmlNode | null = null;

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
      const drivers: DriverData[] = driversList.map((d: RawDriverXmlNode) => this.parseDriver(d)).filter(Boolean);

      // Compute Pace Categories for each lap and driver best lap
      drivers.forEach(driver => {
        driver.laps.forEach(lap => {
          if (lap.isValid && lap.lapTime) {
            const paceInfo = calculatePaceCategory(lap.lapTime, trackVenue, trackCourse, driver.carClass, driver.carType, trackLengthMeters);
            if (paceInfo) {
              lap.paceCategory = paceInfo.category;
              lap.pacePercentage = paceInfo.percentage;
              lap.target100Sec = paceInfo.target100Sec;
            }
          }
        });

        if (driver.bestLapTime) {
          const bestPaceInfo = calculatePaceCategory(driver.bestLapTime, trackVenue, trackCourse, driver.carClass, driver.carType, trackLengthMeters);
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

      // Check for explicit weather data in XML (if present)
      const rawWeather = sessionDataNode?.Weather ?? raceResults.Weather;
      const weather = this.parseWeather(timeString, rawWeather ? String(rawWeather) : undefined);

      // Match replay file
      let xmlFileMtime = timestamp;
      if (fs.existsSync(filePath)) {
        try { xmlFileMtime = fs.statSync(filePath).mtime.getTime(); } catch { /* ignore */ }
      }
      const matchingReplay = this.findMatchingReplay(trackVenue, trackCourse, sessionName, timestamp, xmlFileMtime);

      // Parse Session Settings & Server Rules
      const parseNum = (val: unknown): number | undefined => {
        if (val === undefined || val === null || val === '') return undefined;
        const n = typeof val === 'number' ? val : parseFloat(String(val));
        return isNaN(n) ? undefined : n;
      };

      const parseBool = (val: unknown): boolean | undefined => {
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
      const rawFreeSettings = sessionDataNode?.FreeSettings ?? raceResults.FreeSettings;
      const rawUpgrades = sessionDataNode?.FixedUpgrades ?? raceResults.FixedUpgrades;
      const rawParcFerme = sessionDataNode?.ParcFerme ?? raceResults.ParcFerme;
      const rawMechFail = sessionDataNode?.MechFailRate ?? raceResults.MechFailRate;
      const rawDuration = sessionDataNode?.Minutes ?? raceResults.Minutes ?? sessionDataNode?.RaceTime ?? raceResults.RaceTime;
      const rawRaceLaps = sessionDataNode?.RaceLaps ?? raceResults.RaceLaps;
      const rawRaceTime = sessionDataNode?.RaceTime ?? raceResults.RaceTime;
      const rawVehiclesAllowed = sessionDataNode?.VehiclesAllowed ?? raceResults.VehiclesAllowed;

      const parsedFreeSettings = parseNum(rawFreeSettings);
      const isMultiplayer = rawSetting !== undefined && String(rawSetting).trim().toLowerCase() === 'multiplayer';

      // Fixed Setups determination:
      // In rFactor 2 / LMU engine lineage, <FixedSetups> is written as 0 in Results XML even when fixed
      // because setup restrictions are governed by the bitmask <FreeSettings>.
      // FreeSettings = 2147483647 (0x7FFFFFFF, INT_MAX) or -1 indicates completely Open Setup.
      // FreeSettings = 63 (Daily Race Beginner), 0 (Strict fixed), etc. indicates Fixed Setup.
      let isFixedSetups: boolean | undefined = undefined;
      if (rawSetups !== undefined && rawSetups !== null && rawSetups !== '') {
        isFixedSetups = parseBool(rawSetups);
      }
      if (parsedFreeSettings !== undefined) {
        if (parsedFreeSettings === 2147483647 || parsedFreeSettings === -1) {
          isFixedSetups = false;
        } else if (isMultiplayer) {
          isFixedSetups = true;
        } else if (rawSetups !== undefined && rawSetups !== null && rawSetups !== '') {
          isFixedSetups = parseBool(rawSetups);
        }
      }

      // Tire Warmers / Blankets determination:
      // In LMU Results XML, <TireWarmers> defaults to 1 from the player profile even when banned by server rules.
      // 1) Multiplayer Open Setup (Intermediate/Advanced Daily Races & Special Events):
      //    Follows official WEC regulations where tire blankets/warmers are strictly prohibited (cold tires).
      // 2) Multiplayer Fixed Setup (Beginner Daily Races):
      //    Tire blankets are provided so tires start pre-warmed.
      // 3) Single Player / Race Weekend:
      //    Governed by player setting <TireWarmers> (defaults to warm).
      // 4) If <TireWarmers> is explicitly 0 or false, tire warmers are always false.
      let isTireWarmers: boolean | undefined = undefined;
      if (rawWarmers !== undefined && rawWarmers !== null && rawWarmers !== '') {
        isTireWarmers = parseBool(rawWarmers);
      }
      if (isMultiplayer) {
        if (isTireWarmers === false) {
          isTireWarmers = false;
        } else if (isFixedSetups === false) {
          isTireWarmers = false;
        } else if (isFixedSetups === true) {
          isTireWarmers = true;
        }
      }

      const hasAnySetting = [
        rawSetting, rawServerName, rawDamage, rawFuel, rawTire, rawWarmers,
        rawSetups, rawFreeSettings, rawUpgrades, rawParcFerme, rawMechFail, rawDuration, rawRaceLaps, rawRaceTime, rawVehiclesAllowed
      ].some(v => v !== undefined && v !== null && v !== '');

      const settings: SessionSettings | undefined = hasAnySetting ? {
        modeSetting: rawSetting ? String(rawSetting) : undefined,
        serverName: rawServerName ? String(rawServerName) : undefined,
        damageMultiplier: parseNum(rawDamage),
        fuelMultiplier: parseNum(rawFuel),
        tireMultiplier: parseNum(rawTire),
        tireWarmers: isTireWarmers,
        fixedSetups: isFixedSetups,
        freeSettings: parsedFreeSettings,
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
        weatherInfo: weather?.weatherString,
        settings,
        gameVersion: raceResults.GameVersion || '',
        driversCount: drivers.length,
        drivers,
        playerDriver,
        bestSessionLap,
        matchingReplayFile: matchingReplay ? (() => {
          if (!matchingReplay.eventTitle && !matchingReplay.durationSec) {
            try {
              if (fs.existsSync(matchingReplay.path)) {
                const rMeta = parseReplayMetadata(matchingReplay.path);
                if (rMeta?.eventInfo) {
                  matchingReplay.eventTitle = rMeta.eventInfo.eventTitle;
                  matchingReplay.splitNo = rMeta.eventInfo.splitNo;
                  matchingReplay.eventType = rMeta.eventInfo.eventType;
                }
                matchingReplay.durationSec = rMeta.durationSec;
              }
            } catch {
              // ignore
            }
          }
          return {
            name: matchingReplay.name,
            path: matchingReplay.path,
            sizeBytes: matchingReplay.sizeBytes,
            eventTitle: matchingReplay.eventTitle,
            splitNo: matchingReplay.splitNo,
            eventType: matchingReplay.eventType,
            durationSec: matchingReplay.durationSec,
          };
        })() : undefined,
      };
    } catch (err) {
      console.error(`Failed to parse XML file ${filePath}:`, err);
      return null;
    }
  }

  public parseWeather(timeString?: string, rawWeather?: string): SessionWeather | undefined {
    if (!rawWeather) {
      return undefined;
    }

    const condition = String(rawWeather);
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

    const isWet = /wet|rain|inter/i.test(condition);
    const conditionIcon = isWet ? '🌧️' : timeOfDay === 'Night' ? '🌙' : timeOfDay === 'Evening' ? '🌇' : timeOfDay === 'Morning' ? '🌅' : '☀️';
    const weatherString = `${conditionIcon} ${condition} • ${timeOfDay}`;

    return {
      condition,
      timeOfDay,
      weatherString,
    };
  }

  private parseDriver(d: RawDriverXmlNode): DriverData {
    const name = String(d.Name || 'Unknown Driver');
    const carType = String(d.CarType || d.VehName || 'Unknown Car');
    const carClass = String(d.CarClass || 'General');
    const carNumber = String(d.CarNumber || '');
    const teamName = String(d.TeamName || '');
    const isPlayer = String(d.isPlayer) === '1' || d.isPlayer === true;
    const position = parseInt(String(d.Position || ''), 10) || 0;
    const classPosition = parseInt(String(d.ClassPosition || ''), 10) || 0;

    const rawLaps = d.Lap || [];
    const lapsList = Array.isArray(rawLaps) ? rawLaps : [rawLaps];
    const laps: LapData[] = lapsList.map((l: RawLapXmlNode, idx: number) => this.parseLap(l, idx + 1));

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

    // Starting Grid, Finish Position & Position Deltas
    const parsedGrid = parseInt(String(d.GridPos ?? d.GridPosition ?? d.QualPosition ?? d.Grid ?? ''), 10);
    const gridPosition: number | null = !isNaN(parsedGrid) && parsedGrid > 0
      ? parsedGrid
      : (laps.length > 0 && laps[0].position > 0 ? laps[0].position : null);

    const parsedClassGrid = parseInt(String(d.ClassGridPos ?? d.ClassGridPosition ?? d.ClassGrid ?? ''), 10);
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

    const rawPitstops = parseInt(String(d.Pitstops ?? d.PitStops ?? d.NumPitstops ?? ''), 10);
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
      lapsCount: laps.length,
      totalIncidents: 0,
      totalTrackLimits: 0,
      totalPenalties: 0,
      incidents: [],
      trackLimits: [],
      penalties: [],
      laps,
    };
  }

  private parseLap(l: RawLapXmlNode, fallbackNum: number): LapData {
    const lapNum = typeof l['@_num'] === 'number' ? l['@_num'] : parseInt(String(l['@_num'] || ''), 10) || fallbackNum;
    const position = typeof l['@_p'] === 'number' ? l['@_p'] : parseInt(String(l['@_p'] || ''), 10) || 0;

    const bodyVal = typeof l === 'object' && l && '#text' in l && l['#text'] ? String(l['#text']) : (typeof l === 'string' || typeof l === 'number' ? String(l) : '');
    const lapTime = parseTimeStringToSeconds(bodyVal);

    const s1 = l['@_s1'] !== undefined ? parseTimeStringToSeconds(String(l['@_s1'])) : null;
    const s2 = l['@_s2'] !== undefined ? parseTimeStringToSeconds(String(l['@_s2'])) : null;
    const s3 = l['@_s3'] !== undefined ? parseTimeStringToSeconds(String(l['@_s3'])) : null;
    const topSpeed = l['@_topspeed'] !== undefined ? (typeof l['@_topspeed'] === 'number' ? l['@_topspeed'] : parseFloat(String(l['@_topspeed']))) || null : null;
    const fCompound = l['@_fcompound'] ? String(l['@_fcompound']).split(',').pop()?.trim() || String(l['@_fcompound']) : '';
    const rCompound = l['@_rcompound'] ? String(l['@_rcompound']).split(',').pop()?.trim() || String(l['@_rcompound']) : '';
    const isPitStop = (String(l['@_pit']) === '1' || l['@_pit'] === 1 || (String(l['@_et']) === '--.---' && lapNum > 1)) && !(lapNum === 1 && (lapTime === null || lapTime <= 0));

    const rawEt = l['@_et'] !== undefined ? String(l['@_et']) : undefined;
    const elapsedSeconds = rawEt !== undefined && rawEt !== null && rawEt !== '--.---' && rawEt !== '' && !isNaN(parseFloat(rawEt))
      ? parseFloat(parseFloat(rawEt).toFixed(3))
      : null;
    const elapsedTimeString = elapsedSeconds !== null && elapsedSeconds >= 0
      ? formatElapsedSeconds(elapsedSeconds)
      : undefined;

    const cleanCompound = (val?: unknown): string | undefined => {
      if (!val) return undefined;
      const str = String(val).split(',').pop()?.trim();
      return str || undefined;
    };

    const flCompound = cleanCompound(l['@_FL'] || l['@_fl']);
    const frCompound = cleanCompound(l['@_FR'] || l['@_fr']);
    const rlCompound = cleanCompound(l['@_RL'] || l['@_rl']);
    const rrCompound = cleanCompound(l['@_RR'] || l['@_rr']);

    const parsePercentVal = (val: unknown): number | null => {
      if (val === undefined || val === null || val === '') return null;
      const parsed = typeof val === 'number' ? val : parseFloat(String(val));
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
    const rawFuelUsedVal = l['@_fuelUsed'] !== undefined ? l['@_fuelUsed'] : l['@_fuelused'];
    const rawFuelUsed = rawFuelUsedVal !== undefined ? parseFloat(String(rawFuelUsedVal)) : null;
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

  public findMatchingReplay(
    trackVenue: string,
    trackCourse: string,
    sessionCode: string,
    sessionTimestampMs: number,
    xmlFileMtimeMs: number
  ): ReplayFileEntry | undefined {
    if (this.replaysMap.length === 0) return undefined;

    const normSession = (sessionCode || '').toLowerCase();

    const matchesSessionCode = (vCodeRaw: string, sCodeRaw: string): boolean => {
      const vCode = vCodeRaw.toLowerCase();
      const sCode = sCodeRaw.toLowerCase();
      if (vCode === sCode) return true;
      if ((sCode === 'practice' || sCode.startsWith('p')) && vCode.startsWith('p')) return true;
      if ((sCode === 'qualifying' || sCode.startsWith('q')) && vCode.startsWith('q')) return true;
      if ((sCode === 'race' || sCode.startsWith('r')) && vCode.startsWith('r')) return true;
      return false;
    };

    const getMinDiff = (v: ReplayFileEntry) => {
      const replayStart = v.durationSec ? v.mtime - Math.round(v.durationSec * 1000) : v.mtime;
      const diffStart = Math.abs(replayStart - sessionTimestampMs);
      const diffEnd = Math.abs(v.mtime - xmlFileMtimeMs);
      const diffDirect = Math.abs(v.mtime - sessionTimestampMs);
      return Math.min(diffStart, diffEnd, diffDirect);
    };

    const sessionScoped = this.replaysMap.filter(v => matchesSessionCode(v.sessionCode, normSession) && getMinDiff(v) <= 600000);

    // 1. Exact track/layout match takes priority whenever one exists.
    const exactCandidates = sessionScoped.filter(v => matchesTrack(v.trackName, trackVenue, trackCourse));
    if (exactCandidates.length > 0) {
      exactCandidates.sort((a, b) => {
        const aExactCode = a.sessionCode.toLowerCase() === normSession ? 0 : 1;
        const bExactCode = b.sessionCode.toLowerCase() === normSession ? 0 : 1;
        if (aExactCode !== bExactCode) return aExactCode - bExactCode;
        return getMinDiff(a) - getMinDiff(b);
      });
      return exactCandidates[0];
    }

    // 2. Fall back to generic-vs-specific same-circuit matches only when no exact-layout
    // replay is available
    const fallbackCandidates = sessionScoped.filter(v => {
      const qSpec = getCircuitSpecification(v.trackName);
      const sSpec = getCircuitSpecification(trackVenue, trackCourse);

      if (qSpec.layoutKey !== 'unknown' && sSpec.layoutKey !== 'unknown') {
        if (qSpec.circuitId !== sSpec.circuitId) return false;
        return Boolean(qSpec.isDefaultLayout || sSpec.isDefaultLayout);
      }

      if (qSpec.layoutKey === 'unknown' && sSpec.layoutKey === 'unknown') {
        const normVcrTrack = v.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normXmlCourse = (trackCourse || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normXmlVenue = trackVenue.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (
          (normXmlCourse && (normXmlCourse.includes(normVcrTrack) || normVcrTrack.includes(normXmlCourse))) ||
          (!trackCourse && (normXmlVenue.includes(normVcrTrack) || normVcrTrack.includes(normXmlVenue)))
        );
      }

      return false;
    });

    if (fallbackCandidates.length === 0) return undefined;

    fallbackCandidates.sort((a, b) => getMinDiff(a) - getMinDiff(b));
    return fallbackCandidates[0];
  }

  private parseStreamEvents(streamNode: RawStreamXmlNode, drivers: DriverData[]) {
    parseStreamEvents(streamNode, drivers);
  }
}
