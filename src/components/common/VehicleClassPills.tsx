import React from 'react';
import { VEHICLE_CLASS_OPTIONS } from '../../utils/paceCategory';

export interface VehicleClassPillsProps {
  selectedClass: string;
  onSelectClass: (classId: string) => void;
  className?: string;
  size?: 'xs' | 'sm';
}

export const VehicleClassPills: React.FC<VehicleClassPillsProps> = ({
  selectedClass,
  onSelectClass,
  className = '',
  size = 'sm',
}) => {
  const padClass = size === 'xs' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs';

  return (
    <div className={`flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border font-semibold overflow-x-auto ${className}`}>
      {VEHICLE_CLASS_OPTIONS.map((cls) => {
        const isSelected = selectedClass === cls.id;
        return (
          <button
            key={cls.id}
            type="button"
            onClick={() => onSelectClass(cls.id)}
            className={`${padClass} rounded-lg transition-all whitespace-nowrap ${
              isSelected
                ? 'bg-lmu-accent text-white shadow-sm font-bold'
                : 'text-lmu-muted hover:text-white'
            }`}
          >
            {cls.label}
          </button>
        );
      })}
    </div>
  );
};
