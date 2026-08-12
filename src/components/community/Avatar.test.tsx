import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('provides an accessible initials fallback and presence status', () => {
    render(<Avatar name="Kai Sol" status="busy" />);

    expect(screen.getByRole('img', { name: 'Kai Sol avatar' })).toBeVisible();
    expect(screen.getByText('KS')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('uses the supplied alternative text for an avatar image', () => {
    render(<Avatar alt="Ari Mercer leaderboard avatar" name="Ari Mercer" src="data:image/png;base64,fixture" />);

    expect(screen.getByRole('img', { name: 'Ari Mercer leaderboard avatar' })).toHaveAttribute(
      'src',
      'data:image/png;base64,fixture',
    );
  });
});
