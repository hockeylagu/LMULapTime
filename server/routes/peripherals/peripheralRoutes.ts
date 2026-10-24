import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { PeripheralError } from '../../peripherals/peripheralHost.js';
import type { PeripheralHost } from '../../peripherals/peripheralHost.js';
import { isPeripheralSettings, isRecord, isUuid } from '../../peripherals/peripheralSettings.js';
import { MAPPING_CARS, suggestMappings } from '../../../shared/domain/peripherals/suggestMappings.js';
import { VEHICLE_CLASS_OPTIONS } from '../../../shared/domain/vehicleMapping.js';
import type { MappingChange, PresetMapping } from '../../../shared/types/peripherals/peripherals.js';

function parseChanges(value: unknown): MappingChange[] {
  if (!Array.isArray(value) || value.length > 200) throw new PeripheralError('Expected up to 200 mapping changes.', 400);
  return value.map((row: unknown) => {
    if (!isRecord(row) || (row.scopeKind !== 'model' && row.scopeKind !== 'class')
      || typeof row.scopeKey !== 'string' || (row.presetUuid !== null && !isUuid(row.presetUuid))) throw new PeripheralError('Invalid preset mapping.', 400);
    const known = row.scopeKind === 'model' ? MAPPING_CARS.some(car => car.model === row.scopeKey)
      : VEHICLE_CLASS_OPTIONS.some(carClass => carClass.id !== 'All' && carClass.id === row.scopeKey);
    if (!known) throw new PeripheralError('Unknown car or class.', 400);
    return { scopeKind: row.scopeKind, scopeKey: row.scopeKey, presetUuid: row.presetUuid };
  });
}

export function createPeripheralRouter(host: PeripheralHost): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', (_req, res) => { res.json([host.status()]); });
  router.use('/:id', (req, res, next) => {
    if (req.params.id !== 'simagic') return res.status(404).json({ error: 'Unknown peripheral plugin.' });
    next();
  });
  router.put('/:id/settings', async (req, res) => {
    const value: unknown = req.body;
    if (!isPeripheralSettings(value)) throw new PeripheralError('Invalid peripheral settings.', 400);
    await host.configure(value);
    res.json(host.status());
  });
  router.use('/:id', (_req, _res, next) => { host.requirePlugin(); next(); });
  router.post('/:id/health/refresh', async (_req, res) => { res.json(await host.refreshHealth()); });
  router.get('/:id/devices', async (_req, res) => { res.json(await host.listDevices()); });
  router.get('/:id/loaded-presets', async (_req, res) => { res.json(await host.loadedPresets()); });
  router.get('/:id/presets', (_req, res) => { res.json(host.catalog()); });
  router.post('/:id/presets/refresh', async (_req, res) => { res.json(await host.refreshCatalog()); });
  router.get('/:id/mappings', (_req, res) => { res.json(host.mappings()); });
  router.put('/:id/mappings', (req, res) => {
    const changes = parseChanges(req.body);
    const wheel = host.status().settings.wheel;
    const rows: PresetMapping[] = [];
    for (const change of changes) {
      if (change.presetUuid === null) continue;
      if (!wheel) throw new PeripheralError('Select a wheel before assigning presets.', 400);
      rows.push({ scopeKind: change.scopeKind, scopeKey: change.scopeKey, productUuid: wheel.productUuid, deviceUuid: wheel.deviceUuid, presetUuid: change.presetUuid });
    }
    host.store.saveMappings(rows, changes.filter(row => row.presetUuid === null), Date.now());
    res.json(host.mappings());
  });
  router.post('/:id/mappings/suggest', (req, res) => {
    const body: unknown = req.body;
    if (!isRecord(body) || typeof body.overwrite !== 'boolean') throw new PeripheralError('Expected an overwrite option.', 400);
    const overwrite = body.overwrite;
    const catalog = host.catalog();
    res.json(catalog ? suggestMappings(catalog.presets.filter(preset => preset.available), host.store.listMappings(), overwrite) : []);
  });
  router.post('/:id/apply', async (req, res) => {
    const body: unknown = req.body;
    if (!isRecord(body) || (body.model !== undefined && typeof body.model !== 'string') || (body.carClass !== undefined && typeof body.carClass !== 'string')) throw new PeripheralError('Invalid car selection.', 400);
    const car = MAPPING_CARS.find(item => item.model === body.model && (body.carClass === undefined || item.carClass === body.carClass));
    if (body.model !== undefined && !car) throw new PeripheralError('Unknown car or car/class combination.', 400);
    if (!car && !VEHICLE_CLASS_OPTIONS.some(item => item.id !== 'All' && item.id === body.carClass)) throw new PeripheralError('Unknown car or class.', 400);
    res.json(await host.execute(car ?? { model: null, carClass: typeof body.carClass === 'string' ? body.carClass : null }));
  });
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error instanceof PeripheralError ? error.status : 500).json({ error: error instanceof Error ? error.message : 'Peripheral request failed.' });
  });
  return router;
}
