import '@testing-library/jest-dom/vitest';
import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import React, { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/react')>();
  const RouterMirror: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();

    useEffect(() => {
      window.location.hash = `#${location.pathname}${location.search}${location.hash}`;
    }, [location]);

    return React.createElement(React.Fragment, null, children);
  };

  const render = (ui: React.ReactElement, options?: Parameters<typeof actual.render>[1]) => {
    const rawHash = window.location.hash.replace(/^#/, '');
    const initialEntry = rawHash.startsWith('/') ? rawHash : `/${rawHash}`;
    const RouterWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialEntry || '/'] },
        React.createElement(RouterMirror, null, children),
      );

    return actual.render(
      ui,
      { ...options, wrapper: RouterWrapper },
    );
  };

  return { ...actual, render };
});

import { cleanup } from '@testing-library/react';

// Automatically clean up React DOM after each test
afterEach(() => {
  cleanup();
  window.location.hash = '#/';
});

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver for Recharts
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock dimensions for responsive SVG / Recharts containers in jsdom
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get: () => 800,
});
Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get: () => 400,
});
Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => ({
    width: 800,
    height: 400,
    top: 0,
    left: 0,
    bottom: 400,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => {},
  }),
});

// Mock scrollTo
window.scrollTo = vi.fn();

// Mock URL.createObjectURL and anchor click for CSV/file downloads
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
}
if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = vi.fn();
}
HTMLAnchorElement.prototype.click = vi.fn();

// Safe default mock for global.fetch in jsdom tests
const currentFetch = global.fetch as (typeof global.fetch & { _isDefaultMock?: boolean }) | undefined;
if (!currentFetch || currentFetch._isDefaultMock === undefined) {
  const defaultFetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    })
  ) as typeof global.fetch & { _isDefaultMock?: boolean };
  defaultFetch._isDefaultMock = true;
  global.fetch = defaultFetch;
}
