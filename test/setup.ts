import '@testing-library/jest-dom/vitest';
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

const ChartSeriesContext = React.createContext<{
  register: (entry: { dataKey?: string; value?: string; color?: string; type?: string }) => void;
  entries: Array<{ dataKey?: string; value?: string; color?: string; type?: string }>;
}>({ register: () => {}, entries: [] });

vi.mock('recharts', () => {
  const ChartContainer: React.FC<{
    children?: React.ReactNode;
    data?: unknown[];
    onClick?: (state: { activeLabel?: number; activePayload?: unknown[] }) => void;
  }> = ({ children, data, onClick }) => {
    const [entries, setEntries] = React.useState<Array<{ dataKey?: string; value?: string; color?: string; type?: string }>>([]);
    const register = React.useCallback((entry: { dataKey?: string; value?: string; color?: string; type?: string }) => {
      setEntries((prev) => (prev.some((e) => e.dataKey === entry.dataKey) ? prev : [...prev, entry]));
    }, []);

    const firstItem = data && data.length > 0 ? data[0] : undefined;

    return React.createElement(
      ChartSeriesContext.Provider,
      { value: { register, entries } },
      React.createElement(
        'div',
        { 'data-testid': 'recharts-chart' },
        React.createElement('button', {
          type: 'button',
          'aria-label': 'Select lap 2',
          'data-testid': 'recharts-click-trigger',
          onClick: () => onClick?.({ activeLabel: 2, activePayload: firstItem ? [{ payload: firstItem }] : undefined }),
        }),
        children,
      ),
    );
  };

  return {
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    LineChart: ChartContainer,
    BarChart: ChartContainer,
    AreaChart: ChartContainer,
    Bar: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    Cell: (props: Record<string, unknown> & { children?: React.ReactNode }) => React.createElement('button', { type: 'button', ...props }, props.children),
    Line: (props: { dataKey?: string; name?: string; stroke?: string }) => {
      const ctx = React.useContext(ChartSeriesContext);
      React.useEffect(() => {
        if (props.dataKey && ctx) {
          ctx.register({ dataKey: props.dataKey, value: props.name || props.dataKey, color: props.stroke, type: 'line' });
        }
      }, [props.dataKey, props.name, props.stroke, ctx]);
      return null;
    },
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: ({ content }: { content?: React.ReactNode | ((props: unknown) => React.ReactNode) }) => {
      if (React.isValidElement(content)) return content;
      if (typeof content === 'function') return (content as (props: unknown) => React.ReactNode)({});
      return null;
    },
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Legend: ({
      formatter,
      content,
      payload,
    }: {
      formatter?: (value: string, entry: unknown) => React.ReactNode;
      content?: React.ReactNode | ((props: { payload?: unknown[] }) => React.ReactNode);
      payload?: unknown[];
    }) => {
      const ctx = React.useContext(ChartSeriesContext);
      const defaultPayload = [
        { dataKey: 'bestLap', value: 'Best Lap Time', color: '#38bdf8' },
        { dataKey: 'top3Avg', value: 'Top 3 Average', color: '#a855f7' },
        { dataKey: 'medianPace', value: 'Median Pace', color: '#eab308' },
        { dataKey: 's1', value: 'Sector 1', color: '#38bdf8' },
        { dataKey: 's2', value: 'Sector 2', color: '#a855f7' },
        { dataKey: 's3', value: 'Sector 3', color: '#eab308' },
        { dataKey: 'consistency', value: 'Pace Consistency Rating (%)', color: '#10b981' },
        { dataKey: 'Sim Driver', value: 'Sim Driver', color: '#fff', type: 'line' },
      ];
      const effectivePayload = payload && payload.length > 0
        ? payload
        : ctx.entries.length > 0
          ? ctx.entries
          : defaultPayload;

      if (React.isValidElement(content)) {
        return React.cloneElement(content as React.ReactElement<{ payload?: unknown[] }>, { payload: effectivePayload });
      }
      if (typeof content === 'function') {
        return (content as (props: { payload?: unknown[] }) => React.ReactNode)({ payload: effectivePayload });
      }
      if (typeof formatter === 'function') {
        return React.createElement(
          'div',
          null,
          formatter('Sim Driver', { dataKey: 'Sim Driver', value: 'Sim Driver', color: '#fff', type: 'line' }),
        );
      }
      return null;
    },
  };
});

import { cleanup } from '@testing-library/react';

if (typeof window !== 'undefined') {
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
}

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
