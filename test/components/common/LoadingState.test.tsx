import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingState } from '../../../src/components/common/LoadingState.js';
import { LOADING_QUOTES, getRandomLoadingQuote } from '../../../src/components/common/loadingQuotes.js';

describe('LoadingState', () => {
  it('renders default title and a randomized pit radio quote', () => {
    render(<LoadingState />);
    expect(screen.getByText('Loading Telemetry & Timing Data')).toBeInTheDocument();
    expect(screen.getByText(/Pit Radio:/i)).toBeInTheDocument();

    const quoteBadge = screen.getByTestId('loading-quote-badge');
    expect(quoteBadge).toBeInTheDocument();
    // Verify the quote rendered is one from the curated list
    const quoteText = quoteBadge.textContent || '';
    const hasMatchingQuote = LOADING_QUOTES.some((q) => quoteText.includes(q));
    expect(hasMatchingQuote).toBe(true);
  });

  it('renders custom title and subtitle properly', () => {
    render(
      <LoadingState
        title="Loading Circuit Intelligence"
        subtitle="Aggregating session telemetry and alien benchmark targets..."
        dataTestId="custom-loading"
      />
    );

    expect(screen.getByText('Loading Circuit Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Aggregating session telemetry and alien benchmark targets...')).toBeInTheDocument();
    expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
  });

  it('allows explicit quote override', () => {
    render(
      <LoadingState
        quote="Testing custom pit radio quote!"
      />
    );

    expect(screen.getByText(/Testing custom pit radio quote!/i)).toBeInTheDocument();
  });

  it('hides the quote badge when showQuote is false', () => {
    render(
      <LoadingState
        title="Quiet Loading"
        showQuote={false}
      />
    );

    expect(screen.queryByTestId('loading-quote-badge')).not.toBeInTheDocument();
  });

  it('applies compact styling when size="compact"', () => {
    const { container } = render(
      <LoadingState
        size="compact"
        title="Compact Loading"
      />
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('py-8');
  });

  it('applies page styling by default', () => {
    const { container } = render(
      <LoadingState
        title="Page Loading"
      />
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('py-16');
  });
});

describe('loadingQuotes', () => {
  it('has a non-empty collection of authentic quotes', () => {
    expect(LOADING_QUOTES.length).toBeGreaterThanOrEqual(20);
    LOADING_QUOTES.forEach((quote) => {
      expect(typeof quote).toBe('string');
      expect(quote.length).toBeGreaterThan(10);
    });
  });

  it('getRandomLoadingQuote returns a quote from LOADING_QUOTES', () => {
    const quote = getRandomLoadingQuote();
    expect(LOADING_QUOTES).toContain(quote);
  });
});
