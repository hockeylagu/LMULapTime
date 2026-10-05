import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CarLogo } from '../../../src/components/vehicle/CarLogo.js';
import * as vehicleLogosApi from '../../../src/api/vehicleLogosApi.js';

describe('CarLogo component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vehicleLogosApi.clearCachedVehicleLogos();
  });

  it('renders null when no carType or carModel is provided', async () => {
    vi.spyOn(vehicleLogosApi, 'fetchVehicleLogos').mockResolvedValue({});
    const { container } = render(<CarLogo />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders fallback when logo is not matched and fallback is provided', async () => {
    vi.spyOn(vehicleLogosApi, 'fetchVehicleLogos').mockResolvedValue({});
    render(
      <CarLogo
        carType="Nonexistent Brand Model"
        fallback={<span data-testid="test-fallback">Fallback</span>}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('test-fallback')).toBeInTheDocument();
    });
  });

  it('renders an img with data URI when logo is available', async () => {
    const fakeSvg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    vi.spyOn(vehicleLogosApi, 'fetchVehicleLogos').mockResolvedValue({
      Ferrari: fakeSvg,
    });

    render(<CarLogo carType="Ferrari 296 GT3" size="sm" />);

    await waitFor(() => {
      const img = screen.getByTestId('car-logo');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', 'Ferrari logo');
      expect(img).toHaveAttribute('title', 'Ferrari');
      expect(img.getAttribute('src')).toContain('data:image/svg+xml;utf8,');
      expect(img.className).toContain('w-4 h-4');
    });
  });

  it('applies the requested size classes', async () => {
    const fakeSvg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    vi.spyOn(vehicleLogosApi, 'fetchVehicleLogos').mockResolvedValue({
      Porsche: fakeSvg,
    });

    render(<CarLogo carModel="Porsche 911 GT3 R" size="lg" className="custom-test" />);

    await waitFor(() => {
      const img = screen.getByTestId('car-logo');
      expect(img.className).toContain('w-7 h-7');
      expect(img.className).toContain('custom-test');
    });
  });
});
