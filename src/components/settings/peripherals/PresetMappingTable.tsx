import { useState } from 'react';
import type { DeviceCatalog, MappingChange, MappingData, MappingRow, MappingSuggestion, PeripheralCar } from '../../../../shared/types/peripherals/peripherals.js';
import { VEHICLE_CLASS_OPTIONS } from '../../../../shared/domain/vehicleMapping.js';
import { Select, type SelectOption } from '../../common/dropdown/Select.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';

interface Props {
  data: MappingData; catalog: DeviceCatalog | null; busy: boolean; suggestions: MappingSuggestion[] | null;
  applyBlockedReason?: string | null;
  onSave: (rows: MappingChange[]) => void; onSuggest: (overwrite: boolean) => void; onDismiss: () => void; onApply: (car: PeripheralCar) => void;
}
export function PresetMappingTable({ data, catalog, busy, suggestions, applyBlockedReason, onSave, onSuggest, onDismiss, onApply }: Props) {
  const [query, setQuery] = useState('');
  const [presetQuery, setPresetQuery] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const classes = VEHICLE_CLASS_OPTIONS.filter(item => item.id !== 'All');
  // Oreca 07 is listed under both LMP2 classes: one model row, or one class default per class.
  const unique = [...new Map((suggestions ?? []).map(row => [`${row.scopeKind}:${row.scopeKey}`, row])).values()];
  const label = (row: MappingSuggestion) => row.scopeKind === 'class' ? `${classes.find(item => item.id === row.scopeKey)?.label ?? row.scopeKey} default` : row.car.model;
  const proposed = unique.filter(row => row.presetUuid !== null);
  const unmatched = unique.filter(row => row.presetUuid === null);
  // Presets that neither a saved assignment nor this suggestion gives to a car.
  const idle = suggestions ? catalog?.presets.filter(preset => preset.available && !proposed.some(row => row.presetUuid === preset.presetUuid)
    && !data.mappings.some(row => !row.broken && row.presetUuid === preset.presetUuid)) ?? [] : [];
  const suggested = (kind: 'model' | 'class', key: string) => proposed.find(row => row.scopeKind === kind && row.scopeKey === key);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={SECONDARY_BUTTON} disabled={busy || !catalog} onClick={() => onSuggest(overwrite)}>Suggest mappings</button>
      <label className="flex items-center gap-2 text-xs text-lmu-muted" title="Also suggest presets for cars that already have one. Saving the suggestions then replaces those presets; cars without a match and class defaults keep theirs.">
        <input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.target.checked)} className={`accent-lmu-accent ${FOCUS_RING}`} />Replace existing in preview</label>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 @min-[720px]:max-w-sm">
        <input aria-label="Filter cars" placeholder="Filter cars…" value={query} onChange={event => setQuery(event.target.value)} className={`h-8 min-w-0 rounded-lg border border-lmu-border bg-lmu-deep px-3 text-xs text-lmu-text ${FOCUS_RING}`} />
        <input aria-label="Filter preset choices" placeholder="Filter preset choices…" value={presetQuery} onChange={event => setPresetQuery(event.target.value)} className={`h-8 min-w-0 rounded-lg border border-lmu-border bg-lmu-deep px-3 text-xs text-lmu-text ${FOCUS_RING}`} />
      </div>
    </div>
    {catalog && catalog.presets.length === 0 && <p className="text-xs text-lmu-warn">No presets are tagged for Le Mans Ultimate in SimPro. Tag your wheel profiles for LMU in SimPro, then refresh the presets.</p>}
    {suggestions && <div className="space-y-3 rounded-xl border border-lmu-border p-4">
      <p className="text-sm font-medium text-lmu-text">{new Set(proposed.map(row => row.car.model)).size} of {new Set(unique.map(row => row.car.model)).size} cars matched an LMU preset. Review, then save.</p>
      {proposed.length + idle.length > 0 && <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">{proposed.map(row => <li key={`${row.scopeKind}:${row.scopeKey}`} className="text-lmu-text-soft">
        {label(row)} <span aria-hidden="true" className="text-lmu-muted">→</span><span className="sr-only">:</span> <span className="font-medium text-lmu-info">{row.presetName}</span>
      </li>)}{idle.map(preset => <li key={preset.presetUuid} className="text-lmu-muted">
        No car <span aria-hidden="true">→</span><span className="sr-only">:</span> <span className="font-medium text-lmu-warn">{preset.name}</span>
      </li>)}</ul>}
      {unmatched.length > 0 && <p className="text-xs text-lmu-muted">No confident match ({unmatched.length}): {unmatched.map(row => row.reason.startsWith('Ambiguous') ? `${label(row)} (${row.reason.toLowerCase()})` : label(row)).join(', ')}. Choose these in the table.</p>}
      <div className="flex gap-2"><button type="button" className={SECONDARY_BUTTON} disabled={busy || !proposed.length} onClick={() => onSave(proposed.map(row => ({ scopeKind: row.scopeKind, scopeKey: row.scopeKey, presetUuid: row.presetUuid })))}>Save suggested mappings</button>
        <button type="button" className={SECONDARY_BUTTON} onClick={onDismiss}>Dismiss</button></div>
    </div>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-lmu-muted"><tr><th className="py-2">Car / class default</th><th>Wheel profile</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{classes.flatMap(category => {
        const cars = data.cars.filter(car => car.carClass === category.id);
        const scopes = [{ kind: 'class' as const, key: category.id, label: `${category.label} default`, model: null as string | null }, ...cars.map(car => ({ kind: 'model' as const, key: car.model, label: car.model, model: car.model }))];
        return scopes.filter(row => `${category.label} ${row.label}`.toLowerCase().includes(query.toLowerCase())).map(row => <tr key={`${category.id}:${row.kind}:${row.key}`} className="border-t border-lmu-border">
          <th scope="row" className={`py-1.5 pr-4 font-medium ${row.kind === 'class' ? 'text-lmu-muted' : 'text-lmu-text'}`}>{row.label}</th>
          <PresetCell row={row} mapping={data.mappings.find(item => item.scopeKind === row.kind && item.scopeKey === row.key)} suggestion={suggested(row.kind, row.key)} catalog={catalog} presetQuery={presetQuery} busy={busy} onSave={onSave} />
          <td className="w-px py-1.5"><button type="button" className={SECONDARY_BUTTON} disabled={busy || Boolean(applyBlockedReason)} title={applyBlockedReason ?? undefined} onClick={() => onApply({ model: row.model, carClass: category.id })} aria-label={`Apply ${row.label} preset`}>Apply</button></td>
        </tr>);
      })}</tbody></table></div>
    <p className="text-xs text-lmu-muted">Saved assignments take effect at the next session load. Apply is blocked on track; in the garage it also counts as the current load's switch.</p>
    {applyBlockedReason && <p className="text-xs text-lmu-warn">{applyBlockedReason}</p>}
    <p className="text-xs text-lmu-muted">Model assignments apply across classes of that model. Use class defaults for different WEC and ELMS profiles.</p>
  </div>;
}

