import { describe, it, expect } from 'vitest';
import { resolveTrackLayoutKey } from '../../src/components/replay/map/useTrackBoundaryGeometry.js';
import {
  projectBoundaryPoints,
  buildRoadRibbonSvgPath,
  buildClosedSvgPath,
  computeEffectiveBounds,
} from '../../src/components/replay/map/replayMapUtils.js';

describe('useTrackBoundaryGeometry and layout resolution', () => {
  it('correctly disambiguates circuit layout variants', () => {
    // Monza variants
    expect(resolveTrackLayoutKey('Autodromo Nazionale Monza', 'Autodromo Nazionale Monza')).toBe('monza_gp');
    expect(resolveTrackLayoutKey('Autodromo Nazionale Monza', 'Monza Curva Grande Circuit')).toBe('monza_curvagrande');

    // Bahrain variants
    expect(resolveTrackLayoutKey('Bahrain International Circuit', 'Bahrain International Circuit')).toBe('bahrain_wec');
    expect(resolveTrackLayoutKey('Bahrain International Circuit', 'Bahrain Outer Circuit')).toBe('bahrain_outer');
    expect(resolveTrackLayoutKey('Bahrain International Circuit', 'Bahrain Paddock Circuit')).toBe('bahrain_paddock');

    // Fuji variants
    expect(resolveTrackLayoutKey('Fuji Speedway', 'Fuji Speedway')).toBe('fuji_chicane');
    expect(resolveTrackLayoutKey('Fuji Speedway', 'Fuji Speedway Classic')).toBe('fuji_classic');

    // Sebring variants
    expect(resolveTrackLayoutKey('Sebring International Raceway', 'Sebring International Raceway')).toBe('sebring_full');
    expect(resolveTrackLayoutKey('Sebring International Raceway', 'Sebring School Circuit')).toBe('sebring_school');

    // Other tracks
    expect(resolveTrackLayoutKey('Circuit de Spa-Francorchamps', 'Circuit de Spa-Francorchamps')).toBe('spa_gp');
    expect(resolveTrackLayoutKey('Circuit de la Sarthe', 'Circuit de la Sarthe')).toBe('sarthe_full');
    expect(resolveTrackLayoutKey('Algarve International Circuit', 'Algarve International Circuit')).toBe('portimao_wec');
    expect(resolveTrackLayoutKey('WeatherTech Raceway Laguna Seca', 'WeatherTech Raceway Laguna Seca')).toBe('laguna_seca');
    expect(resolveTrackLayoutKey('Paul Ricard Circuit', 'Paul Ricard - 1A-V2-Short')).toBe('paul_ricard_1a_v2_short');
  });

  it('respects explicit layoutKey if provided', () => {
    expect(resolveTrackLayoutKey('Some Venue', 'Some Course', null, 'custom_layout')).toBe('custom_layout');
  });

  it('handles empty or null parameters gracefully', () => {
    expect(resolveTrackLayoutKey(null, null, null)).toBeNull();
    expect(resolveTrackLayoutKey('', '', '')).toBeNull();
  });
});

describe('track boundary projection and SVG helpers', () => {
  const mockBounds = { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 };

  it('projects boundary coordinates accurately into SVG space', () => {
    const pts: Array<[number, number]> = [
      [0, 0],
      [50, 50],
      [100, 100],
    ];
    const projected = projectBoundaryPoints(pts, mockBounds, 800, 60);
    expect(projected.length).toBe(3);
    expect(projected[0].sx).toBe(60);
    expect(projected[0].sy).toBe(740); // viewBoxSize - (offsetZ + 0)
    expect(projected[1].sx).toBe(400);
    expect(projected[1].sy).toBe(400);
    expect(projected[2].sx).toBe(740);
    expect(projected[2].sy).toBe(60);
  });

  it('builds closed SVG path for road polygon ribbon', () => {
    const left = [
      { sx: 100, sy: 100 },
      { sx: 200, sy: 100 },
    ];
    const right = [
      { sx: 100, sy: 120 },
      { sx: 200, sy: 120 },
    ];
    const ribbonD = buildRoadRibbonSvgPath(left, right);
    expect(ribbonD).toBe('M 100.0 100.0 L 200.0 100.0 L 200.0 120.0 L 100.0 120.0 Z');
  });

  it('builds closed SVG path for boundary edge limits', () => {
    const pts = [
      { sx: 100, sy: 100 },
      { sx: 200, sy: 100 },
      { sx: 200, sy: 200 },
    ];
    const d = buildClosedSvgPath(pts);
    expect(d).toBe('M 100.0 100.0 L 200.0 100.0 L 200.0 200.0 Z');
  });

  it('computes unified effective bounds merging telemetry and track geometry', () => {
    const telemetryBounds = { minX: 10, maxX: 90, minZ: 10, maxZ: 90, spanX: 80, spanZ: 80 };
    const trackBounds = { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 };

    const effective = computeEffectiveBounds(telemetryBounds, trackBounds);
    expect(effective.minX).toBe(0);
    expect(effective.maxX).toBe(100);
    expect(effective.minZ).toBe(0);
    expect(effective.maxZ).toBe(100);
    expect(effective.spanX).toBe(100);
    expect(effective.spanZ).toBe(100);
  });
});
