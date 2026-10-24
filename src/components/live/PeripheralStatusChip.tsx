import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchPeripherals } from '../../api/peripheralsApi.js';
import type { PeripheralStatus } from '../../../shared/types/peripherals/peripherals.js';
import { peripheralStatusMessage } from '../../../shared/domain/peripherals/peripheralStatus.js';

/** Passive status only: no launch, apply or settings actions on the driving display. */
export function PeripheralStatusChip() {
  const [statuses, setStatuses] = useState<PeripheralStatus[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await fetchPeripherals(controller.signal);
        if (!controller.signal.aborted && Array.isArray(next)) setStatuses(next);
      } catch { /* The main live connection already indicates backend failures. */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  return <>{statuses.filter(status => status.settings.enabled).map(status => {
    const health = peripheralStatusMessage(status);
    return <span key={status.id} title={health.message} className={`inline-flex max-w-[360px] items-center gap-2 whitespace-normal text-base font-medium ${health.warning ? 'text-lmu-warn' : 'text-lmu-muted'}`}>
      {health.warning && <AlertTriangle size={18} aria-hidden="true" />}{health.message}
    </span>;
  })}</>;
}
