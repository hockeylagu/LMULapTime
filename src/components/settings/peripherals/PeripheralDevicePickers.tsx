import type { PeripheralDevice, PeripheralSettings } from '../../../../shared/types/peripherals/peripherals.js';
import { Select } from '../../common/dropdown/Select.js';

interface Props { settings: PeripheralSettings; devices: PeripheralDevice[]; busy: boolean; onSave: (settings: PeripheralSettings) => void }
export function PeripheralDevicePickers({ settings, devices, busy, onSave }: Props) {
  const wheels = devices.filter(device => device.role === 'wheel');
  const choose = (value: string) => {
    const device = wheels.find(item => `${item.productUuid}:${item.deviceUuid}` === value);
    onSave({ ...settings, wheel: device ? { productUuid: device.productUuid, deviceUuid: device.deviceUuid, name: device.name } : null });
  };
  const selected = settings.wheel;
  const value = selected ? `${selected.productUuid}:${selected.deviceUuid}` : '';
  const options = wheels.map(device => ({ value: `${device.productUuid}:${device.deviceUuid}`, label: device.name }));
  if (selected && !options.some(option => option.value === value)) options.push({ value, label: `${selected.name} (disconnected)` });
  return <div className="min-w-0 flex-1 space-y-2">
    <label htmlFor="peripheral-wheel" className="block text-sm font-medium text-lmu-text">Steering wheel</label>
    <Select id="peripheral-wheel" value={value} options={[{ value: '', label: 'None' }, ...options]} disabled={busy} onChange={choose} className="w-full" />
  </div>;
}
