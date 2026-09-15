import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '../../src/components/navbar/index.js';

describe('Navbar component', () => {
  it('renders brand title and active tab correctly', () => {
    const onRefresh = vi.fn();

    render(
      <Navbar
        status={{ resultsExist: true, replaysExist: true, sessionsCount: 15 }}
        onRefresh={onRefresh}
        isRefreshing={false}
      />
    );

    expect(screen.getByText(/LMU/)).toBeInTheDocument();
    expect(screen.getByText(/15 Sessions Parsed/)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /tracks/i })).toHaveAttribute('href', '/tracks');
  });

  it('handles refresh button click and triggers onRefresh', () => {
    const onRefresh = vi.fn();

    render(
      <Navbar
        status={{ resultsExist: false, replaysExist: false, sessionsCount: 0 }}
        onRefresh={onRefresh}
        isRefreshing={false}
      />
    );

    const refreshBtn = screen.getByTitle('Refresh LMU Directory Scan');
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('returns to dashboard when clicking the top-right status section or the brand logo', () => {
    render(
      <Navbar
        status={{ resultsExist: true, replaysExist: true, sessionsCount: 15 }}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    // Click top-right status section
    const statusCard = screen.getByText(/15 Sessions Parsed/i);
    expect(statusCard.closest('a')).toHaveAttribute('href', '/dashboard');

    // Click brand title
    const brandHeading = screen.getByRole('heading', { level: 1, name: /LMU Lap Time Analyzer/i });
    expect(brandHeading.closest('a')).toHaveAttribute('href', '/dashboard');
  });
});
