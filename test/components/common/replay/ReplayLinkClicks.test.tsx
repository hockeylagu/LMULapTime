import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionDataContext } from '../../../../src/api/sessionDataContext.js';
import type { ScanStatus } from '../../../../shared/types/index.js';
import { ReplayIndicator } from '../../../../src/components/common/replay/ReplayIndicator.js';
import { ReplayLaunchButton } from '../../../../src/components/common/replay/ReplayLaunchButton.js';

/** jsdom cannot open a new tab: swallow the browser default after React has seen the click. */
function modifierClick(el: HTMLElement, init: { ctrlKey?: boolean; metaKey?: boolean }): void {
  el.addEventListener('click', e => e.preventDefault(), { once: true });
  fireEvent.click(el, init);
}

const scanWith = (status: 'queued' | 'processing' | 'failed'): ScanStatus =>
  ({ running: false, sessionReplayJobs: [{ sessionId: 'session-1', status }] }) as ScanStatus;

describe('ReplayLaunchButton link clicks', () => {
  it('runs onClick once on a plain click and cancels the Link navigation', () => {
    const onClick = vi.fn();
    render(<ReplayLaunchButton hasDuckDb={false} sessionId="session-1" to="/telemetry?sessionId=example&driverOrdinal=0&lapOrdinal=0" onClick={onClick} data-testid="launch" />);
    const link = screen.getByTestId('launch');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/telemetry?sessionId=example&driverOrdinal=0&lapOrdinal=0');
    const notCancelled = fireEvent.click(link);
    expect(notCancelled).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(window.location.hash).not.toContain('telemetry');
  });

  it('leaves ctrl and meta clicks to the browser without calling onClick', () => {
    const onClick = vi.fn();
    render(<ReplayLaunchButton hasDuckDb sessionId="session-1" to="/telemetry" onClick={onClick} data-testid="launch" />);
    modifierClick(screen.getByTestId('launch'), { ctrlKey: true });
    modifierClick(screen.getByTestId('launch'), { metaKey: true });
    expect(onClick).not.toHaveBeenCalled();
    expect(window.location.hash).not.toContain('telemetry');
  });

  it('renders a disabled button, not a link, while the replay is blocked', () => {
    const onClick = vi.fn();
    render(
      <SessionDataContext.Provider value={{ revision: 0, scan: scanWith('queued') }}>
        <ReplayLaunchButton hasDuckDb={false} sessionId="session-1" to="/telemetry" onClick={onClick} data-testid="launch" />
      </SessionDataContext.Provider>
    );
    const button = screen.getByTestId('launch');
    expect(button.tagName).toBe('BUTTON');
    expect(button).toBeDisabled();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ReplayIndicator link clicks', () => {
  const renderLink = (onClick: () => void, onParentClick: () => void) => render(
    <div onClick={onParentClick}>
      <ReplayIndicator sessionId="session-1" hasReplay to="/telemetry?sessionId=example&driverOrdinal=0&lapOrdinal=0" onClick={onClick} />
    </div>
  );

  it('runs onClick once on a plain click without bubbling to the parent', () => {
    const onClick = vi.fn();
    const onParentClick = vi.fn();
    renderLink(onClick, onParentClick);
    const link = screen.getByRole('link', { name: 'Open replay telemetry' });
    expect(link).toHaveAttribute('href', '/telemetry?sessionId=example&driverOrdinal=0&lapOrdinal=0');
    expect(fireEvent.click(link)).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
    expect(window.location.hash).not.toContain('telemetry');
  });

  it('leaves ctrl-clicks to the browser: no onClick and no bubbling', () => {
    const onClick = vi.fn();
    const onParentClick = vi.fn();
    renderLink(onClick, onParentClick);
    const link = screen.getByRole('link', { name: 'Open replay telemetry' });
    modifierClick(link, { ctrlKey: true });
    modifierClick(link, { metaKey: true });
    expect(onClick).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
