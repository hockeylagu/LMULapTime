import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchPeripherals } from '../../api/peripheralsApi.js';
import type { PeripheralStatus } from '../../../shared/types/peripherals/peripherals.js';
import { peripheralStatusMessage } from '../../../shared/domain/peripherals/peripheralStatus.js';

export const PERIPHERAL_POLL_INTERVAL_MS = 30_000;
export const PERIPHERAL_ERROR_POLL_INTERVAL_MS = 5_000;

/** Passive status only: no launch, apply or settings actions on the driving display. */
export function PeripheralStatusChip() {
  const [statuses, setStatuses] = useState<PeripheralStatus[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = (delayMs: number) => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, delayMs);
    };

    const refresh = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      let hasWarning = false;
      try {
        const next = await fetchPeripherals(controller.signal);
        if (!controller.signal.aborted && Array.isArray(next)) {
          setStatuses(next);
          hasWarning = next.some(status => status.settings.enabled && peripheralStatusMessage(status).warning);
        }
      } catch {
        hasWarning = true;
      } finally {
        pending = false;
        if (!controller.signal.aborted) {
          scheduleNext(hasWarning ? PERIPHERAL_ERROR_POLL_INTERVAL_MS : PERIPHERAL_POLL_INTERVAL_MS);
        }
      }
    };

    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return <>{statuses.filter(status => status.settings.enabled).map(status => {
    const health = peripheralStatusMessage(status);
    return <span key={status.id} title={health.message} className={`inline-flex items-center gap-3 whitespace-nowrap text-[36px] font-semibold ${health.warning ? 'text-lmu-warn' : 'text-lmu-muted'}`}>
      {health.warning && <AlertTriangle size={36} aria-hidden="true" className="shrink-0" />}{health.message}
    </span>;
  })}</>;
}
