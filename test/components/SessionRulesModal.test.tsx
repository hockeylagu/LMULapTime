import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionRulesModal } from '../../src/components/session-detail/standings/SessionRulesModal.js';
import type { SessionSettings } from '../../server/core/types.js';

describe('SessionRulesModal', () => {
  const baseSettings: SessionSettings = {
    modeSetting: 'Multiplayer',
    serverName: 'Official Race Server',
    damageMultiplier: 100,
    fuelMultiplier: 1,
    tireMultiplier: 1,
    tireWarmers: true,
    fixedSetups: true,
    durationMinutes: 20,
  };

  it('renders modal with warm tires and fixed setup', () => {
    render(<SessionRulesModal isOpen={true} onClose={vi.fn()} settings={baseSettings} />);
    expect(screen.getByText('Rules & Server Configuration')).toBeInTheDocument();
    expect(screen.getByText('Warm Tires')).toBeInTheDocument();
    expect(screen.getByText('Fixed Setup')).toBeInTheDocument();
    expect(screen.getByText('20 min')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders modal with cold tires and open setup', () => {
    const openColdSettings: SessionSettings = {
      ...baseSettings,
      tireWarmers: false,
      fixedSetups: false,
      durationMinutes: 30,
    };
    render(<SessionRulesModal isOpen={true} onClose={vi.fn()} settings={openColdSettings} />);
    expect(screen.getByText('Cold Tires (No Warmers)')).toBeInTheDocument();
    expect(screen.getByText('Open Setup')).toBeInTheDocument();
    expect(screen.getByText('30 min')).toBeInTheDocument();
  });

  it('closes on Escape key press and backdrop click', () => {
    const onClose = vi.fn();
    const { rerender } = render(<SessionRulesModal isOpen={true} onClose={onClose} settings={baseSettings} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<SessionRulesModal isOpen={false} onClose={onClose} settings={baseSettings} />);
    expect(screen.queryByText('Rules & Server Configuration')).not.toBeInTheDocument();
  });
});
