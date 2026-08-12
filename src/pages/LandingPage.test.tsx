import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { gameFixture, secondaryGameFixture } from '../test/game-fixture';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('announces catalog loading without exposing stale game links', () => {
    render(<LandingPage catalog={{ status: 'loading' }} />);

    expect(screen.getByText('Loading game catalog…')).toBeVisible();
    expect(screen.queryByRole('link', { name: /Open workspace/i })).not.toBeInTheDocument();
  });

  it('shows an actionable catalog error message', () => {
    render(<LandingPage catalog={{ error: 'Manifest JSON is invalid.', status: 'error' }} />);

    expect(screen.getByText('Catalog unavailable')).toBeVisible();
    expect(screen.getByText('Manifest error')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'The catalog could not be loaded' })).toBeVisible();
    expect(screen.getByText('Manifest JSON is invalid.')).toBeVisible();
  });

  it('renders the featured game first and links every ready catalog entry', () => {
    render(<LandingPage catalog={{ games: [secondaryGameFixture, gameFixture], status: 'ready' }} />);

    expect(screen.getByText('2 games available')).toBeVisible();
    const gameLinks = screen.getAllByRole('link', { name: /Open workspace/i });
    expect(gameLinks).toHaveLength(2);
    expect(gameLinks[0]).toHaveAttribute('href', '/games/floppy-bird');
    expect(gameLinks[1]).toHaveAttribute('href', '/games/orbital-stack');
    expect(screen.getAllByText('Spacebar · Pointer')).toHaveLength(2);
  });
});
