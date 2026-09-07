import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LapStatusBadge } from '../../src/components/common/LapStatusBadge';
import { resolveLapStatus } from '../../src/components/common/lapStatus';

describe('resolveLapStatus', () => {
  it('prioritizes pit stop over every other flag', () => {
    expect(resolveLapStatus({ isPitStop: true, isOutLap: true, isValid: true, isInferred: true })).toBe('pit');
  });

  it('prioritizes out lap over valid/inferred', () => {
    expect(resolveLapStatus({ isOutLap: true, isValid: true, isInferred: true })).toBe('outlap');
  });

  it('resolves valid when nothing else applies', () => {
    expect(resolveLapStatus({ isValid: true })).toBe('valid');
  });

  it('resolves inferred when invalid but inferred', () => {
    expect(resolveLapStatus({ isValid: false, isInferred: true })).toBe('inferred');
  });

  it('falls back to invalid when no flags are set', () => {
    expect(resolveLapStatus({})).toBe('invalid');
  });
});

describe('LapStatusBadge', () => {
  it('renders a PIT STOP pill with the pit tooltip', () => {
    render(<LapStatusBadge isPitStop pitTooltip="Estimated pit loss: 24.500s" />);
    const badge = screen.getByText('PIT STOP');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('title')).toBe('Estimated pit loss: 24.500s');
  });

  it('renders an Out Lap pill', () => {
    render(<LapStatusBadge isOutLap />);
    expect(screen.getByText('Out Lap')).toBeInTheDocument();
  });

  it('renders Valid with a distinct color from Incomplete', () => {
    render(<LapStatusBadge isValid />);
    const badge = screen.getByText('Valid');
    expect(badge.className).toContain('text-lmu-green');
  });

  it('renders Incomplete in amber for an inferred lap', () => {
    render(<LapStatusBadge isValid={false} isInferred incompleteTooltip="Estimated from elapsed time" />);
    const badge = screen.getByText('Incomplete');
    expect(badge.className).toContain('text-amber-400');
    expect(badge.getAttribute('title')).toBe('Estimated from elapsed time');
  });

  it('renders Incomplete in gold for a truly invalid lap', () => {
    render(<LapStatusBadge isValid={false} />);
    const badge = screen.getByText('Incomplete');
    expect(badge.className).toContain('text-lmu-gold');
  });
});
