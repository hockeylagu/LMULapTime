import React from 'react';

export const SESSION_TYPE_OPTIONS = ['All', 'Practice', 'Qualifying', 'Race'] as const;
export type SessionTypeOption = typeof SESSION_TYPE_OPTIONS[number];

export interface SessionTypePillsProps {
  selectedType: string;
  onSelectType: (type: string) => void;
  options?: readonly string[];
  className?: string;
}

export const SessionTypePills: React.FC<SessionTypePillsProps> = ({
  selectedType,
  onSelectType,
  options = SESSION_TYPE_OPTIONS,
  className = '',
}) => {
  return (
    <div className={`flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-medium ${className}`}>
      {options.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onSelectType(type)}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            selectedType === type
              ? 'bg-lmu-accent text-white shadow-sm font-bold'
              : 'text-lmu-muted hover:text-white'
          }`}
        >
          {type}
        </button>
      ))}
    </div>
  );
};
