import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdvertisementPlacement } from './AdvertisementPlacement';

describe('AdvertisementPlacement', () => {
  it('labels populated sponsor content without presenting it as gameplay', () => {
    render(<AdvertisementPlacement state="populated" />);

    const placement = screen.getByRole('complementary', { name: 'Advertisement' });
    expect(placement).toHaveAttribute('aria-busy', 'false');
    expect(placement).toHaveAccessibleDescription('Reserved slot · no SDK yet · gameplay stays primary');
    expect(screen.getByText('Neutral sponsor placeholder')).toBeVisible();
  });

  it('announces loading while preserving the labelled placement', () => {
    render(<AdvertisementPlacement state="loading" />);

    expect(screen.getByRole('complementary', { name: 'Advertisement' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Advertisement is loading inside reserved layout space.');
  });

  it('keeps an unavailable placement visible with explanatory text', () => {
    render(<AdvertisementPlacement state="unavailable" />);

    const placement = screen.getByRole('complementary', { name: 'Advertisement' });
    expect(placement).toHaveAccessibleDescription('Reserved slot stays in place until campaign creative is ready.');
    expect(screen.getByText('Advertisement unavailable')).toBeVisible();
  });
});
