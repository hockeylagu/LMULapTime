import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearCachedVehicleLogos, setCachedVehicleLogos } from '../../../../src/api/vehicles/vehicleLogosApi.js';
import { RaceCarTooltip } from '../../../../src/components/replay/race/RaceCarTooltip.js';
import { RaceStandingsTower } from '../../../../src/components/replay/race/RaceStandingsTower.js';
import { createRaceClock } from '../../../../src/components/replay/race/raceClock.js';
import { indexRaceStandings } from '../../../../src/components/replay/race/raceStandings.js';

afterEach(() => { cleanup(); clearCachedVehicleLogos(); });

/** Two cars a lap: a Ferrari, and a car whose make is unknown. */
const index = indexRaceStandings({
  replayName: 'R1.Vcr', sessionType: 'Race', daylight: { raceStartMinute: null, cloudCover: null, cloudField: null, cloudVariants: null },
  startSec: 0, endSec: 200, windowSec: 60,
  cars: [{ slot: 1, name: 'Ann', carClass: 'GT3', carNumber: '51', carType: 'Ferrari 296 LMGT3' }, { slot: 2, name: 'Bea', carClass: 'GT3', carNumber: '8' }],
  laps: [1, 2].map(slot => ({ slot, lapNumber: 1, startSec: 0, endSec: 100 + slot, lapTimeSec: 100 + slot, isValid: true })),
  runningOrder: [{ timeSec: 0, order: [1, 2] }], events: [],
});

describe('race car logos', () => {
  it("draws the car's make logo before its number in the standings, keeping the space for a car without one", () => {
    setCachedVehicleLogos({ Ferrari: '<svg/>' });
    render(<RaceStandingsTower index={index} clock={createRaceClock(0, 200, 150)} followSlot={null} onFollow={() => {}} pittedAt={() => new Set()} onTrack={() => {}} onHover={() => {}} />);
    const [ferrari, other] = within(screen.getByTestId('race-standings')).getAllByRole('button');
    const logo = within(ferrari).getByTestId('car-logo');
    expect(logo).toHaveAttribute('alt', 'Ferrari logo');
    expect(logo.compareDocumentPosition(within(ferrari).getByText('#51')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(other).queryByTestId('car-logo')).toBeNull();
  });

  it("draws the logo in the car's tooltip", () => {
    setCachedVehicleLogos({ Ferrari: '<svg/>' });
    render(<RaceCarTooltip index={index} clock={createRaceClock(0, 200, 150)} slot={1} />);
    expect(within(screen.getByTestId('race-car-tooltip')).getByTestId('car-logo')).toHaveAttribute('alt', 'Ferrari logo');
  });
});
