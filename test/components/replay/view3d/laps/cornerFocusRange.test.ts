import { describe, expect, it } from 'vitest';
import { cornerFocusRange } from '../../../../../src/components/replay/view3d/laps/useCornerFocus.js';
import type { CornerSegmentComparison } from '../../../../../src/utils/cornerAnalysis/types.js';

const corner = (entryDistM: number, primaryBrakingDistM: number | null, minDistM: number, exitDistM: number) =>
  ({entryDistM, primaryBrakingDistM, minDistM, exitDistM}) as CornerSegmentComparison;

describe('cornerFocusRange', () => {
  it('starts just before the brake point and ends as far past the slowest point, leaving out the straights', () => {
    // A 400 m straight before the corner and 500 m after it.
    expect(cornerFocusRange(corner(1000, 1350, 1450, 1950))).toEqual({startDistM: 1320, apexDistM: 1450, endDistM: 1580});
  });

  it('keeps within the segment, and starts at the entry of a corner taken flat', () => {
    expect(cornerFocusRange(corner(1000, 1010, 1100, 1150))).toEqual({startDistM: 1000, apexDistM: 1100, endDistM: 1150});
    expect(cornerFocusRange(corner(1000, null, 1100, 1400))).toEqual({startDistM: 1000, apexDistM: 1100, endDistM: 1200});
  });
});
