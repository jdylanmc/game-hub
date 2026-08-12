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

  it.each([
    ['ready', 'Ready', 'Ready to play'],
    ['error', 'Load error', 'Workspace unavailable'],
  ] as const)('renders the noninteractive %s state', (state, eyebrow, title) => {
    const { container } = render(
      <GameStageStatus accent="#60a5fa" message={`${title} details.`} state={state} title={title} />,
    );

    expect(screen.getByText(eyebrow)).toBeVisible();
    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    expect(screen.getByText(`${title} details.`)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass('pointer-events-none');
  });

  it('renders game-over score and restart behavior', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <GameStageStatus
        accent="#f59e0b"
        actionLabel="Restart run"
        message="Final gate missed."
        onAction={onAction}
        score={12_345}
        state="game-over"
        title="Run complete"
      />,
    );

    expect(screen.getByText('Run complete', { selector: 'p' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Run complete' })).toBeVisible();
    expect(screen.getByText('12,345')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Restart run' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
