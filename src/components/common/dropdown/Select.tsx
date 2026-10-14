import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, LoaderCircle } from 'lucide-react';
import {
  DROPDOWN_CAPTION, DROPDOWN_CHEVRON, DROPDOWN_GROUP_LABEL, DROPDOWN_LIST_INSET, DROPDOWN_OPTION, DROPDOWN_OPTION_SELECTED, DROPDOWN_PANEL,
  DROPDOWN_TRIGGER, DROPDOWN_TRIGGER_COMPACT, DROPDOWN_TRIGGER_FILTER,
} from './dropdownStyles.js';
import { useAnchoredPanel, useOutsidePress } from './useAnchoredPanel.js';

export type SelectValue = string | number;

export interface SelectOption<T extends SelectValue> {
  value: T;
  label: ReactNode;
  /** Typeahead and the closed field's title; defaults to a string label. */
  text?: string;
  /** Trailing figure on the option row (a lap time, a count), in mono. */
  detail?: ReactNode;
  disabled?: boolean;
}

export interface SelectGroup<T extends SelectValue> {
  group: string;
  options: readonly SelectOption<T>[];
}

export type SelectItem<T extends SelectValue> = SelectOption<T> | SelectGroup<T>;

export interface SelectProps<T extends SelectValue> {
  value: T | null;
  onChange: (value: T) => void;
  options: readonly SelectItem<T>[];
  /** Needed unless a `<label htmlFor={id}>` names the field. */
  'aria-label'?: string;
  id?: string;
  title?: string;
  /** Shown while no option matches the value. */
  placeholder?: ReactNode;
  /** Leading icon and caption inside the trigger ("Sort:"). */
  icon?: ReactNode;
  caption?: ReactNode;
  /** The closed field's text; defaults to the selected option's label. */
  renderValue?: (option: SelectOption<T> | undefined) => ReactNode;
  size?: 'default' | 'compact' | 'filter';
  /** Monospace value text, for speeds and scales. */
  mono?: boolean;
  disabled?: boolean;
  busy?: boolean;
  /** Trigger sizing (width) and panel sizing; the panel is never narrower than the trigger. */
  className?: string;
  panelClassName?: string;
  align?: 'start' | 'end';
  triggerRef?: Ref<HTMLButtonElement>;
}

const isGroup = <T extends SelectValue>(item: SelectItem<T>): item is SelectGroup<T> => 'group' in item;
const textOf = <T extends SelectValue>(option: SelectOption<T>) => option.text ?? (typeof option.label === 'string' ? option.label : String(option.value));

/**
 * The single-choice dropdown (DESIGN.md, Dropdowns): a select-only combobox. Focus stays on the trigger and
 * the open list follows it through aria-activedescendant, with arrows, Home/End, Page keys, typeahead,
 * Enter/Space to choose and Escape to close, like a native select but drawn the same in every browser.
 */
