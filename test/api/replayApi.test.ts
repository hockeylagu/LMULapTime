import { describe, expect, it } from 'vitest';
import { sessionTelemetryPath } from '../../src/api/replayApi.js';

describe('session telemetry API paths', () => {
  it('identifies a session and driver/lap ordinals without exposing recording identity', () => {
    expect(sessionTelemetryPath('session / 7', {
      driverOrdinal: 2,
      lapOrdinal: 5,
      resolutionQuery: 'pointSpacingM=2',
      source: 'vcr',
    })).toBe('/api/session/session%20%2F%207/telemetry?driverOrdinal=2&lapOrdinal=5&pointSpacingM=2&source=vcr');
  });
});
