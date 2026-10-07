import React, { useMemo } from 'react';
import { useVehicleLogos } from './useVehicleLogos.js';

export type CarLogoSize = 'xs' | 'sm' | 'md' | 'lg';

export interface CarLogoProps {
  carType?: string | null;
  carModel?: string | null;
  size?: CarLogoSize;
  className?: string;
  title?: string;
  fallback?: React.ReactNode;
  /** The car name is shown next to it: no alt text or tooltip, so the brand is not announced twice. */
  decorative?: boolean;
}

const SIZE_CLASSES: Record<CarLogoSize, string> = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
};

export const CarLogo: React.FC<CarLogoProps> = ({
  carType,
  carModel,
  size = 'sm',
  className = '',
  title,
  fallback,
  decorative = false,
}) => {
  const target = carType || carModel;
  const { getLogoSvg } = useVehicleLogos();
  const match = getLogoSvg(target);

  const dataUri = useMemo(() => {
    if (!match?.svg) return null;
    return `data:image/svg+xml;utf8,${encodeURIComponent(match.svg)}`;
  }, [match?.svg]);

  if (!match || !dataUri) {
    return fallback ? <>{fallback}</> : null;
  }

  const tooltip = title || match.brand;
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.sm;

  return (
    <img
      src={dataUri}
      alt={decorative ? '' : `${match.brand} logo`}
      title={decorative ? undefined : tooltip}
      aria-hidden={decorative ? 'true' : undefined}
      data-testid="car-logo"
      className={`inline-block object-contain shrink-0 select-none ${sizeClass} ${className}`}
    />
  );
};
