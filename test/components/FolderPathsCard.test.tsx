import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolderPathsCard, FolderPathsCardProps } from '../../src/components/settings/FolderPathsCard.js';

describe('FolderPathsCard component', () => {
  const mockStatus = {
    resultsDir: 'C:\\LMU\\UserData\\LOG\\Results',
    resultsExist: true,
    replaysDir: 'C:\\LMU\\UserData\\Replays',
    replaysExist: true,
    telemetryDir: 'C:\\LMU\\UserData\\Telemetry',
    telemetryExist: true,
    playerName: 'Samuel Lague',
    sessionsCount: 10,
    tracksCount: 5,
    referenceLaptimes: undefined,
  };

  const defaultProps: FolderPathsCardProps = {
    status: mockStatus,
    resultsDirInput: 'C:\\LMU\\UserData\\LOG\\Results',
    setResultsDirInput: vi.fn(),
    replaysDirInput: 'C:\\LMU\\UserData\\Replays',
    setReplaysDirInput: vi.fn(),
    telemetryDirInput: 'C:\\LMU\\UserData\\Telemetry',
    setTelemetryDirInput: vi.fn(),
    playerNameInput: 'Samuel Lague',
    setPlayerNameInput: vi.fn(),
    isScanning: false,
    onScanPaths: vi.fn(),
    pathMessage: null,
  };

  it('renders all detected indicators when paths exist', () => {
    render(<FolderPathsCard {...defaultProps} />);
    const detectedBadges = screen.getAllByText(/^Detected$/i);
    expect(detectedBadges).toHaveLength(3);
    expect(screen.getByText('C:\\LMU\\UserData\\LOG\\Results')).toBeInTheDocument();
    expect(screen.getByText('C:\\LMU\\UserData\\Replays')).toBeInTheDocument();
  });

  it('renders Not Found badges and fallback telemetry label when directories do not exist', () => {
    const missingStatus = {
      ...mockStatus,
      resultsExist: false,
      replaysExist: false,
      telemetryExist: false,
      telemetryDir: '',
    };

    render(<FolderPathsCard {...defaultProps} status={missingStatus} />);
    const notFoundBadges = screen.getAllByText(/Not Found/i);
    expect(notFoundBadges).toHaveLength(3);
    expect(screen.getByText('Not Configured')).toBeInTheDocument();
  });

  it('calls input change handlers when typing in fields', () => {
    const setResultsDirInput = vi.fn();
    const setReplaysDirInput = vi.fn();
    const setTelemetryDirInput = vi.fn();
    const setPlayerNameInput = vi.fn();

    render(
      <FolderPathsCard
        {...defaultProps}
        setResultsDirInput={setResultsDirInput}
        setReplaysDirInput={setReplaysDirInput}
        setTelemetryDirInput={setTelemetryDirInput}
        setPlayerNameInput={setPlayerNameInput}
      />
    );

    fireEvent.change(screen.getByDisplayValue('Samuel Lague'), { target: { value: 'New Driver' } });
    expect(setPlayerNameInput).toHaveBeenCalledWith('New Driver');

    fireEvent.change(screen.getByDisplayValue('C:\\LMU\\UserData\\LOG\\Results'), {
      target: { value: 'D:\\Results' },
    });
    expect(setResultsDirInput).toHaveBeenCalledWith('D:\\Results');

    fireEvent.change(screen.getByDisplayValue('C:\\LMU\\UserData\\Replays'), {
      target: { value: 'D:\\Replays' },
    });
    expect(setReplaysDirInput).toHaveBeenCalledWith('D:\\Replays');

    fireEvent.change(screen.getByDisplayValue('C:\\LMU\\UserData\\Telemetry'), {
      target: { value: 'D:\\Telemetry' },
    });
    expect(setTelemetryDirInput).toHaveBeenCalledWith('D:\\Telemetry');
  });

  it('handles scan button click and form submit', () => {
    const onScanPaths = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<FolderPathsCard {...defaultProps} onScanPaths={onScanPaths} />);

    const scanBtn = screen.getByRole('button', { name: /Rescan & Load Telemetry/i });
    fireEvent.click(scanBtn);
    expect(onScanPaths).toHaveBeenCalled();
  });

  it('displays scanning state and path messages when active', () => {
    render(<FolderPathsCard {...defaultProps} isScanning={true} pathMessage="Paths saved successfully." />);

    const scanBtn = screen.getByRole('button', { name: /Scanning Directory\.\.\./i });
    expect(scanBtn).toBeDisabled();
    expect(screen.getByText('Paths saved successfully.')).toBeInTheDocument();
  });
});
