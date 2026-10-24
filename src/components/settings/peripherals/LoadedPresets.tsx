import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { LoadedPeripheralPresets } from '../../../../shared/types/peripherals/peripherals.js';
import { fetchLoadedPresets } from '../../../api/peripheralsApi.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

export function LoadedPresets({ busy }: { busy: boolean }) {
  const [data, setData] = useState<LoadedPeripheralPresets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      setLoading(true);
      try {
        const next = await fetchLoadedPresets(controller.signal);
        if (!controller.signal.aborted) { setData(next); setError(null); }
      } catch (cause) {
        if (!controller.signal.aborted && !isAbortError(cause)) {
          setData(null);
          setError(apiErrorMessage(cause, 'Unable to read loaded presets. Check that SimPro Manager is running.'));
        }
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 15_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [busy, refresh]);

  return <div className="space-y-3 border-t border-lmu-border pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-lmu-text">Loaded presets</h4>
      <div className="flex items-center gap-3">
        {data && <span className="text-xs text-lmu-muted">Read at {new Date(data.observedAt).toLocaleTimeString()}</span>}
        <button type="button" disabled={busy || loading} aria-label="Refresh loaded presets" onClick={() => setRefresh(value => value + 1)}
          className={`inline-flex items-center gap-1 rounded-sm text-xs text-lmu-muted transition-colors hover:text-white cursor-pointer disabled:cursor-not-allowed disabled:text-lmu-faint ${FOCUS_RING}`}>
          <RefreshCw size={12} aria-hidden="true" />Refresh
        </button>
      </div>
    </div>
    <div aria-live="polite">
      {error && <p className="text-xs text-lmu-warn">{error}</p>}
      {!data && !error && <p className="text-xs text-lmu-muted">{busy ? 'Waiting for preset selection to finish…' : 'Reading loaded presets from SimPro…'}</p>}
      {data?.devices.length === 0 && <p className="text-xs text-lmu-muted">No connected wheelbase or wheel found in SimPro Manager.</p>}
      {data && <div className="grid gap-3 @min-[720px]:grid-cols-2 @min-[720px]:gap-6">
        {[...data.devices].sort((a, b) => a.device.role.localeCompare(b.device.role)).map(({ device, preset, error: deviceError }) => <div key={`${device.productUuid}:${device.deviceUuid}`} className="min-w-0 space-y-1 text-xs">
          <p className="font-medium text-lmu-muted">{device.role === 'base' ? 'Wheelbase' : 'Wheel'} · {device.name}</p>
          {preset && <p className="break-words text-sm font-medium text-lmu-text">{preset.name}</p>}
          {deviceError && <p className="text-lmu-warn">{deviceError}</p>}
        </div>)}
      </div>}
    </div>
  </div>;
}
