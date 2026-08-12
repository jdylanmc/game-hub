import type { GameModule } from '@game-hub/game-contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import type { GameCatalogState } from './game-catalog';
import { gameFixture } from './test/game-fixture';

const scrollTo = vi.fn();

const mocks = vi.hoisted(() => ({
  loadGameModule: vi.fn<(gameId: string) => Promise<GameModule>>(),
  useGameCatalog: vi.fn<() => GameCatalogState>(),
}));

vi.mock('./game-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./game-catalog')>();
  return {
    ...actual,
    useGameCatalog: mocks.useGameCatalog,
  };
});

vi.mock('./generated/game-import-map', () => ({
  loadGameModule: mocks.loadGameModule,
}));

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  scrollTo.mockReset();
  mocks.loadGameModule.mockReset();
  mocks.loadGameModule.mockReturnValue(new Promise<GameModule>(() => undefined));
  mocks.useGameCatalog.mockReset();
  vi.stubGlobal('scrollTo', scrollTo);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('navigates from the ready catalog to a lazy game route', async () => {
    const user = userEvent.setup();
    mocks.useGameCatalog.mockReturnValue({ games: [gameFixture], status: 'ready' });

    render(<App />);

    expect(screen.getByRole('heading', { name: /Small games/i })).toBeVisible();
    expect(screen.getByText('1 games available')).toBeVisible();

    await user.click(screen.getByRole('link', { name: /Open workspace/i }));

    expect(window.location.pathname).toBe('/games/floppy-bird');
    expect(screen.getByRole('heading', { level: 1, name: 'FloppyBird' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Loading FloppyBird' })).toBeVisible();
    expect(screen.getByRole('link', { name: '← All games' })).toHaveAttribute('href', '/');
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'instant', top: 0 });
  });

  it('transitions a direct game route from catalog loading to catalog error', () => {
    window.history.replaceState({}, '', '/games/floppy-bird');
    mocks.useGameCatalog.mockReturnValue({ status: 'loading' });

    const { rerender } = render(<App />);

    expect(screen.getByText('Workspace load')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Loading Floppy Bird' })).toBeVisible();
    expect(screen.getByText(/Fetching the runtime catalog/i)).toBeVisible();

    mocks.useGameCatalog.mockReturnValue({ error: 'Catalog service unavailable.', status: 'error' });
    rerender(<App />);

    expect(screen.getByText('Load error')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Game unavailable' })).toBeVisible();
    expect(screen.getByText('Catalog service unavailable.')).toBeVisible();
  });

  it.each(['/games/missing-game', '/about'])('renders the missing-game page for %s', (pathname) => {
    window.history.replaceState({}, '', pathname);
    mocks.useGameCatalog.mockReturnValue({ games: [gameFixture], status: 'ready' });

    render(<App />);

    expect(screen.getByText('404')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Game not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse games' })).toHaveAttribute('href', '/');
  });
});
