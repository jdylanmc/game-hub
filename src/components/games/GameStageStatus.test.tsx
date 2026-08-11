import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GameStageStatus } from './GameStageStatus';

describe('GameStageStatus', () => {
  it('renders an accessible status action and score', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <GameStageStatus
        accent="#22d3ee"
        actionLabel="Resume"
        message="Continue the run."
        onAction={onAction}
        score={1200}
        state="paused"
        title="FloppyBird"
      />,
    );

    expect(screen.getByText('Paused')).toHaveStyle({ color: '#22d3ee' });
    expect(screen.getByRole('heading', { name: 'FloppyBird' })).toBeVisible();
    expect(screen.getByText('1,200')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('renders noninteractive loading state without an action or score', () => {
    const { container } = render(
      <GameStageStatus accent="#f59e0b" message="Preparing workspace." state="loading" title="Loading" />,
    );

    expect(screen.getByText('Workspace load')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass('pointer-events-none');
  });
});
