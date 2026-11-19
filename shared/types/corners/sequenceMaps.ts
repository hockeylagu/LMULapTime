/** A layout and class's turn sequence map, as Settings lists it. */
export interface SequenceMapSummary {
  layoutKey: string;
  carClass: string;
  /** Laps it was built from (up to 10; it grows until then). */
  lapCount: number;
  sequenceCount: number;
  builtAt: number;
  /** The driver's own fastest laps against it: sequences checked, grouped the same, starting more than 10 m away. */
  ownCheck: { checked: number; same: number; startOff: number };
  /** Its last check against the class's fastest laps since, after new fast laps; null before the first. */
  check: { checkedAt: number; agrees: boolean; detail: string } | null;
}

export interface SequenceMapsResponse {
  maps: SequenceMapSummary[];
  /** The map being regenerated ("layoutKey|carClass"), null when none. */
  regenerating: string | null;
  /** The last regeneration, when it failed: its map ("layoutKey|carClass") and why; null after one that worked. */
  failed: { map: string; error: string } | null;
}
