import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveGameBanner } from '../../../src/components/navbar/LiveGameBanner.js';

describe('LiveGameBanner', () => {
  it('says the game is running and links to the live dashboard', () => {
    render(<LiveGameBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Le Mans Ultimate is running.');
    expect(screen.getByRole('link', { name: /Open the live dashboard/ })).toHaveAttribute('href', '/live');
  });
});
