import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolderPathsCard, FolderPathsCardProps } from '../../../src/components/settings/FolderPathsCard.js';

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
    // Each path appears once, as the input value.
    expect(screen.getAllByDisplayValue('C:\\LMU\\UserData\\LOG\\Results')).toHaveLength(1);
    expect(screen.queryByText('C:\\LMU\\UserData\\LOG\\Results')).not.toBeInTheDocument();
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

    const scanBtn = screen.getByRole('button', { name: /Rescan & load telemetry/i });
    fireEvent.click(scanBtn);
    expect(onScanPaths).toHaveBeenCalled();
  });

  it('displays scanning state and path messages when active', () => {
    render(<FolderPathsCard {...defaultProps} isScanning={true} pathMessage={{ tone: 'ok', text: 'Paths saved successfully.' }} />);

    const scanBtn = screen.getByRole('button', { name: /Scanning folders\.\.\./i });
    expect(scanBtn).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Paths saved successfully.');
    expect(screen.getByRole('status')).toHaveClass('text-lmu-gain');
  });

  it('renders a failed scan as an error, not a success', () => {
    render(<FolderPathsCard {...defaultProps} pathMessage={{ tone: 'error', text: 'Scan failed: the results folder could not be found.' }} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Scan failed');
    expect(status).toHaveClass('text-lmu-loss');
    expect(status).not.toHaveClass('text-lmu-gain');
  });

  it('gives every input an accessible name', () => {
    render(<FolderPathsCard {...defaultProps} />);
    expect(screen.getByLabelText('Driver name')).toHaveValue('Samuel Lague');
    expect(screen.getByLabelText('Results logs')).toHaveValue('C:\\LMU\\UserData\\LOG\\Results');
    expect(screen.getByLabelText('Replays')).toHaveValue('C:\\LMU\\UserData\\Replays');
    expect(screen.getByLabelText('Telemetry')).toHaveValue('C:\\LMU\\UserData\\Telemetry');
    expect(screen.getByLabelText('Driver name')).toHaveAttribute('placeholder', 'Your LMU driver name');
  });

  it('offers a reset to the saved path once a path is edited', () => {
    const setResultsDirInput = vi.fn();
    render(<FolderPathsCard {...defaultProps} resultsDirInput="D:\\Elsewhere" setResultsDirInput={setResultsDirInput} />);
    expect(screen.getAllByText(/^Detected$/i)).toHaveLength(2);
    expect(screen.getByText(/changed, rescan to check/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(setResultsDirInput).toHaveBeenCalledWith('C:\\LMU\\UserData\\LOG\\Results');
  });
});
