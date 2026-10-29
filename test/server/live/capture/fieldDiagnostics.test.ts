import { describe, expect, it } from 'vitest';
import { FIELD_BURST_SECONDS, FIELD_COLUMNS, FieldDiagnosticsLog, fieldEntriesRecord, fieldRecord, flagsRecord } from '../../../../server/live/capture/fieldDiagnostics.js';
import type { DiagnosticEvent } from '../../../../server/live/capture/diagnostics.js';
import type { LiveFieldCar, LiveScoringReading } from '../../../../shared/domain/live/liveLifecycle.js';

const car: LiveFieldCar = {
  id: 3, driverName: 'A Driver', vehicleName: 'Porsche Penske Motorsport 2025 #6', vehicleFile: 'PORSCHE_963_6.veh', vehicleClass: 'Hyper', place: 2, totalLaps: 5,
  lapDist: 1234.567, x: 10.04, z: -20.06, speed: 61.234, pathLateral: -2.345, trackEdge: 6.78, timeBehindNext: 0.8765,
  lapsBehindNext: 0, inPits: false, pitState: 0, control: 2, finishStatus: 0,
};
const reading = (field: LiveFieldCar[] | undefined): LiveScoringReading => ({
  trackName: 'Spa', sessionCode: 10, currentEt: 321.456, endEt: 3600, numVehicles: field?.length ?? 0, inRealtime: true,
  gamePhase: 5, trackLength: 7004, trackTempC: 30, raining: 0, avgPathWetness: 0, yellowFlagState: 1, sectorFlags: [0, 1, 0],
  field, player: null, leader: null,
});

describe('field diagnostics', () => {
  it('writes every car as a rounded positional row with the player gaps', () => {
    const record = fieldRecord(reading([car]), { timeGaps: { carAhead: 1.234, carBehind: Number.NaN, placeAhead: 2, placeBehind: 3 } } as never);
    expect(record).toEqual({
      elapsedSeconds: 321.46, burst: false, columns: FIELD_COLUMNS,
      cars: [[3, 2, 5, 1234.6, 10, -20.1, 61.2, -2.3, 6.8, 0.88, 0, 0, 0, 2, 0]],
      playerGaps: { carAhead: 1.23, carBehind: null, placeAhead: 2, placeBehind: 3 },
    });
    expect((record as { cars: unknown[][] }).cars[0]).toHaveLength(FIELD_COLUMNS.length);
  });

  it('names each id and keeps the flags without a clock, so unchanged lines are deduplicated', () => {
    expect(fieldEntriesRecord(reading([car]))).toEqual({ cars: [[3, 'A Driver', 'Porsche Penske Motorsport 2025 #6', 'PORSCHE_963_6.veh', 'Hyper']] });
    expect(flagsRecord(reading([car]))).toEqual({ gamePhase: 5, yellowFlagState: 1, sectorFlags: [0, 1, 0] });
    expect(fieldRecord(reading(undefined), null)).toBeNull();
    expect(fieldEntriesRecord(reading([]))).toBeNull();
  });

  it('writes every scoring update around an incident, once a second otherwise, and each update once', () => {
    const log = new FieldDiagnosticsLog();
    const events: DiagnosticEvent[] = [];
    const fields = () => events.filter(event => event.kind === 'field').map(event => (event.data as { burst: boolean }).burst);
    const at = (et: number, cars: LiveFieldCar[], flags = [0, 0, 0]) => ({ ...reading(cars), currentEt: et, sectorFlags: flags });
    log.update(at(1, [car]), null, 0, event => events.push(event));
    log.update(at(1.2, [car]), null, 200, event => events.push(event));
    log.update(at(1.2, [car]), null, 300, event => events.push(event));
    expect(fields()).toEqual([false]);
    // A sector flag change starts a burst: every update is written.
    log.update(at(1.4, [car], [0, 1, 0]), null, 400, event => events.push(event));
    log.update(at(1.6, [car], [0, 1, 0]), null, 600, event => events.push(event));
    log.update(at(1.6, [car], [0, 1, 0]), null, 650, event => events.push(event));
    expect(fields()).toEqual([false, true, true]);
    // So does a car stopped on track, once the profile knows the speed at that spot; the burst ends
    // FIELD_BURST_SECONDS after the last cause.
    for (let i = 0; i < 10; i++) log.update(at(2 + i, [car]), null, 1000 * (2 + i), event => events.push(event));
    const before = fields().length;
    const stopped = { ...car, id: 4, speed: 2 };
    log.update(at(30, [car, stopped], [0, 1, 0]), null, 30_000, event => events.push(event));
    log.update(at(30.2, [car], [0, 1, 0]), null, 30_000 + FIELD_BURST_SECONDS * 1000 - 100, event => events.push(event));
    log.update(at(30.4, [car], [0, 1, 0]), null, 30_000 + FIELD_BURST_SECONDS * 1000 + 1000, event => events.push(event));
    expect(fields().slice(before)).toEqual([true, true, false]);
  });

  it('calls a car slow against the field at that spot, and off track only well beyond the edge', () => {
    const bursts = (setup: LiveFieldCar[], probe: LiveFieldCar) => {
      const log = new FieldDiagnosticsLog();
      const events: DiagnosticEvent[] = [];
      for (let i = 0; i < 10; i++) log.update({ ...reading(setup), currentEt: i, sectorFlags: [11, 11, 11] }, null, i * 1000, event => events.push(event));
      log.update({ ...reading([probe]), currentEt: 10, sectorFlags: [11, 11, 11] }, null, 10_000, event => events.push(event));
      return (events.findLast(event => event.kind === 'field')!.data as { burst: boolean }).burst;
    };
    const hairpin = { ...car, speed: 18 };
    expect(bursts([hairpin], { ...hairpin, speed: 12 })).toBe(false);
    expect(bursts([hairpin], { ...hairpin, speed: 8 })).toBe(true);
    // Kerbs read past the edge; a car in the run-off reads well beyond it.
    expect(bursts([car], { ...car, pathLateral: 8.5, trackEdge: 6.78 })).toBe(false);
    expect(bursts([car], { ...car, pathLateral: 12, trackEdge: 6.78 })).toBe(true);
    // Nothing is judged before the spot has enough samples.
    expect(bursts([], { ...car, speed: 0 })).toBe(false);
  });
});