interface PresetCellProps {
  row: { kind: 'model' | 'class'; key: string; label: string };
  mapping: MappingRow | undefined; suggestion: MappingSuggestion | undefined; catalog: DeviceCatalog | null; presetQuery: string; busy: boolean;
  onSave: (rows: MappingChange[]) => void;
}
function PresetCell({ row, mapping, suggestion, catalog, presetQuery, busy, onSave }: PresetCellProps) {
  const value = mapping?.broken ? `unavailable:${mapping.presetUuid}` : mapping?.presetUuid ?? '';
  const choices = catalog?.presets.filter(preset => preset.available && (preset.presetUuid === mapping?.presetUuid || preset.name.toLowerCase().includes(presetQuery.toLowerCase()))) ?? [];
  const options: SelectOption<string>[] = choices.map(preset => ({ value: preset.presetUuid, label: preset.name }));
  if (mapping?.broken) options.push({ value, label: 'Unavailable preset', disabled: true });
  return <td className="min-w-48 py-1.5 pr-3"><Select aria-label={`${row.label} wheel preset`} value={value} options={[{ value: '', label: row.kind === 'model' ? 'Use class default' : 'Unassigned' }, ...options]} disabled={busy || !catalog}
    onChange={next => onSave([{ scopeKind: row.kind, scopeKey: row.key, presetUuid: next || null }])} className="w-full" />
    {mapping?.broken && <span className="mt-1 block text-xs text-lmu-warn">Reassign or clear this preset.</span>}
    {suggestion && suggestion.presetUuid !== mapping?.presetUuid && <span className="mt-1 block text-xs text-lmu-info">Suggested: {suggestion.presetName} (not saved)</span>}</td>;
}