export function Select<T extends SelectValue>({
  value, onChange, options, id, title, placeholder, icon, caption, renderValue, size = 'default', mono = false,
  disabled = false, busy = false, className = '', panelClassName = '', align = 'start', triggerRef, ...aria
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const baseId = useId();
  const listId = `${baseId}-list`;
  const flat = options.flatMap(item => isGroup(item) ? item.options : [item]);
  const selectedIndex = flat.findIndex(option => option.value === value);
  const selected = flat[selectedIndex];
  const host = useAnchoredPanel(open, buttonRef, panelRef, align);

  const close = useCallback(() => setOpen(false), []);
  useOutsidePress(open, [buttonRef, panelRef], close);

  const step = (from: number, delta: number) => {
    for (let index = from + delta; index >= 0 && index < flat.length; index += delta) if (!flat[index]?.disabled) return index;
    return from;
  };
  const jump = (delta: number) => {
    let index = active;
    for (let page = 0; page < 10; page++) index = step(index, delta);
    return index;
  };
  const openList = (index = selectedIndex >= 0 ? selectedIndex : step(-1, 1)) => { setOpen(true); setActive(index); };
  // Keep the active option in view; test DOMs have no scrollIntoView.
  useLayoutEffect(() => {
    if (open && host && active >= 0) document.getElementById(`${baseId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, host, active, baseId]);
  const choose = (index: number) => {
    const option = flat[index];
    setOpen(false);
    if (option && !option.disabled && option.value !== value) onChange(option.value);
  };
  const typeahead = (key: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at > 500 ? key : typed.current.text + key, at: now };
    const prefix = typed.current.text.toLowerCase();
    const start = open ? active : selectedIndex;
    const order = [...flat.keys()].map(offset => (start + 1 + offset) % flat.length);
    // A repeated single letter cycles; a longer prefix keeps the current match if it still fits.
    const candidates = prefix.length > 1 ? [start, ...order] : order;
    return candidates.find(index => index >= 0 && !flat[index]?.disabled && textOf(flat[index]!).toLowerCase().startsWith(prefix)) ?? -1;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    const printable = key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && (key !== ' ' || typed.current.text !== '' && Date.now() - typed.current.at < 500);
    if (printable) {
      event.preventDefault();
      event.stopPropagation();
      const match = typeahead(key);
      if (match >= 0) open ? setActive(match) : openList(match);
      return;
    }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
        event.preventDefault();
        event.stopPropagation();
        openList(key === 'ArrowUp' && selectedIndex < 0 ? step(flat.length, -1) : undefined);
      }
      return;
    }
    const moves: Record<string, () => number> = {
      ArrowDown: () => step(active, 1), ArrowUp: () => step(active, -1),
      Home: () => step(-1, 1), End: () => step(flat.length, -1),
      PageDown: () => jump(1), PageUp: () => jump(-1),
    };
    if (moves[key]) { event.preventDefault(); event.stopPropagation(); setActive(moves[key]()); return; }
    if (key === 'Enter' || key === ' ') { event.preventDefault(); event.stopPropagation(); choose(active); return; }
    if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (key === 'Tab') setOpen(false);
  };

  let index = -1;
  const row = (option: SelectOption<T>) => {
    const position = ++index;
    const isSelected = position === selectedIndex;
    return <div key={String(option.value)} id={`${baseId}-${position}`} data-value={String(option.value)} role="option" aria-selected={isSelected} aria-disabled={option.disabled || undefined}
      className={`${DROPDOWN_OPTION} ${isSelected ? DROPDOWN_OPTION_SELECTED : ''} ${position === active ? 'bg-lmu-raised text-white' : ''} ${option.disabled ? 'text-lmu-faint hover:bg-transparent hover:text-lmu-faint cursor-not-allowed' : 'cursor-pointer'}`}
      onPointerEnter={() => { if (!option.disabled) setActive(position); }}
      onClick={() => { if (!option.disabled) choose(position); }}>
      <Check aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-white' : 'invisible'}`} />
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.detail !== undefined && <span className="shrink-0 font-mono text-lmu-muted">{option.detail}</span>}
    </div>;
  };

  const shown = renderValue ? renderValue(selected) : selected?.label ?? placeholder;
  const trigger = size === 'compact' ? DROPDOWN_TRIGGER_COMPACT : size === 'filter' ? DROPDOWN_TRIGGER_FILTER : DROPDOWN_TRIGGER;
  return <>
    <button ref={node => {
      buttonRef.current = node;
      if (typeof triggerRef === 'function') triggerRef(node); else if (triggerRef) triggerRef.current = node;
    }} id={id} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open && active >= 0 ? `${baseId}-${active}` : undefined} aria-busy={busy || undefined}
      aria-label={aria['aria-label']} title={title ?? (selected ? textOf(selected) : undefined)} disabled={disabled} data-value={value ?? ''}
      className={`${trigger} ${className}`} onClick={() => open ? setOpen(false) : openList()} onKeyDown={onKeyDown}>
      {icon}
      {caption && <span className={DROPDOWN_CAPTION}>{caption}</span>}
      <span className={`min-w-0 flex-1 truncate text-left ${mono ? 'font-mono' : ''} ${selected ? '' : 'text-lmu-muted'}`}>{shown}</span>
      {busy ? <LoaderCircle aria-hidden="true" className={`${DROPDOWN_CHEVRON} animate-spin`} /> : <ChevronDown aria-hidden="true" className={DROPDOWN_CHEVRON} />}
    </button>
    {open && host && createPortal(
      <div ref={panelRef} id={listId} role="listbox" aria-label={aria['aria-label']} aria-labelledby={aria['aria-label'] ? undefined : id} tabIndex={-1}
        data-map-control="dropdown"
        className={`fixed left-0 top-0 z-[1200] max-w-[min(480px,calc(100vw-16px))] overflow-y-auto overscroll-contain custom-scrollbar ${DROPDOWN_PANEL} ${DROPDOWN_LIST_INSET} ${panelClassName}`}
        // The trigger keeps focus while the pointer chooses, so the modal and map focus traps never see it leave.
        onMouseDown={event => event.preventDefault()} onPointerDown={event => event.stopPropagation()}>
        {options.map(item => isGroup(item)
          ? <div key={`group-${item.group}`} role="group" aria-label={item.group}>
            <div aria-hidden="true" className={DROPDOWN_GROUP_LABEL}>{item.group}</div>
            {item.options.map(row)}
          </div>
          : row(item))}
      </div>, host)}
  </>;
}
