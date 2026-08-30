import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '../../src/components/Navbar';

describe('Navbar component', () => {
  it('renders brand title and active tab correctly', () => {
    const setActiveTab = vi.fn();
    const onRefresh = vi.fn();

    render(
      <Navbar
        activeTab="dashboard"
        setActiveTab={setActiveTab}
        status={{ resultsExist: true, replaysExist: true, sessionsCount: 15 }}
        onRefresh={onRefresh}
        isRefreshing={false}
      />
    );

    expect(screen.getByText(/LMU/)).toBeInTheDocument();
    expect(screen.getByText(/15 Sessions Parsed/)).toBeInTheDocument();

    const tracksBtn = screen.getByRole('button', { name: /tracks/i });
    fireEvent.click(tracksBtn);
    expect(setActiveTab).toHaveBeenCalledWith('tracks');
  });

  it('handles refresh button click and triggers onRefresh', () => {
    const setActiveTab = vi.fn();
    const onRefresh = vi.fn();

    render(
      <Navbar
        activeTab="tracks"
        setActiveTab={setActiveTab}
        status={{ resultsExist: false, replaysExist: false, sessionsCount: 0 }}
        onRefresh={onRefresh}
        isRefreshing={false}
      />
    );

    const refreshBtn = screen.getByTitle('Refresh LMU Directory Scan');
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('renders Scanning... when status is null', () => {
    render(
      <Navbar
        activeTab="settings"
        setActiveTab={vi.fn()}
        status={null}
        onRefresh={vi.fn()}
        isRefreshing={true}
      />
    );

    expect(screen.getByText('Scanning...')).toBeInTheDocument();
  });
});
