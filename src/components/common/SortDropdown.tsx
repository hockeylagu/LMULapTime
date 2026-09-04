import React from 'react';
import { ArrowUpDown } from 'lucide-react';

export interface SortOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SortDropdownProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SortOption<T>[];
  label?: string;
  className?: string;
}

export function SortDropdown<T extends string = string>({
  value,
  onChange,
  options,
  label = 'Sort:',
  className = '',
}: SortDropdownProps<T>): React.ReactElement {
  return (
    <div className={`flex items-center gap-1.5 bg-lmu-bg border border-lmu-border rounded-xl px-3 py-1.5 text-xs text-white shrink-0 ${className}`}>
      <ArrowUpDown className="w-3.5 h-3.5 text-lmu-accent" />
      {label && <span className="text-lmu-muted font-medium">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-lmu-card text-white">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
