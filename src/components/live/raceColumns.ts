// One column layout for every race row (plan, current vs best, last lap, damage), so their labels and values line up.
export const RACE_ROW = 'grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] px-9';
export const RACE_LEAD = 'min-w-0 pr-[34px]';
/** A column after the lead; the plan and the delta row draw the rule, the other rows keep its width unseen. */
export const RACE_COLUMN = 'min-w-0 border-l pl-[34px]';
export const RULED = 'border-lmu-rule';
export const UNRULED = 'border-transparent';
