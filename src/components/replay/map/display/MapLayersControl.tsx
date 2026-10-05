import React, { useEffect, useId, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { DEFAULT_MAP_LAYERS, MAP_LAYER_LABELS, type MapLayers, type MapLayerKey } from './mapLayers.js';

interface Props {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
  available: Partial<Record<MapLayerKey, boolean>>;
  error?: string | null;
  onFitTrack: () => void;
  onFitVisible: () => void;
}

export const MapLayersControl: React.FC<Props> = ({ layers, onChange, available, error, onFitTrack, onFitVisible }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const isPointerDownInside = useRef(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onPointerUp = () => {
      isPointerDownInside.current = false;
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [open]);
  return <div ref={root} className="relative" data-map-control="layers"
    onBlur={e => {
      if (isPointerDownInside.current) return;
      if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
    }}
    onPointerDown={e => {
      isPointerDownInside.current = true;
      e.stopPropagation();
    }} onClick={e => e.stopPropagation()}
    onDoubleClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && open) {
      e.preventDefault(); setOpen(false); trigger.current?.focus();
    } }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)}
      className={`h-7 px-2 flex items-center gap-1.5 rounded-lg text-xs text-lmu-text-soft hover:bg-lmu-raised cursor-pointer ${FOCUS_RING}`}>
      <Layers className="w-3.5 h-3.5" />Layers
    </button>
    {open && <div ref={panel} id={id} aria-label="Map layers" role="group"
      className="absolute top-full right-0 mt-2 w-56 p-3 bg-lmu-card border border-lmu-border rounded-lg shadow-lg z-40">
      <div className="text-sm font-semibold text-lmu-text mb-2">Map layers</div>
      {(Object.keys(MAP_LAYER_LABELS) as Array<keyof typeof MAP_LAYER_LABELS>).map(key => (
        <React.Fragment key={key}>
          <label
            className={`flex gap-2 items-center py-1.5 text-xs select-none ${available[key] === false ? 'text-lmu-faint cursor-not-allowed' : 'text-lmu-text-soft cursor-pointer hover:text-lmu-text'}`}>
            <input type="checkbox" checked={available[key] !== false && layers[key]} disabled={available[key] === false}
              onChange={e => onChange(key === 'runoff'
                ? { ...layers, runoff: e.target.checked, otherRoad: e.target.checked }
                : { ...layers, [key]: e.target.checked })}
              className={`accent-lmu-accent w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed ${FOCUS_RING}`} />{MAP_LAYER_LABELS[key]}
          </label>
          {key === 'brakeMarkers' && layers.brakeMarkers && available.brakeMarkers !== false && (
            <div className="pl-5 py-1 flex flex-col gap-1 border-l-2 border-slate-700/60 ml-2 mb-1" role="group" aria-label="Braking marker types">
              <label className="flex gap-2 items-center text-[11px] select-none text-lmu-text-soft cursor-pointer hover:text-lmu-text">
                <input type="checkbox" checked={layers.brakeDistance !== false}
                  onChange={e => onChange({ ...layers, brakeDistance: e.target.checked })}
                  className={`accent-lmu-accent w-3 h-3 cursor-pointer ${FOCUS_RING}`} />
                Distance (100, 50...)
              </label>
              <label className="flex gap-2 items-center text-[11px] select-none text-lmu-text-soft cursor-pointer hover:text-lmu-text">
                <input type="checkbox" checked={layers.brakeAds !== false}
                  onChange={e => onChange({ ...layers, brakeAds: e.target.checked })}
                  className={`accent-lmu-accent w-3 h-3 cursor-pointer ${FOCUS_RING}`} />
                Sponsor ads (TOT, DHL...)
              </label>
              <label className="flex gap-2 items-center text-[11px] select-none text-lmu-text-soft cursor-pointer hover:text-lmu-text">
                <input type="checkbox" checked={layers.brakeDigi !== false}
                  onChange={e => onChange({ ...layers, brakeDigi: e.target.checked })}
                  className={`accent-lmu-accent w-3 h-3 cursor-pointer ${FOCUS_RING}`} />
                Digi boards (DIGI)
              </label>
            </div>
          )}
        </React.Fragment>
      ))}
      {(available.pit === false || available.runoff === false || available.brakeMarkers === false) && <p className="text-xs text-lmu-muted mt-2">
        Some optional map layers are unavailable for this layout.</p>}
      {error && <p role="status" className="text-xs text-lmu-warn mt-2">{error}</p>}
      <div className="flex flex-col items-start gap-2 mt-3 pt-3 border-t border-lmu-border">
        <button type="button" onClick={onFitTrack} className={`text-xs text-lmu-text-soft hover:text-lmu-text cursor-pointer ${FOCUS_RING}`}>Fit track</button>
        <button type="button" onClick={onFitVisible} className={`text-xs text-lmu-text-soft hover:text-lmu-text cursor-pointer ${FOCUS_RING}`}>Fit visible layers</button>
        <button type="button" onClick={() => onChange({ ...DEFAULT_MAP_LAYERS })}
          className={`text-xs text-lmu-muted hover:text-lmu-text cursor-pointer ${FOCUS_RING}`}>Restore defaults</button>
      </div>
    </div>}
  </div>;
};
