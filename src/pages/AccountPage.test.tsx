import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccountPage } from './AccountPage';

describe('AccountPage', () => {
  it('hands registration, email verification, and password reset to the hosted identity flow', () => {
    render(<AccountPage />);

    expect(screen.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue with email' })).toHaveAttribute('href', '/.auth/login/aad');
    expect(screen.getByRole('link', { name: 'Reset password' })).toHaveAttribute('href', '/.auth/login/aad');
    expect(screen.getByText(/Game Hub never receives or stores your password/)).toBeVisible();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });
});
