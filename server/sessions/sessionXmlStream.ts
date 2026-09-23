import {
  DriverData,
  LapData,
  LapIncident,
  LapPenalty,
  LapTrackLimit,
} from '../core/types.js';
import {
  RawStreamIncidentNode,
  RawStreamPenaltyNode,
  RawStreamSectorNode,
  RawStreamTrackLimitNode,
  RawStreamXmlNode,
} from './sessionXmlTypes.js';

export function parseStreamEvents(streamNode: RawStreamXmlNode, drivers: DriverData[]): void {
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
  rawIncidents.forEach((inc: RawStreamIncidentNode) => {
    const et = inc['@_et'] !== undefined ? parseFloat(String(inc['@_et'])) : undefined;
    const text = typeof inc === 'object' && inc['#text'] ? String(inc['#text']) : (typeof inc === 'string' ? inc : '');
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
  rawSectors.forEach((sec: RawStreamSectorNode) => {
    const et = sec['@_et'] !== undefined ? parseFloat(String(sec['@_et'])) : undefined;
    const text = typeof sec === 'object' && sec['#text'] ? String(sec['#text']) : (typeof sec === 'string' ? sec : '');
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
  rawTrackLimits.forEach((tl: RawStreamTrackLimitNode) => {
    const rawDriver = tl['@_Driver'] || tl['@_driver'];
    const driver = matchDriver(rawDriver);
    if (!driver) return;

    const et = tl['@_et'] !== undefined ? parseFloat(String(tl['@_et'])) : undefined;
    const lapAttr = tl['@_Lap'] !== undefined ? parseInt(String(tl['@_Lap']), 10) : undefined;
    const explicitLapNum = lapAttr !== undefined && !isNaN(lapAttr) ? lapAttr + 1 : undefined;

    const warnPts = parseFloat(String(tl['@_WarningPoints'] ?? tl['@_warningpoints'] ?? 0));
    const curPts = parseFloat(String(tl['@_CurrentPoints'] ?? tl['@_currentpoints'] ?? 0));
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
  rawPenalties.forEach((p: RawStreamPenaltyNode) => {
    const rawDriver = p['@_Driver'] || p['@_driver'];
    const driver = matchDriver(rawDriver);
    if (!driver) return;

    const et = p['@_et'] !== undefined ? parseFloat(String(p['@_et'])) : undefined;
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
