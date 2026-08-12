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

  it('falls back to anonymous when a session loader rejects', async () => {
    const loadSession = vi.fn().mockRejectedValue(new Error('session unavailable'));

    render(
      <AuthSessionProvider loadSession={loadSession}>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('Session state')).toHaveTextContent('anonymous'));
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
    expect(screen.getByRole('link', { name: 'Sign in or create account' })).toBeVisible();
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
