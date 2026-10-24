import type { PeripheralStatus, PeripheralTarget, SwitchResult } from '../../../../shared/types/peripherals/peripherals.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { LoadedPresets } from './LoadedPresets.js';

/** Session decision and observed preset IDs are separate from editable mapping choices. */
export function PeripheralSelectionStatus({ status }: { status: PeripheralStatus }) {
  const hasSession = status.currentLoad.phase !== 'idle' || status.car !== null;
  return <>
    {status.settings.enabled && <LoadedPresets busy={status.busy} />}
    {(hasSession || status.lastRun) && <details className="border-t border-lmu-border pt-3">
      <summary className={`cursor-pointer rounded-sm text-sm font-semibold text-lmu-text ${FOCUS_RING}`}>Session switching</summary>
      <div className="mt-3 grid gap-4 text-xs @min-[720px]:grid-cols-3 @min-[720px]:gap-6">
        {hasSession && <div className="min-w-0 space-y-1">
          <h4 className="font-semibold text-lmu-text">Current session</h4>
          <p className="text-lmu-muted">Detected car: <span className="text-lmu-text">{status.car?.model ?? status.car?.carClass ?? 'No resolved live car'}</span></p>
          <p className={status.currentLoad.skipReason ? 'text-lmu-warn' : 'text-lmu-muted'}>
            {status.currentLoad.skipReason ?? (status.currentLoad.phase === 'pending' ? 'Waiting for the initial garage and car identity.'
              : status.currentLoad.phase === 'handled' ? status.busy ? 'Reading or selecting the session preset…' : 'This session load has been handled.' : 'No live session loaded.')}
          </p>
        </div>}
        {hasSession && status.target && <WheelTarget target={status.target} />}
        {status.lastRun && <div className="min-w-0 space-y-1">
          <h4 className="font-semibold text-lmu-text">Last session decision · {status.lastRun.car.model ?? status.lastRun.car.carClass ?? 'Unresolved car'}</h4>
          <p className="text-lmu-muted">{new Date(status.lastRun.startedAt).toLocaleString()}</p>
          {status.lastRun.skipReason && <p className="text-lmu-warn">Skipped: {status.lastRun.skipReason}</p>}
          {status.lastRun.wheel && <WheelResult result={status.lastRun.wheel} />}
        </div>}
      </div>
    </details>}
  </>;
}

function WheelTarget({ target }: { target: PeripheralTarget }) {
  return <div className="min-w-0 space-y-1">
    <p className="font-medium text-lmu-text">Wheel target · {target.device.name}</p>
    <p className={target.state === 'broken' ? 'text-lmu-warn' : 'text-lmu-text-soft'}>
      {target.state === 'waiting' ? 'Waiting for car identity' : target.state === 'unmapped' ? 'No assigned preset'
        : target.state === 'broken' ? `${target.presetName ?? 'Assigned preset'} · unavailable for this device` : target.presetName ?? 'Assigned preset'}
    </p>
    {target.source && <p className="text-lmu-muted">{target.source === 'model' ? 'Car assignment' : 'Class default'}</p>}
    {target.presetUuid && <p className="break-all font-mono text-lmu-muted">{target.presetUuid}</p>}
  </div>;
}

function WheelResult({ result }: { result: SwitchResult }) {
  return <div className="space-y-1 text-lmu-muted">
    <p><span className="font-medium text-lmu-text">Wheel · {result.outcome}</span>: {result.message}</p>
    {result.targetPresetUuid && <p>Requested preset: <span className="break-all font-mono">{result.targetPresetUuid}</span></p>}
    {result.beforePresetUuid !== undefined && <p>Before selection: <span className="break-all font-mono">{result.beforePresetUuid ?? 'Unknown'}</span></p>}
    {result.afterPresetUuid !== undefined && <p>Confirmation readback: <span className="break-all font-mono">{result.afterPresetUuid ?? 'Unknown'}</span></p>}
    {result.readbackError && <p className="text-lmu-warn">Readback: {result.readbackError}</p>}
  </div>;
}
