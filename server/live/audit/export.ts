import type { LiveAuditRecord } from '../../../shared/types/liveAudit.js';

const HEADERS = ['run_id', 'sequence', 'recorded_at', 'model_version', 'reason', 'layout_key', 'track', 'car', 'class', 'session',
  'elapsed_s', 'completed_laps', 'rain', 'wetness', 'track_temp_c', 'compound', 'resource', 'estimate_source', 'estimated_use_per_lap',
  'reserve_laps', 'garage_recommended_load', 'garage_selected_load', 'pit_recommended_load_now', 'pit_selected_load',
  'saving_target_per_lap', 'recommended_ratio', 'garage_selected_ratio', 'next_stop_selected_ratio',
  'tread_now', 'predicted_tread', 'tread_target', 'selected_tyres', 'selected_repairs', 'estimated_service_s',
  'resource_remaining', 'finish_resource_remaining', 'finish_tread', 'observed_lap', 'observed_fuel_l', 'observed_ve_pct',
  'forecast_at_s', 'forecast_use_per_lap', 'actual_use_per_lap', 'actual_minus_forecast', 'error_pct',
  'forecast_ratio', 'actual_fuel_ve_ratio', 'actual_minus_forecast_ratio', 'forecast_garage_ratio', 'forecast_next_stop_ratio',
  'fuel_now_l', 've_now_pct', 'garage_load_minus_recommended', 'pit_load_minus_recommended_now',
  'garage_ratio_minus_recommended', 'next_stop_ratio_minus_recommended'];

const delta = (selected: number | null | undefined, recommended: number | null | undefined): number | null =>
  selected != null && recommended != null ? selected - recommended : null;

/** Quote every cell and neutralise spreadsheet formulas in untrusted car/track/menu strings. */
function cell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function* exportLiveAudit(records: Iterable<LiveAuditRecord>): Generator<string> {
  yield `${HEADERS.map(cell).join(',')}\r\n`;
  for (const record of records) {
    const { snapshot: s, comparison: c, observation: o } = record;
    const strategy = s.strategy;
    const r = strategy?.resource;
    const g = strategy?.garage;
    const t = strategy?.tyres;
    const ratio = strategy?.fuelRatio;
    const coverage = g?.tyreCoverage ?? t?.coverage;
    const values = [record.runId, record.sequence, new Date(record.recordedAt).toISOString(), record.modelVersion, record.reason,
      s.identity?.layoutKey, s.session?.trackName, s.session?.vehicleName, s.session?.vehicleClass, s.session?.kind,
      s.session?.elapsedSeconds, s.session?.playerLapsCompleted, s.weather?.raining, s.weather?.avgPathWetness, s.weather?.trackTempC,
      t?.compound ?? g?.tyres?.compound, r?.kind ?? g?.kind, r?.perLapSource ?? g?.perLapSource, r?.perLap ?? g?.perLap,
      r?.reserveLaps ?? g?.reserveLaps, g?.needed, g?.setInGarage, r?.race?.neededStopNow, strategy?.pit?.mfd?.resourceValue,
      r?.saving?.targetPerLap, ratio?.recommended, ratio?.garageSetting, ratio?.mfdSetting,
      t?.worst ?? g?.tyres?.wear, coverage?.projectedTread, coverage?.target, strategy?.pit?.mfd?.tyres, strategy?.pit?.mfd?.repair,
      strategy?.pit?.serviceSeconds, r?.amount, s.result?.resourceRemaining, s.result?.tyreTread,
      c?.lap ?? o.ve?.lap ?? o.fuel?.lap, o.fuel?.amount, o.ve?.amount, c?.forecastAtSeconds,
      c?.predictedPerLap, c?.actualPerLap, c?.errorPerLap, c?.errorPercent,
      c?.recommendedRatio, c?.actualRatio, c?.ratioError, c?.garageRatio, c?.nextStopRatio,
      o.fuelNowLitres, o.veNowPercent, delta(g?.setInGarage, g?.needed), delta(strategy?.pit?.mfd?.resourceValue, r?.race?.neededStopNow),
      delta(ratio?.garageSetting, ratio?.recommended), delta(ratio?.mfdSetting, ratio?.recommended)];
    yield `${values.map(cell).join(',')}\r\n`;
  }
}
