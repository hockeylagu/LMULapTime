import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CarClassBadge, getCarClassBadgeConfig } from '../../../src/components/common/CarClassBadge.js';

describe('CarClassBadge', () => {
  it('renders Hypercar (HY) in red', () => {
    render(<CarClassBadge carClass="Hyper" carType="Ferrari 499P" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('HY');
    expect(badge.className).toContain('text-lmu-loss');
    expect(badge.className).toContain('border-lmu-loss-strong');
    expect(screen.queryByTestId('badge-orange-corner')).not.toBeInTheDocument();
  });

  it('renders LMP2 (WEC) in blue without orange corner', () => {
    render(<CarClassBadge carClass="LMP2" carType="Oreca 07" category="WEC 2024" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('LMP2');
    expect(badge.className).toContain('text-lmu-info');
    expect(badge.className).toContain('border-lmu-info-strong');
    expect(screen.queryByTestId('badge-orange-corner')).not.toBeInTheDocument();
  });

  it('renders LMP2 (ELMS) in blue with orange corner', () => {
    render(<CarClassBadge carClass="LMP2_ELMS" carType="Oreca 07" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('LMP2');
    expect(badge.className).toContain('text-lmu-info');
    expect(screen.getByTestId('badge-orange-corner')).toBeInTheDocument();
  });

  it('renders LMP3 in purple', () => {
    render(<CarClassBadge carClass="LMP3" carType="Ligier JS P325" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('LMP3');
    expect(badge.className).toContain('text-lmu-purple');
    expect(badge.className).toContain('border-lmu-purple-strong');
    expect(screen.queryByTestId('badge-orange-corner')).not.toBeInTheDocument();
  });

  it('renders GT3 (WEC) in green without orange corner', () => {
    render(<CarClassBadge carClass="GT3" carType="BMW M4 LMGT3" category="WEC 2024" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('GT3');
    expect(badge.className).toContain('text-lmu-gain');
    expect(badge.className).toContain('border-lmu-gain-strong');
    expect(screen.queryByTestId('badge-orange-corner')).not.toBeInTheDocument();
  });

  it('renders GT3 (ELMS) in green with orange corner', () => {
    render(<CarClassBadge carClass="GT3" carType="BMW M4 LMGT3" isElms={true} />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('GT3');
    expect(badge.className).toContain('text-lmu-gain');
    expect(screen.getByTestId('badge-orange-corner')).toBeInTheDocument();
  });

  it('renders GTE in orange', () => {
    render(<CarClassBadge carClass="GTE" carType="Ferrari 488 GTE EVO" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('GTE');
    expect(badge.className).toContain('text-lmu-warn');
    expect(badge.className).toContain('border-lmu-warn-strong');
  });

  it('returns null when no class info is provided', () => {
    const { container } = render(<CarClassBadge carClass="" carType="" />);
    expect(container.firstChild).toBeNull();
  });

  it('supports ariaHidden prop', () => {
    render(<CarClassBadge carClass="GT3" ariaHidden />);
    expect(screen.getByTestId('car-class-badge')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders interactive button when onClick is provided and applies selected styles', () => {
    const handleClick = vi.fn();
    render(<CarClassBadge carClass="GT3" selected={true} onClick={handleClick} aria-label="LMGT3" />);
    const btn = screen.getByRole('button', { name: 'LMGT3' });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.className).toContain('opacity-100');
    expect(btn.className).not.toContain('ring-');
    expect(btn.className).not.toContain('scale-');
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('fades an unselected filter badge with a contrast-safe hue, not opacity', () => {
    render(<CarClassBadge carClass="GT3" isElms selected={false} onClick={vi.fn()} aria-label="LMGT3" />);
    const btn = screen.getByRole('button', { name: 'LMGT3' });
    expect(btn.className).toContain('text-lmu-gain-faded');
    expect(btn.className).toContain('hover:text-lmu-gain');
    expect(btn.className).not.toContain('opacity-');
    expect(screen.getByTestId('badge-orange-corner').querySelector('polygon')).toHaveClass('fill-lmu-warn-faded');
  });

  it('correctly resolves configurations in getCarClassBadgeConfig', () => {
    expect(getCarClassBadgeConfig('Hyper')?.badgeType).toBe('HY');
    expect(getCarClassBadgeConfig('LMH')?.badgeType).toBe('OTHER');
    expect(getCarClassBadgeConfig('LMP2_ELMS')?.hasOrangeCorner).toBe(true);
    expect(getCarClassBadgeConfig('LMP2')?.hasOrangeCorner).toBe(false);
  });
});
