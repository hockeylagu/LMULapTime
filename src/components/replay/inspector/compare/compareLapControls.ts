import type { WeatherCondition } from '../../../../../shared/types/index.js';
import type { CompareLapSort, SessionKind } from '../../../../../shared/domain/compareLapScope.js';

/** The picker's order and filters, sent to the server so every page is a slice of one ordered, filtered list. */
export interface CompareLapControls {
  sort: CompareLapSort;
  /** A car type, or 'all'. */
  carType: string;
  sessionKind: SessionKind | 'all';
  /** 'same' follows the inspected lap's condition. */
  condition: 'same' | 'all' | WeatherCondition;
}

export const DEFAULT_COMPARE_CONTROLS: CompareLapControls = { sort: 'lap', carType: 'all', sessionKind: 'all', condition: 'same' };
