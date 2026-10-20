import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Select, type SelectItem } from '../../../../src/components/common/dropdown/Select.js';

const OPTIONS: SelectItem<string>[] = [
  { value: 'spa', label: 'Spa' },
  { value: 'sebring', label: 'Sebring', disabled: true },
  { group: 'Endurance', options: [
    { value: 'lemans', label: 'Le Mans', detail: '3:24.1' },
    { value: 'monza', label: 'Monza' },
  ] },
];

function Harness({ onChange = vi.fn(), initial = 'spa' }: { onChange?: (value: string) => void; initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return <Select aria-label="Track" value={value} placeholder="Pick a track" options={OPTIONS}
    onChange={next => { setValue(next); onChange(next); }} />;
}

const active = (combobox: HTMLElement) => document.getElementById(combobox.getAttribute('aria-activedescendant') ?? '')?.textContent;

describe('Select', () => {
  it('shows the chosen label, or the placeholder while nothing matches', () => {
    const { rerender } = render(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Track' })).toHaveTextContent('Spa');
    rerender(<Harness key="empty" initial={null} />);
    expect(screen.getByRole('combobox', { name: 'Track' })).toHaveTextContent('Pick a track');
  });

  it('moves through enabled options with arrows, Home and End, and chooses with Enter', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combobox = screen.getByRole('combobox', { name: 'Track' });
    combobox.focus();
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(active(combobox)).toBe('Spa');
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(active(combobox)).toContain('Le Mans');
    fireEvent.keyDown(combobox, { key: 'End' });
    expect(active(combobox)).toBe('Monza');
    fireEvent.keyDown(combobox, { key: 'Home' });
    expect(active(combobox)).toBe('Spa');
    fireEvent.keyDown(combobox, { key: 'End' });
    fireEvent.keyDown(combobox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('monza');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(combobox).toHaveFocus();
  });

  it('jumps by typed prefix and never lands on a disabled option', () => {
    render(<Harness initial="monza" />);
    const combobox = screen.getByRole('combobox', { name: 'Track' });
    // Typeahead times keys by the event's own timestamp.
    const keyAt = (key: string, timeStamp: number) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: timeStamp });
      fireEvent(combobox, event);
    };
    keyAt('l', 1000);
    keyAt('e', 1100);
    expect(active(combobox)).toContain('Le Mans');
    keyAt('Escape', 1200);
    keyAt('s', 1800);
    expect(active(combobox)).toBe('Spa');
    // Sebring is disabled, so S cycles past it back to Spa.
    keyAt('s', 2400);
    expect(active(combobox)).toBe('Spa');
  });

  it('keeps disabled options inert to the pointer and shows group captions', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Track' }));
    expect(screen.getByRole('group', { name: 'Endurance' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Sebring' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Le Mans/ }));
    expect(onChange).toHaveBeenCalledWith('lemans');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape without letting a surrounding layer see the key', () => {
    const outer = vi.fn();
    render(<div onKeyDown={outer}><Harness /></div>);
    const combobox = screen.getByRole('combobox', { name: 'Track' });
    fireEvent.click(combobox);
    fireEvent.keyDown(combobox, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(outer).not.toHaveBeenCalled();
  });

  it('closes on a press outside and mounts inside an open modal layer', () => {
    render(<div role="dialog" aria-modal="true" aria-label="Picker"><Harness /></div>);
    fireEvent.click(screen.getByRole('combobox', { name: 'Track' }));
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('listbox'));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
