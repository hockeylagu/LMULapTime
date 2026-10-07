import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CarIdentity } from '../../../src/components/vehicle/CarIdentity.js';

vi.mock('../../../src/components/vehicle/useVehicleLogos.js', () => ({
  useVehicleLogos: () => ({
    logos: { Porsche: '<svg></svg>' },
    getLogoSvg: (car?: string | null) => car?.toLowerCase().includes('porsche') ? { brand: 'Porsche', svg: '<svg></svg>' } : null,
  }),
}));

describe('CarIdentity', () => {
  it('shows a decorative logo, the name and the class badge on one row', () => {
    const { container } = render(<CarIdentity carType="Porsche 911 GT3 R LMGT3" carClass="GT3" nameClassName="text-white" />);

    const logo = screen.getByTestId('car-logo');
    expect(logo).toHaveAttribute('alt', '');
    expect(logo).not.toHaveAttribute('title');
    expect(screen.getByText('Porsche 911 GT3 R LMGT3')).toHaveClass('text-white', 'truncate');
    expect(screen.getByTestId('car-class-badge')).toHaveTextContent('GT3');
    expect(container.firstChild).toHaveAttribute('title', 'Porsche 911 GT3 R LMGT3');
  });

  it('leaves the badge out without a class', () => {
    render(<CarIdentity carType="Porsche 963" />);
    expect(screen.queryByTestId('car-class-badge')).toBeNull();
  });

  it('renders nothing for an unknown car unless an empty label is given', () => {
    const { container, rerender } = render(<CarIdentity carType={null} />);
    expect(container.firstChild).toBeNull();

    rerender(<CarIdentity carType={null} emptyLabel="N/A" fallbackIcon />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
