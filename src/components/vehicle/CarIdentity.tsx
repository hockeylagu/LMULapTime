import React from 'react';
import { Car } from 'lucide-react';
import { CarLogo } from './CarLogo.js';
import { CarClassBadge } from '../common/CarClassBadge.js';

export interface CarIdentityProps {
  carType?: string | null;
  /** Omit to show the logo and name only. */
  carClass?: string | null;
  /** Colour and size of the name, the one thing that differs between views. */
  nameClassName?: string;
  className?: string;
  /** Shown when the car is unknown; without it nothing renders. */
  emptyLabel?: string;
  /** A generic car icon when the brand has no logo. */
  fallbackIcon?: boolean;
  /** Let a long name wrap instead of truncating. */
  wrap?: boolean;
}

/** A car's brand logo, name and class badge on one row: the same spacing, tooltip and accessible name everywhere. */
export const CarIdentity: React.FC<CarIdentityProps> = ({
  carType,
  carClass,
  nameClassName = '',
  className = '',
  emptyLabel,
  fallbackIcon = false,
  wrap = false,
}) => {
  if (!carType && emptyLabel === undefined) return null;
  return (
    <span className={`flex items-center gap-1.5 min-w-0 ${className}`} title={carType || undefined}>
      <CarLogo
        carType={carType}
        size="xs"
        decorative
        fallback={fallbackIcon ? <Car aria-hidden="true" className="w-3.5 h-3.5 text-lmu-muted shrink-0" /> : undefined}
      />
      <span className={`${wrap ? 'break-words min-w-0' : 'truncate'} ${nameClassName}`} dir="auto">{carType || emptyLabel}</span>
      {carClass && <CarClassBadge carClass={carClass} carType={carType} size="xs" />}
    </span>
  );
};
