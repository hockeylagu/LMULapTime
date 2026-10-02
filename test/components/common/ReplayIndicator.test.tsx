import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionDataContext } from '../../../src/api/sessionDataContext.js';
import type { ScanStatus } from '../../../shared/types/index.js';
import { ReplayIndicator } from '../../../src/components/common/ReplayIndicator.js';
import { ReplayLaunchButton } from '../../../src/components/common/ReplayLaunchButton.js';

describe('ReplayIndicator', () => {
  it('shows queued, processing and failure states without launching an unfinished replay', () => {
    const onClick = vi.fn();
    const display = (status: 'queued' | 'processing' | 'ready' | 'failed') => (
      <SessionDataContext.Provider value={{ revision: 0, scan: { running: false, replayJobs: [{ name: 'x.Vcr', status }] } as ScanStatus }}>
        <ReplayIndicator replay={{ name: 'x.Vcr' }} onClick={onClick} />
      </SessionDataContext.Provider>
    );
    const { rerender } = render(display('queued'));
    expect(screen.getByRole('status', { name: 'Replay queued' })).toBeInTheDocument();
    rerender(display('processing'));
    const spinner = screen.getByRole('status', { name: 'Replay processing' });
    expect(spinner.querySelector('svg')).toHaveClass('animate-spin', 'motion-reduce:animate-none');
    fireEvent.click(spinner); expect(onClick).not.toHaveBeenCalled();
    rerender(display('failed')); expect(screen.getByRole('status', { name: /Refresh to retry/ })).toBeInTheDocument();
    rerender(display('ready')); fireEvent.click(screen.getByRole('button', { name: 'Open replay telemetry' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
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
    expect(indicator.className).toContain('text-lmu-gain');
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
    expect(button.className).toContain('hover:bg-lmu-gain/20');
    expect(button.className).not.toContain('hover:bg-blue');

    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].classList.contains('lucide-video')).toBe(true);

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a playable partial replay open and reports missing driver data', () => {
    const onClick = vi.fn();
    render(
      <SessionDataContext.Provider value={{ revision: 0, scan: { running: false, replayJobs: [{ name: 'partial.Vcr', status: 'failed', playable: true, error: 'secondary driver failed' }] } as ScanStatus }}>
        <ReplayIndicator replay={{ name: 'partial.Vcr' }} onClick={onClick} />
      </SessionDataContext.Provider>
    );
    const button = screen.getByRole('button', { name: /some replay drivers are unavailable/i });
    expect(button).toHaveAttribute('title', expect.stringContaining('secondary driver failed'));
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('blocks an unusable failed replay but allows DuckDB fallback with a warning', () => {
    const display = (hasDuckDb: boolean) => (
      <SessionDataContext.Provider value={{ revision: 0, scan: { running: false, replayJobs: [{ name: 'failed.Vcr', status: 'failed', playable: false, error: 'primary decode failed' }] } as ScanStatus }}>
        <ReplayIndicator replay={{ name: 'failed.Vcr', hasDuckDbTelemetry: hasDuckDb }} onClick={vi.fn()} />
      </SessionDataContext.Provider>
    );
    const { rerender } = render(display(false));
    expect(screen.getByRole('status', { name: /Replay processing failed/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open replay/ })).not.toBeInTheDocument();
    rerender(display(true));
    expect(screen.getByRole('button', { name: /DuckDB telemetry is available/i })).toBeInTheDocument();
  });

  it('keeps launch enabled for cached player data or DuckDB after a secondary failure', () => {
    const onClick = vi.fn();
    const button = (playable: boolean, hasDuckDb: boolean) => (
      <SessionDataContext.Provider value={{ revision: 0, scan: { running: false, replayJobs: [{ name: 'partial.Vcr', status: 'failed', playable, error: 'secondary driver failed' }] } as ScanStatus }}>
        <ReplayLaunchButton replayName="partial.Vcr" hasDuckDb={hasDuckDb} onClick={onClick} />
      </SessionDataContext.Provider>
    );
    const { rerender } = render(button(true, false));
    expect(screen.getByRole('button', { name: /Launch Replay/ })).toBeEnabled();
    expect(screen.getByText('Some replay drivers are unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Launch Replay/ }));
    expect(onClick).toHaveBeenCalledOnce();

    rerender(button(false, true));
    expect(screen.getByRole('button', { name: /Launch 100Hz Replay/ })).toBeEnabled();
    expect(screen.getByText('Replay cache unavailable; using 100Hz telemetry')).toBeInTheDocument();
    rerender(button(false, false));
    expect(screen.getByRole('button', { name: /Replay failed/ })).toBeDisabled();
  });
});
