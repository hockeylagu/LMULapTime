import type { PeripheralStatus } from '../../types/peripherals/peripherals.js';

/** Vendor-independent UI contract: the host supplies health; every surface uses the same message. */
export function peripheralStatusMessage(status: PeripheralStatus): { message: string; warning: boolean } {
  if (status.install !== 'ready') return { message: status.install === 'not-installed' ? 'Simagic plugin is not installed' : status.error ?? 'Simagic plugin unavailable', warning: true };
  if (!status.health) return { message: 'Checking SimPro…', warning: false };
  if (status.health.api !== 'responsive') return { message: status.health.process === 'absent' ? 'SimPro is not running'
    : status.health.process === 'present' ? 'SimPro running, API unavailable' : 'Cannot connect to SimPro', warning: true };
  const wheel = status.settings.wheel;
  const disconnected = wheel && !status.devices.some(item => item.role === 'wheel' && item.productUuid === wheel.productUuid && item.deviceUuid === wheel.deviceUuid);
  return disconnected ? { message: 'SimPro running · wheel disconnected', warning: true }
    : { message: 'SimPro running', warning: false };
}
