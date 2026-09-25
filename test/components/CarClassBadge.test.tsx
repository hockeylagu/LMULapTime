import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CarClassBadge, getCarClassBadgeConfig, VehicleClassPills } from '../../src/components/common/CarClassBadge.js';

describe('CarClassBadge', () => {
  it('renders Hypercar (HY) in red', () => {
    render(<CarClassBadge carClass="Hyper" carType="Ferrari 499P" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('HY');
    expect(badge.className).toContain('text-red-400');
    expect(badge.className).toContain('border-red-500');
    expect(screen.queryByTestId('badge-orange-corner')).not.toBeInTheDocument();
  });

  it('renders LMP2 (WEC) in blue without orange corner', () => {
    render(<CarClassBadge carClass="LMP2" carType="Oreca 07" category="WEC 2024" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('LMP2');
    expect(badge.className).toContain('text-sky-400');
    expect(badge.className).toContain('border-sky-500');
    expect(screen.queryByTestId('badge-orange-corner')).not.toBeInTheDocument();
  });

  it('renders LMP2 (ELMS) in blue with orange corner', () => {
    render(<CarClassBadge carClass="LMP2_ELMS" carType="Oreca 07" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('LMP2');
    expect(badge.className).toContain('text-sky-400');
    expect(screen.getByTestId('badge-orange-corner')).toBeInTheDocument();
  });

  it('renders LMP3 in purple', () => {
    render(<CarClassBadge carClass="LMP3" carType="Ligier JS P325" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('LMP3');
    expect(badge.className).toContain('text-purple-400');
    expect(badge.className).toContain('border-purple-500');
    expect(screen.queryByTestId('badge-orange-corner')).not.toBeInTheDocument();
  });

  it('renders GT3 (WEC) in green without orange corner', () => {
    render(<CarClassBadge carClass="GT3" carType="BMW M4 LMGT3" category="WEC 2024" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('GT3');
    expect(badge.className).toContain('text-emerald-400');
    expect(badge.className).toContain('border-emerald-500');
    expect(screen.queryByTestId('badge-orange-corner')).not.toBeInTheDocument();
  });

  it('renders GT3 (ELMS) in green with orange corner', () => {
    render(<CarClassBadge carClass="GT3" carType="BMW M4 LMGT3" isElms={true} />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('GT3');
    expect(badge.className).toContain('text-emerald-400');
    expect(screen.getByTestId('badge-orange-corner')).toBeInTheDocument();
  });

  it('renders GTE in orange', () => {
    render(<CarClassBadge carClass="GTE" carType="Ferrari 488 GTE EVO" />);
    const badge = screen.getByTestId('car-class-badge');
    expect(badge).toHaveTextContent('GTE');
    expect(badge.className).toContain('text-amber-400');
    expect(badge.className).toContain('border-amber-500');
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

  it('renders VehicleClassPills without duplicating text next to badges', () => {
    const onSelect = vi.fn();
    render(<VehicleClassPills selectedClass="LMGT3" onSelectClass={onSelect} />);

    // ALL button is present
    const allBtn = screen.getByRole('button', { name: 'All' });
    expect(allBtn).toBeInTheDocument();
    expect(allBtn).toHaveTextContent('ALL');

    // LMGT3 button is present by aria-label and has GT3 visible text
    const gt3Btn = screen.getByRole('button', { name: 'LMGT3' });
    expect(gt3Btn).toBeInTheDocument();
    expect(gt3Btn).toHaveTextContent('GT3');
    // Ensure there is no duplicated 'LMGT3' text node alongside GT3
    expect(gt3Btn.textContent).toBe('GT3');

    // Hypercar button has HY visible text without duplicated 'Hypercar' text
    const hyBtn = screen.getByRole('button', { name: 'Hypercar' });
    expect(hyBtn).toHaveTextContent('HY');
    expect(hyBtn.textContent).toBe('HY');

    fireEvent.click(hyBtn);
    expect(onSelect).toHaveBeenCalledWith('LMH');
  });

  it('correctly resolves configurations in getCarClassBadgeConfig', () => {
    expect(getCarClassBadgeConfig('LMH')?.badgeType).toBe('HY');
    expect(getCarClassBadgeConfig('LMDh')?.badgeType).toBe('HY');
    expect(getCarClassBadgeConfig('LMP2elms')?.hasOrangeCorner).toBe(true);
    expect(getCarClassBadgeConfig('LMP2wec')?.hasOrangeCorner).toBe(false);
  });
});
