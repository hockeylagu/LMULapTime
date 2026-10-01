import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReplayShortcutHelp } from '../../../src/components/replay/ReplayShortcutHelp.js';

describe('replay shortcut help', () => {
  it('opens with ?, focuses close, closes with Escape and restores chart focus', () => {
    render(<div tabIndex={0} data-replay-surface="chart" data-testid="chart"><ReplayShortcutHelp /></div>);
    const chart = screen.getByTestId('chart'); chart.focus();
    fireEvent.keyDown(chart, { key: '?' });
    expect(screen.getByRole('dialog')).toHaveTextContent('Shift + wheel');
    expect(screen.getByRole('button', { name: 'Close shortcuts' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chart).toHaveFocus();
  });
});
