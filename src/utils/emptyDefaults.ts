/** Stable empty values for default props: a fresh `[]` or `{}` each render would defeat memoization. */
export const EMPTY_ARRAY: readonly never[] = [];
export const EMPTY_RECORD: Readonly<Record<string, never>> = {};
