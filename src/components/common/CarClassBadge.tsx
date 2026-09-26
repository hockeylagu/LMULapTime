import React from 'react';

export type CarClassBadgeType = 'HY' | 'LMP2' | 'LMP3' | 'GT3' | 'GTE' | 'OTHER';

export interface CarClassBadgeConfig {
  badgeType: CarClassBadgeType;
  label: string;
  borderClass: string;
  textClass: string;
  bgClass: string;
  hasOrangeCorner: boolean;
  title: string;
}

export function getCarClassBadgeConfig(
  carClass?: string | null,
  carType?: string | null,
  category?: string | null,
  isElmsOverride?: boolean,
  hasOrangeCornerOverride?: boolean
): CarClassBadgeConfig | null {
  if (!carClass && !carType && !category) return null;

  const raw = `${carClass || ''} ${carType || ''} ${category || ''}`.trim();
  const lower = raw.toLowerCase();

  const isElms =
    isElmsOverride ??
    (/elms|lmp2_elms|gt3_elms/.test(lower) ||
      (typeof category === 'string' && /elms/i.test(category)));

  // 1. Hypercar (HY) - Red
  if (/hyper|lmh|lmdh|\bhy\b/.test(lower)) {
    return {
      badgeType: 'HY',
      label: 'HY',
      borderClass: 'border-red-500/90',
      textClass: 'text-red-400',
      bgClass: 'bg-red-950/40',
      hasOrangeCorner: false,
      title: 'Hypercar (HY)',
    };
  }

  // 2. LMP2 - Blue (WEC: plain blue, ELMS: blue with orange corner)
  if (lower.includes('lmp2')) {
    const hasCorner = hasOrangeCornerOverride ?? isElms;
    return {
      badgeType: 'LMP2',
      label: 'LMP2',
      borderClass: 'border-sky-500/90',
      textClass: 'text-sky-400',
      bgClass: 'bg-sky-950/40',
      hasOrangeCorner: hasCorner,
      title: hasCorner ? 'LMP2 (ELMS)' : 'LMP2 (WEC)',
    };
  }

  // 3. LMP3 - Purple
  if (lower.includes('lmp3')) {
    return {
      badgeType: 'LMP3',
      label: 'LMP3',
      borderClass: 'border-purple-500/90',
      textClass: 'text-purple-400',
      bgClass: 'bg-purple-950/40',
      hasOrangeCorner: false,
      title: 'LMP3',
    };
  }

  // 4. GT3 / LMGT3 - Green (WEC: plain green, ELMS / orange corner: green with orange corner)
  if (/gt3|lmgt3/.test(lower)) {
    const hasCorner =
      hasOrangeCornerOverride ??
      (isElms ||
        lower.includes('orange') ||
        (typeof carClass === 'string' && /orange/i.test(carClass)));
    return {
      badgeType: 'GT3',
      label: 'GT3',
      borderClass: 'border-emerald-500/90',
      textClass: 'text-emerald-400',
      bgClass: 'bg-emerald-950/40',
      hasOrangeCorner: hasCorner,
      title: hasCorner ? 'GT3 (ELMS)' : 'GT3 (WEC)',
    };
  }

  // 5. GTE - Orange
  if (lower.includes('gte')) {
    return {
      badgeType: 'GTE',
      label: 'GTE',
      borderClass: 'border-amber-500/90',
      textClass: 'text-amber-400',
      bgClass: 'bg-amber-950/40',
      hasOrangeCorner: false,
      title: 'GTE',
    };
  }

  // Fallback for custom or unknown classes
  const fallbackLabel = (carClass || carType || '').toUpperCase().slice(0, 5);
  return {
    badgeType: 'OTHER',
    label: fallbackLabel,
    borderClass: 'border-slate-700',
    textClass: 'text-slate-300',
    bgClass: 'bg-slate-900/60',
    hasOrangeCorner: false,
    title: carClass || carType || '',
  };
}

