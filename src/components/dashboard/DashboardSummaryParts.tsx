import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** The shared frame of the dashboard summary cards: a neutral title row, the body, and the show-all toggle. */
export const SummaryCard: React.FC<{
  icon: LucideIcon;
  iconClass?: string;
  title: string;
  action?: React.ReactNode;
  footer?: { expanded: boolean; showAllLabel: string; onToggle: () => void } | null;
  children: React.ReactNode;
}> = ({ icon: Icon, iconClass = 'text-lmu-muted', title, action, footer, children }) => (
  <div className="bg-lmu-card border border-lmu-border p-4 rounded-2xl flex flex-col h-full">
    <div className="flex items-center justify-between gap-2 h-6 mb-2">
      <p className="text-xs font-bold text-lmu-text-soft uppercase tracking-wider flex items-center gap-1.5">
        <Icon className={`w-4 h-4 ${iconClass}`} />
        <span>{title}</span>
      </p>
      {action}
    </div>
    <div className="flex-1 min-h-0">{children}</div>
    {footer && (
      <button
        type="button"
        onClick={footer.onToggle}
        className="w-full text-center text-[10px] text-lmu-muted hover:text-white font-semibold pt-2 mt-3 border-t border-lmu-border/60 transition-colors flex items-center justify-center gap-1"
      >
        <span>{footer.expanded ? 'Show Top 3 Only' : footer.showAllLabel}</span>
        <ChevronDown className={`w-3 h-3 transform transition-transform ${footer.expanded ? 'rotate-180' : ''}`} />
      </button>
    )}
  </div>
);

/** Laps / km switch: a quiet neutral segment, so it never outshouts the figures it changes. */
export const UnitToggle: React.FC<{ unit: 'laps' | 'km'; onChange: (unit: 'laps' | 'km') => void }> = ({ unit, onChange }) => (
  <div role="group" aria-label="Unit" className="flex items-center gap-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider">
    {([['laps', 'Laps'], ['km', 'Km']] as const).map(([u, label]) => (
      <button
        key={u}
        type="button"
        aria-pressed={unit === u}
        onClick={() => onChange(u)}
        className={`px-1.5 py-0.5 rounded transition-colors ${
          unit === u ? 'bg-lmu-raised text-lmu-text' : 'text-lmu-muted hover:text-lmu-text-soft'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

/** Headline figure of every summary card, on the hero's best-lap scale so the row reads as one set of numbers. */
export const LEADER_VALUE = 'text-[28px] leading-8 font-mono font-extrabold text-white tabular-nums';

/** Share of the whole a leader holds, as the line under its name. */
export const shareOf = (value: number, total: number, noun: string): string | undefined =>
  total > 0 ? `${Math.round((value / total) * 100)}% of your ${noun}` : undefined;

export interface RankedItem {
  key: string;
  name: string;
  detail?: string;
  value: string;
  unit?: string;
  /** Small colored mark after the value (a pace category), kept as a dot so the list stays calm. */
  marker?: { className: string; label: string };
  title?: string;
  onSelect?: () => void;
}

const Marker: React.FC<{ marker: RankedItem['marker'] }> = ({ marker }) =>
  marker ? (
    <span className={`inline-flex items-center gap-1 ${marker.className}`} title={marker.label}>
      <span className="block w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
      <span className="sr-only">{marker.label}</span>
    </span>
  ) : null;

/** The first item as a readable headline, the rest as quiet numbered rows. */
export const RankedList: React.FC<{ items: RankedItem[]; expanded: boolean; empty: string }> = ({ items, expanded, empty }) => {
  if (items.length === 0) return <p className="text-xs text-lmu-muted">{empty}</p>;
  const [leader, ...rest] = items;
  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={leader.onSelect}
        title={leader.title}
        data-testid="summary-leader"
        className={`rounded-lg -mx-1.5 px-1.5 py-1 ${leader.onSelect ? 'cursor-pointer hover:bg-lmu-cardHover transition-colors' : ''}`}
      >
        <div className="flex items-baseline gap-1.5 h-8 font-mono">
          <span className={leader.marker ? LEADER_VALUE.replace('text-white', leader.marker.className) : LEADER_VALUE}>{leader.value}</span>
          {leader.unit && <span className="text-xs text-lmu-muted">{leader.unit}</span>}
          {leader.marker && (
            <span className="text-xs font-sans font-semibold text-lmu-text-soft">{leader.marker.label}</span>
          )}
        </div>
        <div className="text-sm leading-5 font-semibold text-white truncate" title={leader.name}>{leader.name}</div>
        <div className="text-[11px] leading-4 text-lmu-muted truncate">{leader.detail ?? ' '}</div>
      </div>
      {rest.length > 0 && (
        <div className={`border-t border-lmu-border/60 pt-1.5 space-y-0.5 ${expanded ? 'max-h-48 overflow-y-auto overflow-x-hidden custom-scrollbar pr-0.5' : ''}`}>
          {rest.map((item, i) => (
            <div
              key={item.key}
              onClick={item.onSelect}
              title={item.title}
              className={`flex items-center justify-between gap-2 text-xs rounded-md px-1.5 py-1 ${expanded ? '' : '-mx-1.5'} ${
                item.onSelect ? 'cursor-pointer hover:bg-lmu-cardHover transition-colors' : ''
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-4 shrink-0 font-mono text-[11px] text-lmu-faint">{i + 2}</span>
                <span className="text-lmu-text-soft truncate" title={item.name}>{item.name}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
                <Marker marker={item.marker} />
                <span className="text-lmu-text-soft tabular-nums">{item.value}</span>
                {item.unit && <span className="text-lmu-muted">{item.unit}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
