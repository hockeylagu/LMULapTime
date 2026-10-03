import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackSurfaceProfiles } from '../../../src/components/track-detail/TrackSurfaceProfiles.js';
import type { TrackSurfaceProfile } from '../../../shared/types/trackGeometry.js';

describe('TrackSurfaceProfiles', () => {
  it('shows unit-labeled local height, grade and bank while splitting paths across unknown gaps', () => {
    const profile: TrackSurfaceProfile = {
      stationM: [0, 100, 200, 300],
      leftWidthM: [6, 6, 6, 6],
      rightWidthM: [6, 6, 6, 6],
      elevationM: [10, 12, null, 14],
      gradePct: [1, 2, null, -1],
      bankDeg: [0.5, 1, null, -0.5],
      leftElevationM: [10, 12, null, 14],
      rightElevationM: [10, 12, null, 14],
      leftKerbWidthM: [null, null, null, null],
      rightKerbWidthM: [null, null, null, null],
      leftKerbHeightM: [null, null, null, null],
      rightKerbHeightM: [null, null, null, null],
    };

    render(<TrackSurfaceProfiles profile={profile} lengthM={300} />);

    expect(screen.getByRole('region', { name: 'Native road elevation and slope profiles' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Elevation · local Y profile, m' })).toBeInTheDocument();
    expect(screen.getByText('Grade')).toBeInTheDocument();
    expect(screen.getByText('Bank')).toBeInTheDocument();
    const elevationRow = screen.getByText('Elevation · local Y').closest('[data-profile-row]');
    expect(elevationRow?.querySelectorAll('svg > path:not([d="M0 30 H300"])')).toHaveLength(2);
    expect(elevationRow).toHaveTextContent('10.0 to 14.0 m');
    expect(screen.getByText('Station 300 m')).toBeInTheDocument();
  });

  it('does not invent a profile or a zero baseline when source data is absent', () => {
    const { container } = render(<TrackSurfaceProfiles lengthM={1000} />);
    expect(container.firstChild).toBeNull();
  });
});
