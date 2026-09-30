import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionTypeChip } from '../../../src/components/session-list/SessionRowParts.js';
import { SessionTypePills } from '../../../src/components/common/SessionTypePills.js';
import { getSessionTypeStyle, SESSION_TYPE_STYLES } from '../../../src/components/common/sessionTypeStyles.js';

describe('session type colors', () => {
  it('gives practice, qualifying and race their own look', () => {
    expect(getSessionTypeStyle('Practice')).toBe(SESSION_TYPE_STYLES.Practice);
    expect(getSessionTypeStyle('Qualifying')).toBe(SESSION_TYPE_STYLES.Qualifying);
    expect(getSessionTypeStyle('Race')).toBe(SESSION_TYPE_STYLES.Race);
    expect(new Set(Object.values(SESSION_TYPE_STYLES).map(s => s.dot)).size).toBe(3);
  });

  it('reads a session only named qualifying as qualifying, and leaves other types neutral', () => {
    expect(getSessionTypeStyle('Other', 'Qualifying 1')).toBe(SESSION_TYPE_STYLES.Qualifying);
    expect(getSessionTypeStyle('Warmup', 'WU')).toBeNull();
  });

  it('colors the session chip by its type', () => {
    render(<SessionTypeChip session={{ id: 'r', timeString: '', sessionType: 'Race', sessionName: 'R1' }} />);
    expect(screen.getByText('R1').className).toContain('text-lmu-accent-soft');
  });

  it('keeps the chosen type in its hue and marks the others with a dot', () => {
    render(<SessionTypePills selectedType="Qualifying" onSelectType={vi.fn()} />);
    const quali = screen.getByRole('button', { name: 'Qualifying' });
    expect(quali).toHaveAttribute('aria-pressed', 'true');
    expect(quali.className).toContain('text-lmu-warn-soft');
    expect(screen.getByRole('button', { name: 'Race' }).querySelector('.bg-lmu-accent')).not.toBeNull();
    expect(quali.querySelector('.bg-lmu-warn')).toBeNull();
  });
});
