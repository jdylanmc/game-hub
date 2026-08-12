import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSessionProvider, useAuthSession } from './AuthSessionContext';
import type { GameHubUserId } from './contract';
import { SiteHeader } from '../components/SiteHeader';

function SessionProbe({ children }: { children?: ReactNode }) {
  const session = useAuthSession();

  return (
    <>
      <output aria-label="Session state">{session.state}</output>
      {children}
    </>
  );
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('AuthSessionProvider', () => {
  it('renders public content while the session loads and remains anonymous', async () => {
    const loadSession = vi.fn().mockResolvedValue({ state: 'anonymous' } as const);

    render(
      <AuthSessionProvider loadSession={loadSession}>
        <SessionProbe>
          <button type="button">Play game</button>
        </SessionProbe>
      </AuthSessionProvider>,
    );

    expect(screen.getByLabelText('Session state')).toHaveTextContent('loading');
    expect(screen.getByRole('button', { name: 'Play game' })).toBeEnabled();
    await waitFor(() => expect(screen.getByLabelText('Session state')).toHaveTextContent('anonymous'));
    expect(loadSession).toHaveBeenCalledOnce();
  });

  it('exposes the resolved authenticated state without displaying the internal ID', async () => {
    const loadSession = vi.fn().mockResolvedValue({
      state: 'authenticated',
      userId: 'internal-user' as GameHubUserId,
    } as const);

    render(
      <AuthSessionProvider loadSession={loadSession}>
        <SessionProbe />
        <SiteHeader />
      </AuthSessionProvider>,
    );

    expect(screen.getByRole('status', { name: 'Checking session' })).toBeVisible();
    expect(
      await screen.findByRole('status', {
        name: 'Signed in to Game Hub',
      }),
    ).toBeVisible();
    expect(screen.queryByText('internal-user')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in or create account' })).not.toBeInTheDocument();
  });

  it('exposes a recoverable error and retries a failed session resolution', async () => {
    const loadSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('session unavailable'))
      .mockResolvedValueOnce({ state: 'anonymous' } as const);

    render(
      <AuthSessionProvider loadSession={loadSession}>
        <SessionProbe />
        <SiteHeader />
      </AuthSessionProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('Session state')).toHaveTextContent('error'));
    expect(screen.getByRole('status', { name: 'Account session unavailable' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByLabelText('Session state')).toHaveTextContent('anonymous'));
    expect(loadSession).toHaveBeenCalledTimes(2);
  });

  it('clears the website session immediately when signing out from an authenticated page', async () => {
    window.history.replaceState({}, '', '/games/orbital-stack?mode=endless#results');
    const loadSession = vi.fn().mockResolvedValue({
      state: 'authenticated',
      userId: 'internal-user' as GameHubUserId,
    } as const);

    render(
      <AuthSessionProvider loadSession={loadSession}>
        <SessionProbe />
        <SiteHeader />
      </AuthSessionProvider>,
    );

    const signOutLink = await screen.findByRole('link', { name: 'Sign out' });
    expect(signOutLink).toHaveAttribute(
      'href',
      '/.auth/logout?post_logout_redirect_uri=%2Fgames%2Forbital-stack%3Fmode%3Dendless%23results',
    );
    signOutLink.addEventListener('click', (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(signOutLink);

    expect(screen.getByLabelText('Session state')).toHaveTextContent('anonymous');
    expect(screen.getByRole('status', { name: 'Signed out of Game Hub' })).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('link', { name: 'Sign in or create account' })).toBeVisible();
  });

  it('routes identity conflicts to the account recovery state without retrying blindly', async () => {
    window.history.replaceState({}, '', '/games/neon-drift?mode=daily');
    const loadSession = vi.fn().mockResolvedValue({
      error: 'identity_resolution_conflict',
      state: 'error',
    } as const);

    render(
      <AuthSessionProvider loadSession={loadSession}>
        <SiteHeader />
      </AuthSessionProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Resolve sign-in' })).toHaveAttribute(
      'href',
      '/account?returnTo=%2Fgames%2Fneon-drift%3Fmode%3Ddaily',
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('SiteHeader', () => {
  it('provides an accessible same-origin sign-in affordance for anonymous visitors', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('navigation', { name: 'Account' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sign in or create account' })).toHaveAttribute('href', '/account');
  });

  it('carries the current website path to the account entry page', () => {
    window.history.replaceState({}, '', '/games/floppy-bird?mode=daily#score');

    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Sign in or create account' })).toHaveAttribute(
      'href',
      '/account?returnTo=%2Fgames%2Ffloppy-bird%3Fmode%3Ddaily%23score',
    );
  });
});
