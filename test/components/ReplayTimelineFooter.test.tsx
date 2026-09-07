import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReplayTimelineFooter } from '../../src/components/replay/ReplayTimelineFooter';

describe('ReplayTimelineFooter', () => {
  it('renders the current frame count out of the total', () => {
    render(
      <ReplayTimelineFooter
        currentIndex={4}
        totalPoints={100}
        currentTimeSec={12.345}
        onChangeIndex={vi.fn()}
      />
    );

    expect(screen.getByText('Frame 5 / 100')).toBeInTheDocument();
  });

  it('formats lap-elapsed time as m:ss.sss', () => {
    render(
      <ReplayTimelineFooter
        currentIndex={0}
        totalPoints={100}
        currentTimeSec={65.4321}
        onChangeIndex={vi.fn()}
      />
    );

    expect(screen.getByText('1:05.432')).toBeInTheDocument();
  });

  it('shows a genuine zero as 0:00.000 rather than a placeholder', () => {
    render(
      <ReplayTimelineFooter
        currentIndex={0}
        totalPoints={100}
        currentTimeSec={0}
        onChangeIndex={vi.fn()}
      />
    );

    expect(screen.getByText('0:00.000')).toBeInTheDocument();
  });

  it('falls back to 0:00.000 when currentTimeSec is undefined', () => {
    render(
      <ReplayTimelineFooter
        currentIndex={0}
        totalPoints={100}
        onChangeIndex={vi.fn()}
      />
    );

    expect(screen.getByText('0:00.000')).toBeInTheDocument();
  });

  it('calls onChangeIndex when the slider is moved', async () => {
    const onChangeIndex = vi.fn();
    render(
      <ReplayTimelineFooter
        currentIndex={0}
        totalPoints={100}
        currentTimeSec={0}
        onChangeIndex={onChangeIndex}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '42' } });

    await waitFor(() => expect(onChangeIndex).toHaveBeenCalledWith(42));
  });
});
