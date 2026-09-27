import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionDetail } from '../../../src/components/session-detail/index.js';
import { clearSessionDetailCache } from '../../../src/components/session-detail/useSessionDetailData.js';
import { mockDetailedSession } from './mockSessionDetail.js';

type Reply = { status: number; body: unknown };

/** Answers each API path with its reply; anything else is an empty list. */
function serve(replies: Record<string, Reply>) {
  const fetchMock = vi.fn((url: string) => {
    const path = Object.keys(replies).find(prefix => url.startsWith(prefix));
    const { status, body } = path ? replies[path] : { status: 200, body: [] };
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SessionDetail loading', () => {
  beforeEach(() => clearSessionDetailCache());
  afterEach(() => vi.unstubAllGlobals());

  it('says why the session could not be loaded when the server fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serve({ '/api/session/': { status: 500, body: { error: 'database is locked' } } });

    render(<SessionDetail sessionId="broken-session" onBack={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('database is locked');
    expect(screen.queryByText('Session Not Found')).not.toBeInTheDocument();
  });

  it('still says Session Not Found for a session the server does not have', async () => {
    serve({ '/api/session/': { status: 404, body: { error: 'Session not found' } } });

    render(<SessionDetail sessionId="missing-session" onBack={vi.fn()} />);

    expect(await screen.findByText('Session Not Found')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads the session by its encoded id', async () => {
    const fetchMock = serve({ '/api/session/': { status: 200, body: mockDetailedSession } });

    render(<SessionDetail sessionId="2026_05_28 P1#2" onBack={vi.fn()} />);

    expect(await screen.findAllByText(/Sim Driver/)).not.toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/session/2026_05_28%20P1%232', expect.anything());
  });
});
