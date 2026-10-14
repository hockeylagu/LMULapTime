import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Select } from './Select.js';

export interface SortOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SortDropdownProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SortOption<T>[];
  label?: string;
  className?: string;
}

/** The list order control of the dashboard, Tracks and track-session filter rows, at their 36px height. */
export function SortDropdown<T extends string = string>({
  value,
  onChange,
  options,
  label = 'Sort:',
  className = '',
}: SortDropdownProps<T>): React.ReactElement {
  return (
    <Select
      aria-label={label || 'Sort'}
      value={value}
      onChange={onChange}
      options={options}
      icon={<ArrowUpDown aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-lmu-muted" />}
      caption={label || undefined}
      size="filter"
      className={`shrink-0 ${className}`}
    />
  );
}
