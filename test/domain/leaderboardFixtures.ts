import type { DetailedSession, DriverData, LapData } from '../../shared/types/index.js';

export const MONZA_VENUE = 'Autodromo Nazionale Monza';
export const MONZA_GP = 'Autodromo Nazionale Monza';
export const MONZA_CURVA_GRANDE = 'Monza Curva Grande Circuit';

/** A flying lap; sectors split the time 30/40/30 unless given. */
export function lap(lapNum: number, lapTime: number, extra: Partial<LapData> = {}): LapData {
  return {
    lapNum,
    position: 1,
    lapTime,
    lapTimeString: '',
    s1: Number((lapTime * 0.3).toFixed(3)),
    s2: Number((lapTime * 0.4).toFixed(3)),
    s3: Number((lapTime * 0.3).toFixed(3)),
    topSpeed: 280,
    fCompound: '0,Medium',
    rCompound: '0,Medium',
    isValid: true,
    isPitStop: false,
    ...extra,
  } as LapData;
}

/** A driver whose lap 1 is a slow start lap (never counted), followed by the given laps. */
export function driver(name: string, laps: LapData[], extra: Partial<DriverData> = {}): DriverData {
  return {
    name,
    carType: 'Ferrari 296 LMGT3',
    carClass: 'LMGT3',
    carNumber: '1',
    teamName: '',
    isPlayer: false,
    position: 1,
    classPosition: 1,
    bestLapTime: null,
    bestLapTimeString: '',
    bestS1: null,
    bestS2: null,
    bestS3: null,
    theoreticalBest: null,
    theoreticalBestString: '',
    laps: [lap(1, 200), ...laps],
    ...extra,
  } as DriverData;
}

export function session(
  id: string,
  drivers: DriverData[],
  extra: Partial<DetailedSession> & { online?: boolean } = {}
): DetailedSession {
  const { online = true, ...rest } = extra;
  const player = drivers.find((d) => d.isPlayer);
  return {
    id,
    filename: `${id}.xml`,
    filePath: `/results/${id}.xml`,
    trackVenue: MONZA_VENUE,
    trackCourse: MONZA_GP,
    trackEvent: '',
    trackLengthMeters: null,
    timeString: '',
    timestamp: 1000,
    sessionType: 'Race',
    sessionName: 'R1',
    driversCount: drivers.length,
    settings: { modeSetting: online ? 'Multiplayer' : 'Race Weekend' },
    playerDriver: player,
    drivers,
    ...rest,
  } as DetailedSession;
}
