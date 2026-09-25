import React from 'react';
import { VEHICLE_CLASS_OPTIONS } from '../../utils/paceCategory.js';
import { CarClassBadge } from './CarClassBadge.js';

export interface VehicleClassPillsProps {
  selectedClass: string;
  onSelectClass: (classId: string) => void;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

export const VehicleClassPills: React.FC<VehicleClassPillsProps> = ({
  selectedClass,
  onSelectClass,
  className = '',
  size = 'sm',
}) => {
  const isAllSelected = !selectedClass || selectedClass === 'All';
  const containerHeight = size === 'xs' ? 'h-8' : size === 'md' ? 'h-10' : 'h-9';
  const padAllClass =
    size === 'xs' ? 'h-[20px] px-2.5 text-[11px]' : size === 'md' ? 'h-[28px] px-4 text-xs' : 'h-[24px] px-3.5 text-xs';

  return (
    <div
      role="group"
      aria-label="Filter by vehicle class"
      className={`inline-flex items-center gap-1.5 bg-lmu-bg px-1.5 rounded-xl border border-lmu-border font-semibold shrink-0 box-border ${containerHeight} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSelectClass('All')}
        aria-label="All"
        title="All"
        className={`${padAllClass} inline-flex items-center justify-center font-mono leading-none rounded-[5px] border transition-opacity whitespace-nowrap font-bold uppercase select-none cursor-pointer tracking-wider box-border ${
          isAllSelected
            ? 'bg-lmu-accent text-white border-lmu-accent opacity-100'
            : 'border-slate-800 text-lmu-muted hover:text-white hover:border-slate-700 opacity-40 hover:opacity-100'
        }`}
      >
        ALL
      </button>

      {VEHICLE_CLASS_OPTIONS.filter((cls) => cls.id !== 'All').map((cls) => {
        const isSelected = selectedClass === cls.id;
        return (
          <CarClassBadge
            key={cls.id}
            carClass={cls.id}
            isElms={cls.id === 'LMP2elms'}
            hasOrangeCorner={cls.id === 'LMP2elms'}
            size={size}
            title={cls.label}
            aria-label={cls.label}
            selected={isSelected}
            onClick={() => onSelectClass(cls.id)}
          />
        );
      })}
    </div>
  );
};
