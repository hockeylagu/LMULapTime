import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionDataContext } from '../../../../src/api/sessionDataContext.js';
import type { ScanStatus } from '../../../../shared/types/index.js';
import { ReplayIndicator } from '../../../../src/components/common/replay/ReplayIndicator.js';
import { ReplayLaunchButton } from '../../../../src/components/common/replay/ReplayLaunchButton.js';

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
  it('opens a replay left queued for a retry when its own laps are stored, and blocks it otherwise', () => {
    const onClick = vi.fn();
    const scan = (playable: boolean) => ({ running: false, replayJobs: [{ name: 'x.Vcr', status: 'queued', playable }] }) as ScanStatus;
    const { rerender } = render(
      <SessionDataContext.Provider value={{ revision: 0, scan: scan(true) }}>
        <ReplayIndicator replay={{ name: 'x.Vcr' }} onClick={onClick} />
        <ReplayLaunchButton replayName="x.Vcr" hasDuckDb={false} onClick={onClick} />
      </SessionDataContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open replay telemetry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(onClick).toHaveBeenCalledTimes(2);

    rerender(
      <SessionDataContext.Provider value={{ revision: 0, scan: scan(false) }}>
        <ReplayIndicator replay={{ name: 'x.Vcr' }} onClick={onClick} />
        <ReplayLaunchButton replayName="x.Vcr" hasDuckDb={false} onClick={onClick} />
      </SessionDataContext.Provider>
    );
    expect(screen.getByRole('status', { name: 'Replay queued' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Replay queued/ })).toBeDisabled();
  });
  it('shows a queued replay as queued even when the session has 100Hz telemetry', () => {
    const scan = { running: false, replayJobs: [{ name: 'x.Vcr', status: 'queued' }] } as ScanStatus;
    render(
      <SessionDataContext.Provider value={{ revision: 0, scan }}>
        <ReplayIndicator replay={{ name: 'x.Vcr', hasDuckDbTelemetry: true }} onClick={vi.fn()} />
        <ReplayLaunchButton replayName="x.Vcr" hasDuckDb onClick={vi.fn()} />
      </SessionDataContext.Provider>
    );
    expect(screen.getByRole('status', { name: 'Replay queued' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Replay queued/ })).toBeDisabled();
  });
  it('renders nothing or dash when replay is not provided', () => {
    const { container, rerender } = render(<ReplayIndicator replay={null} />);
    expect(screen.getByText('-')).toBeInTheDocument();

    rerender(<ReplayIndicator replay={null} hideIfEmpty />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the plain replay glyph on a neutral surface, unaltered when raining', () => {
    const wetReplay = {
      name: 'Spa_Race_Replay.Vcr',
      hasRain: true,
      weatherCondition: 'Wet' as const,
      maxRainIntensity: 18,
    };

    const { container } = render(<ReplayIndicator replay={wetReplay} />);

    const indicator = screen.getByTitle('Replay: Spa_Race_Replay.Vcr');
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain('text-lmu-text');

    // Only the replay glyph, no rain cloud icon
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('data-replay-glyph', 'replay');
    expect(svgs[0].getAttribute('class')).not.toContain('text-lmu-gain');
  });

  it('renders the green telemetry glyph when the session has DuckDB telemetry, unaltered when raining', () => {
    const wetDuckDbReplay = {
      name: 'Monza_Practice.Vcr',
      hasDuckDbTelemetry: true,
      hasRain: true,
      weatherCondition: 'Wet' as const,
      maxRainIntensity: 25,
    };

    const { container } = render(<ReplayIndicator replay={wetDuckDbReplay} />);

    expect(screen.getByTitle('Replay + telemetry: Monza_Practice.Vcr')).toBeInTheDocument();

    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('data-replay-glyph', 'telemetry');
    expect(svgs[0].getAttribute('class')).toContain('text-lmu-gain');
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
    expect(button.className).toContain('hover:bg-lmu-cardHover');

    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('data-replay-glyph', 'replay');

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
    // A partial failure keeps the normal button; what is missing goes in the tooltip
    expect(screen.getByRole('button', { name: 'Replay' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Replay' })).toHaveAttribute('title', expect.stringContaining('Some replay drivers are unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(onClick).toHaveBeenCalledOnce();

    rerender(button(false, true));
    expect(screen.getByRole('button', { name: 'Replay + telemetry' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Replay + telemetry' })).toHaveAttribute('title', expect.stringContaining('Replay cache unavailable; using 100Hz telemetry'));
    rerender(button(false, false));
    expect(screen.getByRole('button', { name: /Replay failed/ })).toBeDisabled();
  });
});
