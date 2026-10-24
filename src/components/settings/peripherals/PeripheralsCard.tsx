import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { DeviceCatalog, MappingChange, MappingData, MappingSuggestion, PeripheralDevice, PeripheralSettings, PeripheralStatus } from '../../../../shared/types/peripherals/peripherals.js';
import { peripheralStatusMessage } from '../../../../shared/domain/peripherals/peripheralStatus.js';
import { applyCarPreset, fetchPeripherals, fetchPeripheralDevices, fetchPresetCatalog, fetchPresetMappings, refreshPeripheralHealth, refreshPresetCatalog, savePeripheralSettings, savePresetMappings, suggestPresetMappings } from '../../../api/peripheralsApi.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { FeedbackMessage, SettingsPanel } from '../SettingsPanel.js';
import type { SettingsFeedback } from '../SettingsPanel.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { PeripheralDevicePickers } from './PeripheralDevicePickers.js';
import { PresetMappingTable } from './PresetMappingTable.js';
import { PeripheralSelectionStatus } from './PeripheralSelectionStatus.js';

export function PeripheralsCard() {
  const [status, setStatus] = useState<PeripheralStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<PeripheralDevice[]>([]);
  const [catalog, setCatalog] = useState<DeviceCatalog | null>(null);
  const [data, setData] = useState<MappingData>({ cars: [], mappings: [] });
  const [suggestions, setSuggestions] = useState<MappingSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<SettingsFeedback | null>(null);
  const mounted = useRef(false);
  const actionPending = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let pending = false;
    const load = async (refreshHealth = false) => {
      if (pending || actionPending.current) return;
      pending = true;
      const startedAt = revision.current;
      const stale = () => controller.signal.aborted || startedAt !== revision.current;
      try {
        let next = (await fetchPeripherals(controller.signal))[0];
        if (stale()) return;
        setLoading(false);
        if (!next) return;
        if (refreshHealth && next.settings.enabled && next.install === 'ready') {
          next = await refreshPeripheralHealth(controller.signal);
          if (stale()) return;
        }
        setStatus(next);
        if (next.settings.enabled && next.install === 'ready') {
          const [list, mapping] = await Promise.all([fetchPresetCatalog(controller.signal), fetchPresetMappings(controller.signal)]);
          if (!stale()) { setCatalog(list); setData(mapping); }
        }
      } catch (error) {
        if (!stale() && !isAbortError(error)) setFeedback({ tone: 'error', text: apiErrorMessage(error, 'Unable to load peripherals.') });
      } finally { pending = false; }
    };
    void load(true);
    const timer = setInterval(() => { void load(); }, 15_000);
    return () => { mounted.current = false; controller.abort(); clearInterval(timer); };
  }, []);

  const act = async (work: () => Promise<void>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    revision.current++;
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      if (mounted.current) {
        const next = (await fetchPeripherals())[0];
        if (mounted.current && next) setStatus(next);
      }
    }
    catch (error) { if (mounted.current && !isAbortError(error)) setFeedback({ tone: 'error', text: apiErrorMessage(error, 'Peripheral request failed.') }); }
    finally { actionPending.current = false; if (mounted.current) setBusy(false); }
  };
  const configure = (settings: PeripheralSettings) => void act(async () => {
    const next = await savePeripheralSettings(settings);
    if (!mounted.current) return;
    setStatus(next);
    if (settings.enabled) {
      const [list, mapping] = await Promise.all([fetchPresetCatalog(), fetchPresetMappings()]);
      if (mounted.current) { setCatalog(list); setData(mapping); }
    }
  });
  const save = (rows: MappingChange[]) => void act(async () => {
    const mapping = await savePresetMappings(rows);
    if (mounted.current) { setData(mapping); setSuggestions(null); setFeedback({ tone: 'ok', text: 'Mappings saved. Active presets were not changed.' }); }
  });
  const health = status ? peripheralStatusMessage(status) : null;
  const enabled = status?.settings.enabled === true && status.install === 'ready';
  const unused = catalog?.presets.filter(preset => preset.available && !data.mappings.some(row => !row.broken
    && row.productUuid === catalog.device.productUuid && row.deviceUuid === catalog.device.deviceUuid && row.presetUuid === preset.presetUuid)) ?? [];
  return <SettingsPanel sectionId="peripherals">
    <div className="@container space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><h4 className="text-sm font-semibold text-lmu-text">Simagic · SimPro Manager</h4>
          <p className="mt-1 text-xs leading-relaxed text-lmu-muted">Select the wheel profile for each car; the wheelbase keeps its own profile. Automatic switching runs once in the first garage, before driving, and skips presets already active.</p></div>
        {status && <label className="flex shrink-0 items-center gap-2 text-sm text-lmu-text"><input type="checkbox" checked={status.settings.enabled} disabled={busy || status.install !== 'ready'} onChange={event => configure({ ...status.settings, enabled: event.target.checked })} className={`accent-lmu-accent ${FOCUS_RING}`} />Enable plugin</label>}
      </div>
      {!status && !feedback && <p aria-live="polite" className="text-sm text-lmu-muted">{loading ? 'Loading peripherals…' : 'No peripheral plugins available.'}</p>}
      {health && <p className={`flex items-center gap-2 text-sm ${health.warning ? 'text-lmu-warn' : 'text-lmu-muted'}`}>{health.warning && <AlertTriangle size={16} aria-hidden="true" />}{health.message}</p>}
      {status?.install === 'not-installed' && <p className="text-xs text-lmu-muted">Install the optional lmu-peripheral-simagic package and restart the backend.</p>}
      {status?.error && status.install === 'ready' && <p className="text-xs text-lmu-warn">{status.error}</p>}
      {enabled && <>
        <div className="grid gap-4 border-t border-lmu-border pt-4 @min-[720px]:grid-cols-2 @min-[720px]:gap-6">
          <div className="min-w-0 space-y-2">
            <div className="flex items-end gap-2">
              <PeripheralDevicePickers settings={status.settings} devices={devices.length ? devices : status.devices} busy={busy} onSave={configure} />
              <button type="button" className={`${SECONDARY_BUTTON} shrink-0`} disabled={busy} onClick={() => void act(async () => { const next = await fetchPeripheralDevices(); if (mounted.current) setDevices(next); })}>Discover devices</button>
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <label className="flex items-start gap-2 text-sm text-lmu-text"><input type="checkbox" checked={status.settings.automatic} disabled={busy} onChange={event => configure({ ...status.settings, automatic: event.target.checked })} className={`mt-1 shrink-0 accent-lmu-accent ${FOCUS_RING}`} />Switch automatically when a live session loads</label>
            <p className="text-xs leading-relaxed text-lmu-muted">Start SimPro Manager yourself. A wheel profile includes LEDs, buttons and paddles; the app selects the complete profile.</p>
          </div>
        </div>
        <details className="border-t border-lmu-border pt-3">
          <summary className={`cursor-pointer rounded-sm text-sm font-semibold text-lmu-text ${FOCUS_RING}`}>Car profile assignments</summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={SECONDARY_BUTTON} disabled={busy || !catalog} onClick={() => void act(async () => {
                const next = await refreshPresetCatalog();
                const mapping = await fetchPresetMappings();
                if (mounted.current) { setCatalog(next); setData(mapping); }
              })}><RefreshCw size={14} aria-hidden="true" />Refresh presets</button>
              {!catalog && <span className="text-xs text-lmu-muted">Select a wheel to load its presets.</span>}
              {catalog && <span className="text-xs text-lmu-muted">{catalog.refreshedAt === null ? 'not refreshed' : new Date(catalog.refreshedAt).toLocaleString()}{catalog.lastError && <span className="ml-2 text-lmu-warn">Cached · {catalog.lastError}</span>}</span>}
            </div>
            {unused.length > 0 && <div role="status" className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-lmu-warn" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-lmu-warn">{unused.length} {unused.length === 1 ? 'preset is' : 'presets are'} not assigned to a car or class default</p>
                <p className="break-words text-xs text-lmu-text-soft">{unused.map(preset => preset.name).join(', ')}</p>
              </div>
            </div>}
            {catalog && <PresetMappingTable data={data} catalog={catalog} busy={busy || status.busy} applyBlockedReason={status.applyBlockedReason} suggestions={suggestions} onSave={save} onDismiss={() => setSuggestions(null)}
              onSuggest={overwrite => void act(async () => { const next = await suggestPresetMappings(overwrite); if (mounted.current) setSuggestions(next); })}
              onApply={car => void act(async () => { const run = await applyCarPreset(car); if (mounted.current) setStatus({ ...status, lastRun: run }); })} />}
          </div>
        </details>
      </>}
      {status?.install === 'ready' && <PeripheralSelectionStatus status={status} />}
      <FeedbackMessage feedback={feedback} />
    </div>
  </SettingsPanel>;
}
