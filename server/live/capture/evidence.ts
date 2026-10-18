type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function copyNumbers(source: JsonRecord, names: readonly string[]): JsonRecord {
  const result: JsonRecord = {};
  for (const name of names) if (finiteNumber(source[name])) result[name] = source[name];
  return result;
}

function nonempty(value: JsonRecord): boolean {
  return Object.keys(value).length > 0;
}

function standings(body: unknown): JsonRecord | null {
  if (!Array.isArray(body)) return null;
  const player = body.map(record).find(row => row?.player === true);
  if (!player) return null;
  const data = copyNumbers(player, ['veFraction', 'fuelFraction', 'penalties']);
  if (typeof player.pitState === 'string') data.pitState = player.pitState;
  return nonempty(data) ? data : null;
}

function estimate(body: unknown): JsonRecord | null {
  const source = record(body);
  if (!source) return null;
  const data = copyNumbers(source, ['fuel', 've', 'tires', 'damage', 'brakes', 'brakeDucts', 'driverSwap', 'penalties', 'total']);
  return nonempty(data) ? data : null;
}

function condition(body: unknown): JsonRecord | null {
  const source = record(body);
  if (!source) return null;
  const data = copyNumbers(source, ['vehicleDamage']);
  if (Array.isArray(source.suspensionDamage) && source.suspensionDamage.length === 4
    && source.suspensionDamage.every(finiteNumber)) data.suspensionDamage = source.suspensionDamage;
  return nonempty(data) ? data : null;
}

function pitMenu(body: unknown): JsonRecord[] | null {
  if (!Array.isArray(body)) return null;
  const rows: JsonRecord[] = [];
  for (const value of body) {
    const source = record(value);
    if (typeof source?.name !== 'string' || !finiteNumber(source.currentSetting) || !Number.isInteger(source.currentSetting)) continue;
    const row: JsonRecord = { name: source.name, currentSetting: source.currentSetting };
    const settings = Array.isArray(source.settings) ? source.settings : [];
    const selected = record(settings[source.currentSetting]);
    if (typeof selected?.text === 'string') row.selectedText = selected.text;
    if (source.name.trim().toUpperCase() === 'FUEL RATIO:') {
      row.options = settings.map(record).map(setting => setting?.text).filter((text): text is string => typeof text === 'string');
    }
    rows.push(row);
  }
  return rows.length > 0 ? rows : null;
}

function garage(body: unknown): JsonRecord | null {
  const source = record(body);
  if (!source) return null;
  const data: JsonRecord = {};
  for (const key of ['VM_VIRTUAL_ENERGY', 'VM_FUEL_LEVEL']) {
    const selection = record(source[key]);
    if (!selection) continue;
    const selected: JsonRecord = {};
    if (typeof selection.available === 'boolean') selected.available = selection.available;
    if (typeof selection.stringValue === 'string') selected.stringValue = selection.stringValue;
    if (finiteNumber(selection.value)) selected.value = selection.value;
    if (nonempty(selected)) data[key] = selected;
  }
  return nonempty(data) ? data : null;
}

function numericArray(value: unknown, exactLength?: number): number[] | null {
  if (!Array.isArray(value) || (exactLength !== undefined && value.length !== exactLength) || !value.every(finiteNumber)) return null;
  return value;
}

function nestedNumericArrays(value: unknown, innerLength: number): number[][] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.map(row => numericArray(row, innerLength));
  return rows.length > 0 && rows.every((row): row is number[] => row !== null) ? rows : null;
}

function tireManagement(body: unknown): JsonRecord | null {
  const source = record(body);
  if (!source) return null;
  const data: JsonRecord = {};

  const usage = record(source.expectedUsage);
  if (usage) {
    const selected = copyNumbers(usage, ['fuelConsumption', 'fuelFractionPerLap', 'virtualEnergyConsumption', 'virtualEnergyFractionPerLap']);
    if (Array.isArray(usage.compoundsWearPerLap)) {
      const wear = usage.compoundsWearPerLap.flatMap(value => {
        const item = record(value);
        return typeof item?.type === 'string' && finiteNumber(item.wearPerLap)
          ? [{ type: item.type, wearPerLap: item.wearPerLap }] : [];
      });
      if (wear.length > 0) selected.compoundsWearPerLap = wear;
    }
    if (nonempty(selected)) data.expectedUsage = selected;
  }

  const conditions = record(source.optimalCompoundConditions);
  if (Array.isArray(conditions?.compounds)) {
    const compounds = conditions.compounds.flatMap(value => {
      const item = record(value);
      return typeof item?.type === 'string' && finiteNumber(item.optimalTemperature)
        ? [{ type: item.type, optimalTemperature: item.optimalTemperature }] : [];
    });
    if (compounds.length > 0) data.optimalCompoundConditions = { compounds };
  }

  const inventory = record(source.tireInventory);
  if (inventory) {
    const selected = copyNumbers(inventory, ['maxAvailableTires', 'newTires']);
    const bestConditionsUsed = nestedNumericArrays(inventory.bestConditionsUsed, 4);
    if (bestConditionsUsed) selected.bestConditionsUsed = bestConditionsUsed;
    if (nonempty(selected)) data.tireInventory = selected;
  }

  const options = record(source.tireInvGarageOptions);
  if (Array.isArray(options?.selectedTires)) {
    const selectedTires = options.selectedTires.flatMap(value => {
      const item = record(value);
      if (!item) return [];
      const wheel: JsonRecord = {};
      for (const key of ['compoundIndex', 'index', 'type', 'wearValue']) if (finiteNumber(item[key])) wheel[key] = item[key];
      if (typeof item.isUsed === 'boolean') wheel.isUsed = item.isUsed;
      return nonempty(wheel) ? [wheel] : [];
    });
    if (selectedTires.length > 0) data.tireInvGarageOptions = { selectedTires };
  }

  return nonempty(data) ? data : null;
}

