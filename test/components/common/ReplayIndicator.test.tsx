import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReplayIndicator } from '../../../src/components/common/ReplayIndicator.js';

describe('ReplayIndicator', () => {
  it('renders nothing or dash when replay is not provided', () => {
    const { container, rerender } = render(<ReplayIndicator replay={null} />);
    expect(screen.getByText('-')).toBeInTheDocument();

    rerender(<ReplayIndicator replay={null} hideIfEmpty />);
    expect(container.firstChild).toBeNull();
  });

  it('renders default replay icon and green styling, unaltered when raining', () => {
    const wetReplay = {
      name: 'Spa_Race_Replay.Vcr',
      hasRain: true,
      weatherCondition: 'Wet' as const,
      maxRainIntensity: 18,
    };

    const { container } = render(<ReplayIndicator replay={wetReplay} />);

    const indicator = screen.getByTitle('Replay VCR: Spa_Race_Replay.Vcr');
    expect(indicator).toBeInTheDocument();
    // Styling should remain standard green and not blue
    expect(indicator.className).toContain('text-lmu-green');
    expect(indicator.className).not.toContain('text-blue');
    expect(indicator.className).not.toContain('bg-blue');

    // Should only have the video icon SVG, no rain cloud icon
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].classList.contains('lucide-video')).toBe(true);
  });

  it('renders 100Hz duckdb icon and amber styling, unaltered when raining', () => {
    const wetDuckDbReplay = {
      name: 'Monza_Practice.Vcr',
      hasDuckDbTelemetry: true,
      hasRain: true,
      weatherCondition: 'Wet' as const,
      maxRainIntensity: 25,
    };

    const { container } = render(<ReplayIndicator replay={wetDuckDbReplay} />);

    const indicator = screen.getByTitle('⚡ 100Hz DuckDB Telemetry & Replay: Monza_Practice.Vcr');
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain('text-lmu-warn-soft');
    expect(indicator.className).not.toContain('text-blue');

    // Check for zap icon
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].classList.contains('lucide-zap')).toBe(true);
  });

  it('renders interactive button and handles onClick unaltered by rain', () => {
    const onClick = vi.fn();
    const wetReplay = {
      name: 'LeMans_Quali.Vcr',
      hasRain: true,
      weatherCondition: 'Dynamic Weather' as const,
    };

    const { container } = render(<ReplayIndicator replay={wetReplay} onClick={onClick} />);

    const button = screen.getByRole('button', { name: /Open replay telemetry/i });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('hover:bg-lmu-green/20');
    expect(button.className).not.toContain('hover:bg-blue');

    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].classList.contains('lucide-video')).toBe(true);

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