export interface CarClassBadgeProps {
  carClass?: string | null;
  carType?: string | null;
  category?: string | null;
  isElms?: boolean;
  hasOrangeCorner?: boolean;
  size?: 'xs' | 'sm' | 'md';
  ariaHidden?: boolean;
  'aria-hidden'?: boolean | 'true' | 'false';
  ariaLabel?: string;
  'aria-label'?: string;
  className?: string;
  title?: string;
  selected?: boolean;
  selectable?: boolean;
  onClick?: () => void;
}

export const CarClassBadge: React.FC<CarClassBadgeProps> = ({
  carClass,
  carType,
  category,
  isElms,
  hasOrangeCorner,
  size = 'sm',
  ariaHidden,
  'aria-hidden': ariaHiddenProp,
  ariaLabel,
  'aria-label': ariaLabelProp,
  className = '',
  title,
  selected,
  selectable,
  onClick,
}) => {
  const config = getCarClassBadgeConfig(carClass, carType, category, isElms, hasOrangeCorner);
  if (!config) return null;

  const isHidden = ariaHidden || ariaHiddenProp === true || ariaHiddenProp === 'true';
  const isButton = typeof onClick === 'function' || selectable;
  const effectiveAriaLabel = ariaLabel || ariaLabelProp || title || config.title;

  const sizeClasses = isButton
    ? size === 'xs'
      ? config.hasOrangeCorner
        ? 'h-[20px] text-[11px] pl-2.5 pr-3.5'
        : 'h-[20px] text-[11px] px-2.5'
      : size === 'md'
      ? config.hasOrangeCorner
        ? 'h-[28px] text-xs pl-4 pr-5'
        : 'h-[28px] text-xs px-4'
      : config.hasOrangeCorner
      ? 'h-[24px] text-xs pl-3 pr-4'
      : 'h-[24px] text-xs px-3.5'
    : size === 'xs'
    ? config.hasOrangeCorner
      ? 'text-[10px] pl-2 pr-3 py-0.5'
      : 'text-[10px] px-2 py-0.5'
    : size === 'md'
    ? config.hasOrangeCorner
      ? 'text-xs pl-3 pr-4 py-1'
      : 'text-xs px-3 py-1'
    : config.hasOrangeCorner
    ? 'text-[11px] pl-2.5 pr-3.5 py-0.5'
    : 'text-[11px] px-2.5 py-0.5';

  const interactiveClasses = isButton
    ? `cursor-pointer focus:outline-none transition-opacity ${
        selected === true
          ? 'brightness-110 opacity-100 z-10'
          : selected === false
          ? 'opacity-40 hover:opacity-100'
          : 'hover:brightness-110'
      }`
    : '';

  const badgeContent = (
    <>
      <span className="relative z-0 tracking-wider">{config.label}</span>
      {config.hasOrangeCorner && (
        <svg
          data-testid="badge-orange-corner"
          className="absolute top-0 right-0 w-2.5 h-2.5 pointer-events-none z-10"
          viewBox="0 0 10 10"
          aria-hidden="true"
        >
          <polygon points="0,0 10,0 10,10" className="fill-amber-500" />
        </svg>
      )}
    </>
  );

  const sharedClasses = `relative inline-flex items-center justify-center font-mono font-bold uppercase rounded-[5px] border overflow-hidden select-none shrink-0 leading-none box-border ${config.borderClass} ${config.textClass} ${config.bgClass} ${sizeClasses} ${interactiveClasses} ${className}`;

  if (isButton) {
    return (
      <button
        type="button"
        data-testid="car-class-badge"
        onClick={onClick}
        aria-label={effectiveAriaLabel}
        title={title || config.title}
        className={sharedClasses}
      >
        {badgeContent}
      </button>
    );
  }

  return (
    <span
      data-testid="car-class-badge"
      aria-hidden={isHidden ? 'true' : undefined}
      className={sharedClasses}
      title={title || config.title}
    >
      {badgeContent}
    </span>
  );
};

