import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSessionProvider } from '../auth/AuthSessionContext';
import type { GameHubUserId } from '../auth/contract';
import { AccountPage } from './AccountPage';

beforeEach(() => {
  window.history.replaceState({}, '', '/account');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('AccountPage', () => {
  it('hands registration, email verification, and password reset to the hosted identity flow', () => {
    const { container } = render(<AccountPage />);

    expect(screen.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue to secure sign-in' })).toHaveAttribute(
      'href',
      '/.auth/login/aad?post_login_redirect_uri=%2Faccount%3Fauthentication%3Dcomplete%26returnTo%3D%252F',
    );
    expect(screen.getByRole('link', { name: 'Reset password' })).toHaveAttribute(
      'href',
      '/.auth/login/aad?post_login_redirect_uri=%2Faccount%3Fauthentication%3Dcomplete%26returnTo%3D%252F',
    );
    expect(screen.getByText(/Game Hub never receives or stores your password/)).toBeVisible();
    expect(container.querySelector('input[type="password"]')).not.toBeInTheDocument();
  });

  it('returns completed or canceled hosted authentication to a validated website path', () => {
    window.history.replaceState({}, '', '/account?returnTo=%2Fgames%2Fneon-drift%3Fmode%3Ddaily%23score');

    render(<AccountPage />);

    expect(screen.getByRole('link', { name: 'Continue to secure sign-in' })).toHaveAttribute(
      'href',
      '/.auth/login/aad?post_login_redirect_uri=%2Faccount%3Fauthentication%3Dcomplete%26returnTo%3D%252Fgames%252Fneon-drift%253Fmode%253Ddaily%2523score',
    );
  });

  it('does not pass an untrusted return target to the hosted authentication service', () => {
    window.history.replaceState({}, '', '/account?returnTo=https%3A%2F%2Fattacker.example%2Fphish');

    render(<AccountPage />);

    expect(screen.getByRole('link', { name: 'Continue to secure sign-in' })).toHaveAttribute(
      'href',
      '/.auth/login/aad?post_login_redirect_uri=%2Faccount%3Fauthentication%3Dcomplete%26returnTo%3D%252F',
    );
  });

  it('presents responsive, screen-reader coherent account states in keyboard order', async () => {
    const user = userEvent.setup();

    render(<AccountPage />);

    expect(screen.getByRole('main', { name: 'Sign in or create an account' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Account options' })).toHaveClass('sr-only');
    expect(screen.getByText(/email and password, Google, or Facebook/)).toBeVisible();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Game Hub' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Sign in or create account' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Continue to secure sign-in' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Reset password' })).toHaveFocus();
  });

  it('shows a recoverable state after cancellation, provider outage, or an invalid or expired flow', () => {
    window.history.replaceState(
      {},
      '',
      '/account?authentication=complete&returnTo=%2Fgames%2Fneon-drift%3Fmode%3Ddaily',
    );

    render(<AccountPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign-in may have been canceled, the provider may be unavailable, or the request may have expired.',
    );
    expect(screen.getByRole('link', { name: 'Try sign-in again' })).toHaveAttribute(
      'href',
      '/.auth/login/aad?post_login_redirect_uri=%2Faccount%3Fauthentication%3Dcomplete%26returnTo%3D%252Fgames%252Fneon-drift%253Fmode%253Ddaily',
    );
  });

  it('returns a completed authenticated flow to the validated website path', async () => {
    window.history.replaceState(
      {},
      '',
      '/account?authentication=complete&returnTo=%2Fgames%2Forbital-stack%3Fmode%3Dendless',
    );
    const completeAuthentication = vi.fn();

    render(
      <AuthSessionProvider
        loadSession={() =>
          Promise.resolve({
            state: 'authenticated',
            userId: 'usr_11111111-2222-4333-8444-555555555555' as GameHubUserId,
          })
        }
      >
        <AccountPage completeAuthentication={completeAuthentication} />
      </AuthSessionProvider>,
    );

    await waitFor(() => expect(completeAuthentication).toHaveBeenCalledWith('/games/orbital-stack?mode=endless'));
  });

  it('fails closed when identity resolution cannot select one account', async () => {
    render(
      <AuthSessionProvider
        loadSession={() =>
          Promise.resolve({
            error: 'identity_resolution_conflict',
            state: 'error',
          })
        }
      >
        <AccountPage />
      </AuthSessionProvider>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAccessibleName('We could not complete sign-in');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('No accounts were linked or merged.');
    expect(screen.getByText(/Credential linking is not available/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sign out and try again' })).toHaveAttribute(
      'href',
      '/.auth/logout?post_logout_redirect_uri=%2Faccount',
    );
  });
});
