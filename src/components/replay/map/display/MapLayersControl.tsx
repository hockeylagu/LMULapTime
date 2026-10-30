import React, { useEffect, useId, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { DROPDOWN_CONTENT_INSET, DROPDOWN_PANEL } from '../../../common/dropdown/dropdownStyles.js';
import { DEFAULT_MAP_LAYERS, MAP_LAYER_LABELS, RUNOFF_GROUP, RUNOFF_LEGEND, type MapLayers, type MapLayerKey } from './mapLayers.js';
import { EMPTY_ARRAY } from '../../../../utils/emptyDefaults.js';

export interface PedalPointsControl {
  visible: boolean;
  available: boolean;
  onToggle: () => void;
}

interface Props {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
  available: Partial<Record<MapLayerKey, boolean>>;
  /** Runoff kinds this layout has, keyed for the colour legend. */
  runoffKinds?: readonly MapLayerKey[];
  hasRaisedKerbs?: boolean;
  error?: string | null;
  onFitTrack: () => void;
  onFitVisible: () => void;
  pedalPoints?: PedalPointsControl;
}

export const MapLayersControl: React.FC<Props> = ({ layers, onChange, available, runoffKinds = EMPTY_ARRAY, hasRaisedKerbs = false, error, onFitTrack, onFitVisible, pedalPoints }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    const viewport = root.current?.closest('[data-map-control="navigation"]')?.parentElement;
    const resize = () => {
      if (!viewport || !panel.current) return;
      const bounds = viewport.getBoundingClientRect();
      if (bounds.height > 0) panel.current.style.maxHeight = `${Math.max(0, bounds.bottom - panel.current.getBoundingClientRect().top - 12)}px`;
    };
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (viewport) observer?.observe(viewport);
    window.addEventListener('resize', resize);
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    // Other map controls stop bubbling pointer events; capture still observes outside clicks.
    document.addEventListener('pointerdown', dismiss, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointerdown', dismiss, true);
    };
  }, [open]);
  return <div ref={root} className="relative" data-map-control="layers"
    onBlur={e => {
      if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
    }}
    onPointerDown={e => {
      // Label text otherwise blurs the checkbox to the page before forwarding its click.
      // Keep focus inside the panel without a pointer flag that can get stuck.
      if (e.target instanceof Element && !(e.target instanceof HTMLInputElement) && e.target.closest('label')) e.preventDefault();
      e.stopPropagation();
    }} onClick={e => e.stopPropagation()}
    onDoubleClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && open) {
      e.preventDefault(); setOpen(false); trigger.current?.focus();
    } }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={id}
      aria-label="Layers" title="Layers"
      onClick={() => setOpen(value => !value)}
      className={`w-7 h-7 flex items-center justify-center rounded-lg bg-lmu-raised/40 hover:bg-lmu-raised aria-expanded:bg-lmu-raised text-lmu-muted hover:text-lmu-text aria-expanded:text-lmu-text transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}>
      <Layers className="w-3.5 h-3.5" />
    </button>
    {open && <div ref={panel} id={id} aria-label="Map layers" role="group"
      className={`absolute top-full right-0 mt-1 w-56 max-h-[calc(100dvh-100px)] overflow-y-auto overscroll-contain custom-scrollbar z-40 ${DROPDOWN_PANEL} ${DROPDOWN_CONTENT_INSET}`}>
      <div className="text-sm font-semibold text-lmu-text mb-2">Map layers</div>
      {(Object.keys(MAP_LAYER_LABELS) as Array<keyof typeof MAP_LAYER_LABELS>).map(key => (
        <React.Fragment key={key}>
          <label
            className={`flex gap-2 items-center text-xs select-none ${key === 'startFinish' || key === 'brakeMarkers' ? 'mt-2 border-t border-lmu-border pt-3 pb-1.5' : 'py-1.5'} ${available[key] === false ? 'text-lmu-faint cursor-not-allowed' : 'text-lmu-text-soft cursor-pointer hover:text-lmu-text'}`}>
            <input type="checkbox" checked={available[key] !== false && layers[key]} disabled={available[key] === false}
              onChange={e => onChange(key === 'runoff'
                ? { ...layers, ...Object.fromEntries(RUNOFF_GROUP.map(layer => [layer, e.target.checked])) }
                : { ...layers, [key]: e.target.checked })}
              className={`accent-lmu-accent w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed ${FOCUS_RING}`} />{MAP_LAYER_LABELS[key]}
          </label>
          {key === 'turns' && pedalPoints && <label
            className={`flex gap-2 items-center py-1.5 text-xs select-none ${pedalPoints.available ? 'text-lmu-text-soft cursor-pointer hover:text-lmu-text' : 'text-lmu-faint cursor-not-allowed'}`}>
            <input type="checkbox" checked={pedalPoints.available && pedalPoints.visible} disabled={!pedalPoints.available}
              onChange={pedalPoints.onToggle} className={`accent-lmu-accent w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed ${FOCUS_RING}`} />
            Pedal Points
          </label>}
          {key === 'kerb' && layers.kerb && hasRaisedKerbs && (
            <ul className="pl-5 py-1 flex flex-col gap-1 border-l border-lmu-border ml-2 mb-1" aria-label="Kerb colours">
              {[{ label: 'Standard kerbs', color: MAP_COLORS.kerbSurface },
                { label: 'Raised kerbs', color: MAP_COLORS.raisedKerbSurface }].map(item => (
                <li key={item.label} className="flex gap-2 items-center text-[11px] text-lmu-muted">
                  <span aria-hidden className="w-3 h-3 rounded-sm border border-lmu-rule" style={{ backgroundColor: item.color }} />
                  {item.label}
                </li>))}
            </ul>
          )}
          {key === 'runoff' && layers.runoff && runoffKinds.length > 1 && (
            <ul className="pl-5 py-1 flex flex-col gap-1 border-l border-lmu-border ml-2 mb-1" aria-label="Runoff colours">
              {RUNOFF_LEGEND.filter(item => runoffKinds.includes(item.key)).map(item => (
                <li key={item.key} className="flex gap-2 items-center text-[11px] text-lmu-muted">
                  <span aria-hidden className="w-3 h-3 rounded-sm border border-lmu-rule" style={{ backgroundColor: item.color }} />
                  {item.label}
                </li>))}
            </ul>
          )}
          {key === 'brakeMarkers' && layers.brakeMarkers && available.brakeMarkers !== false && (
            <div className="pl-5 py-1 flex flex-col gap-1 border-l border-lmu-border ml-2 mb-1" role="group" aria-label="Braking marker types">
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
