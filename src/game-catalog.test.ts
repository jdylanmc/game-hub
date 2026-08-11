import type { GameManifest } from '@game-hub/game-contract';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const manifest: GameManifest = {
  accent: '#f59e0b',
  controls: [{ action: 'Flap upward', inputs: ['Spacebar'] }],
  description: 'Guide a disk through gates.',
  featured: true,
  id: 'floppy-bird',
  instructions: ['Clear every gate.'],
  order: 1,
  secondaryAccent: '#22d3ee',
  tagline: 'Flap the disk.',
  technology: 'Three.js',
  title: 'FloppyBird',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('game catalog', () => {
  it('loads, validates, and caches a valid catalog', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ games: [manifest] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { loadGameCatalog } = await import('./game-catalog');

    await expect(loadGameCatalog()).resolves.toEqual([manifest]);
    await expect(loadGameCatalog()).resolves.toEqual([manifest]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/generated/games.manifest.json');
  });

  it('rejects malformed catalog entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ games: [{ ...manifest, technology: 'Canvas' }] }), { status: 200 }),
        ),
    );
    const { loadGameCatalog } = await import('./game-catalog');

    await expect(loadGameCatalog()).rejects.toThrow('games[0].technology must be "Three.js".');
  });

  it.each([
    [{}, 'The game catalog must contain a top-level games array.'],
    [{ games: [null] }, 'games[0] must be an object.'],
    [{ games: [{ ...manifest, id: '' }] }, 'games[0].id must be a non-empty string.'],
    [{ games: [{ ...manifest, order: Number.NaN }] }, 'games[0].order must be a finite number.'],
    [{ games: [{ ...manifest, featured: 'yes' }] }, 'games[0].featured must be a boolean.'],
    [{ games: [{ ...manifest, controls: null }] }, 'games[0].controls must be an array.'],
    [{ games: [{ ...manifest, controls: [null] }] }, 'games[0].controls[0] must be an object.'],
    [{ games: [{ ...manifest, instructions: null }] }, 'games[0].instructions must be an array.'],
    [
      { games: [{ ...manifest, controls: [{ action: 'Flap', inputs: [''] }] }] },
      'games[0].controls[0].inputs[0] must be a non-empty string.',
    ],
  ])('rejects invalid catalog shape %#', async (catalog, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 })));
    const { loadGameCatalog } = await import('./game-catalog');

    await expect(loadGameCatalog()).rejects.toThrow(message);
  });

  it('reports request failures and permits a retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503, statusText: 'Unavailable' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ games: [manifest] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadGameCatalog } = await import('./game-catalog');

    await expect(loadGameCatalog()).rejects.toThrow('503 Unavailable');
    await expect(loadGameCatalog()).resolves.toEqual([manifest]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('finds manifests and formats route identifiers', async () => {
    const { findGame, formatGameId } = await import('./game-catalog');

    expect(findGame([manifest], 'floppy-bird')).toBe(manifest);
    expect(findGame([manifest], 'missing-game')).toBeUndefined();
    expect(formatGameId('orbital--stack')).toBe('Orbital Stack');
  });

  it('exposes ready catalog state through the host hook', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ games: [manifest] }), { status: 200 })),
    );
    const { useGameCatalog } = await import('./game-catalog');
    const { result } = renderHook(() => useGameCatalog());

    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current).toEqual({ games: [manifest], status: 'ready' }));
  });

  it('exposes catalog failures through the host hook', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
    const { useGameCatalog } = await import('./game-catalog');
    const { result } = renderHook(() => useGameCatalog());

    await waitFor(() => expect(result.current).toEqual({ error: 'network unavailable', status: 'error' }));
  });
});