function serviceRules(body: unknown): JsonRecord | null {
  const source = record(body);
  if (!source) return null;
  const data: JsonRecord = {};
  const times = record(record(source.pitStopTimes)?.times);
  if (times) {
    const selected: JsonRecord = {};
    for (const [name, value] of Object.entries(times)) {
      if (finiteNumber(value) || typeof value === 'boolean') selected[name] = value;
    }
    if (nonempty(selected)) data.pitStopTimes = { times: selected };
  }
  const fuelInfo = record(source.fuelInfo);
  if (fuelInfo) {
    const capacities = copyNumbers(fuelInfo, ['maxFuel', 'maxVirtualEnergy', 'maxBattery']);
    if (nonempty(capacities)) data.fuelInfo = capacities;
  }
  return nonempty(data) ? data : null;
}

const WEATHER_NODES = new Set(['START', 'NODE_25', 'NODE_50', 'NODE_75', 'FINISH']);
const WEATHER_FIELDS = ['WNV_RAIN_CHANCE', 'WNV_SKY', 'WNV_TEMPERATURE', 'WNV_HUMIDITY', 'WNV_WINDSPEED', 'WNV_WINDDIRECTION'] as const;

function forecast(body: unknown): JsonRecord | null {
  const source = record(body);
  if (!source) return null;
  const sessions: JsonRecord = {};
  for (const [sessionName, value] of Object.entries(source)) {
    const session = record(value);
    if (!session) continue;
    const nodes: JsonRecord = {};
    for (const [nodeName, nodeValue] of Object.entries(session)) {
      if (!WEATHER_NODES.has(nodeName)) continue;
      const node = record(nodeValue);
      if (!node) continue;
      const fields: JsonRecord = {};
      for (const fieldName of WEATHER_FIELDS) {
        const field = record(node[fieldName]);
        if (!field) continue;
        const selected: JsonRecord = {};
        if (finiteNumber(field.currentValue)) selected.currentValue = field.currentValue;
        if (typeof field.stringValue === 'string') selected.stringValue = field.stringValue;
        if (nonempty(selected)) fields[fieldName] = selected;
      }
      if (nonempty(fields)) nodes[nodeName] = fields;
    }
    if (nonempty(nodes)) sessions[sessionName] = nodes;
  }
  return nonempty(sessions) ? sessions : null;
}

function schedule(body: unknown): JsonRecord | null {
  const sessions = record(body)?.scheduledSessions;
  if (!Array.isArray(sessions)) return null;
  const selected = sessions.flatMap(value => {
    const session = record(value);
    if (typeof session?.name !== 'string' || !finiteNumber(session.lengthTime)) return [];
    return [{ name: session.name, lengthTime: session.lengthTime }];
  });
  return selected.length > 0 ? { scheduledSessions: selected } : null;
}

/** Select compact, typed evidence from a known LMU REST response without retaining whole snapshots. */
export function captureRestEvidence(path: string, body: unknown): { kind: string; data: unknown } | null {
  let kind: string;
  let data: unknown;
  switch (path) {
    case '/rest/watch/standings': kind = 'standings'; data = standings(body); break;
    case '/rest/strategy/pitstop-estimate': kind = 'pit-estimate'; data = estimate(body); break;
    case '/rest/garage/getVehicleCondition': kind = 'condition'; data = condition(body); break;
    case '/rest/garage/PitMenu/receivePitMenu': kind = 'pit-menu'; data = pitMenu(body); break;
    case '/rest/garage/getPlayerGarageData': kind = 'garage'; data = garage(body); break;
    case '/rest/garage/UIScreen/TireManagement': kind = 'tyre-management'; data = tireManagement(body); break;
    case '/rest/garage/UIScreen/RepairAndRefuel': kind = 'service-rules'; data = serviceRules(body); break;
    case '/rest/sessions/weather': kind = 'forecast'; data = forecast(body); break;
    case '/rest/sessions/GetSessionsInfoForEvent': kind = 'schedule'; data = schedule(body); break;
    default: return null;
  }
  return data === null ? null : { kind, data };
}
