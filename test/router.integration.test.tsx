import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router';
import App from '../src/App.js';

function mockApi() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ resultsExist: true, replaysExist: true, sessionsCount: 0 }) });
    }
    if (url.includes('/api/sessions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/progression')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/tracks')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    if (url.includes('/api/scan/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ running: false }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

describe('HashRouter integration', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    mockApi();
    window.location.hash = '#/dashboard';
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it('mounts the real HashRouter and navigates between app routes', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <HashRouter>
          <App />
        </HashRouter>,
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('aria-current', 'page');
    });

    fireEvent.click(screen.getByRole('link', { name: /tracks/i }));

    await waitFor(() => {
      expect(screen.getByText(/Track Records & Benchmarks/i)).toBeInTheDocument();
      expect(window.location.hash).toContain('#/tracks');
    });

    fireEvent.click(screen.getByRole('link', { name: /dashboard/i }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('aria-current', 'page');
      expect(window.location.hash).toContain('#/dashboard');
    });
  });
});
