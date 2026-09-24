import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferenceLaptimeUpdateToast } from '../../src/components/common/ReferenceLaptimeUpdateToast';

describe('ReferenceLaptimeUpdateToast', () => {
  it('renders singular message when updatedCount is 1', () => {
    const onDismiss = vi.fn();
    render(
      <ReferenceLaptimeUpdateToast updatedCount={1} onDismiss={onDismiss} />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Reference lap times updated')).toBeInTheDocument();
    expect(screen.getByText('1 existing benchmark changed.')).toBeInTheDocument();

    const dismissBtn = screen.getByLabelText('Dismiss reference lap time update notification');
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders plural message when updatedCount > 1 and dismisses via settings link', () => {
    const onDismiss = vi.fn();
    render(
      <ReferenceLaptimeUpdateToast updatedCount={4} onDismiss={onDismiss} />
    );

    expect(screen.getByText('4 existing benchmarks changed.')).toBeInTheDocument();

    const link = screen.getByText('Review in Settings');
    fireEvent.click(link);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
