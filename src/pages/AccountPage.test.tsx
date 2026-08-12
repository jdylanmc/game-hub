import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountPage } from './AccountPage';

beforeEach(() => {
  window.history.replaceState({}, '', '/account');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('AccountPage', () => {
  it('hands registration, email verification, and password reset to the hosted identity flow', () => {
    render(<AccountPage />);

    expect(screen.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue with email' })).toHaveAttribute(
      'href',
      '/.auth/login/aad?post_login_redirect_uri=%2F',
    );
    expect(screen.getByRole('link', { name: 'Reset password' })).toHaveAttribute(
      'href',
      '/.auth/login/aad?post_login_redirect_uri=%2F',
    );
    expect(screen.getByText(/Game Hub never receives or stores your password/)).toBeVisible();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('returns completed or canceled hosted authentication to a validated website path', () => {
    window.history.replaceState({}, '', '/account?returnTo=%2Fgames%2Fneon-drift%3Fmode%3Ddaily%23score');

    render(<AccountPage />);

    expect(screen.getByRole('link', { name: 'Continue with email' })).toHaveAttribute(
      'href',
      '/.auth/login/aad?post_login_redirect_uri=%2Fgames%2Fneon-drift%3Fmode%3Ddaily%23score',
    );
  });

  it('does not pass an untrusted return target to the hosted authentication service', () => {
    window.history.replaceState({}, '', '/account?returnTo=https%3A%2F%2Fattacker.example%2Fphish');

    render(<AccountPage />);

    expect(screen.getByRole('link', { name: 'Continue with email' })).toHaveAttribute(
      'href',
      '/.auth/login/aad?post_login_redirect_uri=%2F',
    );
  });
});
