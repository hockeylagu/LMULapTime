import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HasReplayToggle } from '../../../src/components/common/HasReplayToggle.js';
import { HideEmptyToggle } from '../../../src/components/common/HideEmptyToggle.js';

describe('HasReplayToggle', () => {
  it('renders inactive state and toggles on click', () => {
    const onToggle = vi.fn();
    render(
      <HasReplayToggle
        hasReplayOnly={false}
        onToggle={onToggle}
        replayCount={5}
      />
    );

    const button = screen.getByRole('button', { name: /Filter sessions with replay/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Has Replay');
    expect(button).toHaveTextContent('5');
    expect(button).toHaveAttribute('title', expect.stringContaining('Filter to sessions with recorded replay'));

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('renders active state with accent styling and active title', () => {
    const onToggle = vi.fn();
    render(
      <HasReplayToggle
        hasReplayOnly={true}
        onToggle={onToggle}
        replayCount={3}
      />
    );

    const button = screen.getByRole('button', { name: /Filter sessions with replay/i });
    expect(button.className).toContain('bg-lmu-accent/20');
    expect(button).toHaveAttribute('title', expect.stringContaining('Showing only sessions with recorded replay'));

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe('HideEmptyToggle', () => {
  it('renders compact with default label and aria-label', () => {
    const onToggle = vi.fn();
    render(
      <HideEmptyToggle
        hideEmpty={true}
        onToggle={onToggle}
        emptyCount={2}
      />
    );

    const button = screen.getByRole('button', { name: /Hide Empty Sessions/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Hide Empty');
    expect(button).toHaveTextContent('2');
    expect(button).toHaveAttribute('title', expect.stringContaining('Hiding empty sessions'));

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
