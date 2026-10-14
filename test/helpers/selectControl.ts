import { fireEvent } from '@testing-library/react';

/** The value a shared Select shows, as its native counterpart's `value` would read. */
export const selectedValue = (combobox: HTMLElement): string | null => combobox.getAttribute('data-value');

/** Opens a shared Select and clicks the option holding `value`, like choosing it in a native select. */
export function chooseValue(combobox: HTMLElement, value: string | number): void {
  if (combobox.getAttribute('aria-expanded') !== 'true') fireEvent.click(combobox);
  const list = document.getElementById(combobox.getAttribute('aria-controls') ?? '');
  const option = [...(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])].find(node => node.dataset.value === String(value));
  if (!option) throw new Error(`No option with value ${String(value)} in ${combobox.getAttribute('aria-label') ?? 'select'}`);
  fireEvent.click(option);
}

/** Opens a shared Select so its options are in the document; returns the combobox. */
export function openSelect(combobox: HTMLElement): HTMLElement {
  if (combobox.getAttribute('aria-expanded') !== 'true') fireEvent.click(combobox);
  return combobox;
}
