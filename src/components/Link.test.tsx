import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Link } from './Link';

const scrollTo = vi.fn();

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  scrollTo.mockReset();
  vi.stubGlobal('scrollTo', scrollTo);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Link', () => {
  it('updates browser history, announces navigation, and restores the scroll position', async () => {
    const user = userEvent.setup();
    const handleNavigation = vi.fn();
    window.addEventListener('popstate', handleNavigation, { once: true });
    render(<Link href="/games/floppy-bird">Play FloppyBird</Link>);

    await user.click(screen.getByRole('link', { name: 'Play FloppyBird' }));

    expect(window.location.pathname).toBe('/games/floppy-bird');
    expect(handleNavigation).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'instant', top: 0 });
  });

  it('honors a consumer that cancels navigation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    render(
      <Link href="/games/floppy-bird" onClick={onClick}>
        Keep current page
      </Link>,
    );

    await user.click(screen.getByRole('link', { name: 'Keep current page' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
