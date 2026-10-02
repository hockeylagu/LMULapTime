import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { Settings } from '../../../src/components/settings/index.js';
import { SETTINGS_SECTIONS } from '../../../src/components/settings/settingsSections.js';
import type { AppStatus } from '../../../shared/types/index.js';

const okStatus: AppStatus = {
  resultsDir: 'C:\\LMU\\Results',
  resultsExist: true,
  replaysDir: 'C:\\LMU\\Replays',
  replaysExist: true,
  telemetryDir: 'C:\\LMU\\Telemetry',
  telemetryExist: true,
  playerName: 'Player1',
  sessionsCount: 15,
  tracksCount: 5,
};

const toc = () => screen.getByRole('navigation', { name: /settings table of contents/i });
const sectionOrder = () => within(toc()).getAllByRole('button').map((b) => b.textContent);

describe('Settings navigation', () => {
  beforeEach(() => {
    window.location.hash = '#/settings';
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/scan') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: false }) });
      }
      if (url.includes('/api/replays/upgrade')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ pendingReplays: 0, pendingDrivers: 0, status: { running: false, enabled: false } }) });
      }
      if (url.includes('/api/ai/settings')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: false, model: 'gemini-3.7-flash', keySource: null }) });
      }
      if (url.includes('/api/replays/cache') || url.includes('/api/ai/reports')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'scrollHeight');
  });

  it('shows a failed scan as an error that names the missing folder', async () => {
    render(<Settings status={{ ...okStatus, replaysExist: false }} onUpdatePaths={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /rescan & load telemetry/i }));

    const message = await screen.findByText(/replays folder could not be found/i);
    expect(message.closest('[role="status"]')).toHaveClass('text-lmu-loss');
    await screen.findByText(/no replays cached yet/i);
  });

  it('puts Folder Paths first and shows a setup notice while a folder is missing', async () => {
    render(<Settings status={{ ...okStatus, resultsExist: false, replaysExist: false }} onUpdatePaths={vi.fn()} />);
    expect(screen.getByText(/Setup needed: results folder, replays folder not found/)).toBeInTheDocument();
    expect(sectionOrder()[0]).toBe('Folder Paths & Driver');
    await screen.findByText(/no replays cached yet/i);
  });

  it('keeps the default order and no notice when every folder is found', async () => {
    render(<Settings status={okStatus} onUpdatePaths={vi.fn()} />);
    expect(screen.queryByText(/Setup needed/)).not.toBeInTheDocument();
    expect(sectionOrder()[0]).toBe(SETTINGS_SECTIONS[0].title);
    expect(sectionOrder()[sectionOrder().length - 1]).toBe('Folder Paths & Driver');
    await screen.findByText(/no replays cached yet/i);
  });

  it('uses the same name in the TOC and the section heading', async () => {
    render(<Settings status={okStatus} onUpdatePaths={vi.fn()} />);
    for (const section of SETTINGS_SECTIONS) {
      expect(screen.getByRole('heading', { name: section.title })).toBeInTheDocument();
    }
    await screen.findByText(/no replays cached yet/i);
  });

  it('writes ?section= on TOC click, moves focus to the heading and marks the section current', async () => {
    render(<Settings status={okStatus} onUpdatePaths={vi.fn()} />);
    fireEvent.click(within(toc()).getByRole('button', { name: 'AI Lap Reports' }));

    expect(screen.getByRole('heading', { name: 'AI Lap Reports' })).toHaveFocus();
    expect(within(toc()).getByRole('button', { name: 'AI Lap Reports' })).toHaveAttribute('aria-current', 'location');
    await waitFor(() => expect(window.location.hash).toContain('section=ai-settings'));
    await screen.findByText(/no replays cached yet/i);
  });

  it('scrolls to the section named by ?section= on load', async () => {
    window.location.hash = '#/settings?section=reference-benchmarks';
    const scrollMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollMock;
    render(<Settings status={okStatus} onUpdatePaths={vi.fn()} />);

    await waitFor(() => expect(scrollMock).toHaveBeenCalled());
    expect(scrollMock.mock.contexts[0]).toBe(document.getElementById('reference-benchmarks'));
    expect(within(toc()).getByRole('button', { name: 'Reference Benchmarks' })).toHaveAttribute('aria-current', 'location');
    await screen.findByText(/no replays cached yet/i);
  });

  it('follows scrolling: the last section past the header line is current', async () => {
    render(<Settings status={okStatus} onUpdatePaths={vi.fn()} />);
    // Section i starts 400px apart; the third one (index 2) has just passed the header line.
    SETTINGS_SECTIONS.forEach((section, i) => {
      const el = document.getElementById(section.id);
      if (el) Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => ({ top: (i - 2) * 400 + 80 }) });
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 100000 });

    act(() => { window.dispatchEvent(new Event('scroll')); });
    await waitFor(() => {
      expect(within(toc()).getByRole('button', { name: SETTINGS_SECTIONS[2].title })).toHaveAttribute('aria-current', 'location');
    });
    await screen.findByText(/no replays cached yet/i);
  });

  it('selects the last section at the bottom of the page', async () => {
    render(<Settings status={okStatus} onUpdatePaths={vi.fn()} />);
    SETTINGS_SECTIONS.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => ({ top: -1000 }) });
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: window.innerHeight });

    act(() => { window.dispatchEvent(new Event('scroll')); });
    const last = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].title;
    await waitFor(() => {
      expect(within(toc()).getByRole('button', { name: last })).toHaveAttribute('aria-current', 'location');
    });
    await screen.findByText(/no replays cached yet/i);
  });
});
