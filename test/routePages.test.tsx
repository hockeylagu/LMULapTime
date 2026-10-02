import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Dashboard } from '../src/routePages.js';

const chunk = vi.hoisted(() => {
  let resolve: () => void = () => {};
  const ready = new Promise<void>(done => { resolve = done; });
  return { ready, resolve };
});
vi.mock('../src/components/dashboard/Dashboard.js', async () => {
  await chunk.ready;
  return { Dashboard: () => <div>Dashboard loaded</div> };
});

describe('route page startup boundary', () => {
  it('resumes a cold page without skipping use() and renders the preloaded page immediately', async () => {
    const errors = vi.spyOn(console, 'error');
    try {
      const view = <Suspense fallback={<div>Loading page</div>}><Dashboard sessions={[]} onSelectSession={() => {}} selectedCarClass="All" setSelectedCarClass={() => {}} /></Suspense>;
      let rendered: ReturnType<typeof render> | undefined;
      await act(async () => { rendered = render(view); });
      expect(screen.getByText('Loading page')).toBeInTheDocument();
      await act(async () => { chunk.resolve(); await vi.dynamicImportSettled(); });
      expect(await screen.findByText('Dashboard loaded')).toBeInTheDocument();
      await act(async () => { rendered?.rerender(view); });
      expect(screen.queryByText('Loading page')).not.toBeInTheDocument();
      expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
  });
});
