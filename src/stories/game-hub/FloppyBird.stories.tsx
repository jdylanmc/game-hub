import type { ReactNode } from 'react';
import { featuredStorybookGame } from '../../storybook/gameHubFixtures';
import { StorySurface } from '../../storybook/StorySurface';
import { GameCard } from '../../components/games/GameCard';
import { GameControlsCard } from '../../components/games/GameControlsCard';
import { GameHudCard } from '../../components/games/GameHudCard';
import { GameManifestCard } from '../../components/games/GameManifestCard';
import { GameStageStatus } from '../../components/games/GameStageStatus';

const meta = {
  title: 'Game Hub/Games/FloppyBird',
  parameters: {
    backgrounds: {
      default: 'game-hub-dark',
    },
  },
};

export default meta;

function StageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/70 p-3">
      <div className="relative aspect-video overflow-hidden rounded-[1.4rem] border border-white/10 bg-slate-950">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at top, ${featuredStorybookGame.accent}22, transparent 45%), linear-gradient(180deg, rgba(15,23,42,0.94), rgba(2,6,23,0.98))`,
          }}
        />
        {children}
      </div>
    </div>
  );
}

export const Card = {
  render: () => (
    <StorySurface
      description="The featured landing-page card leads with FloppyBird and the workspace-aware control summary."
      eyebrow="Featured catalog"
      maxWidthClassName="max-w-6xl"
      title="FloppyBird landing card"
    >
      <GameCard featured game={featuredStorybookGame} index={0} />
    </StorySurface>
  ),
};

export const Manifest = {
  render: () => (
    <StorySurface
      description="The manifest panel shows the runtime metadata that the public catalog fetch exposes before any game code is imported."
      eyebrow="Runtime manifest"
      maxWidthClassName="max-w-4xl"
      title="FloppyBird manifest panel"
    >
      <GameManifestCard game={featuredStorybookGame} />
    </StorySurface>
  ),
};

export const Loading = {
  render: () => (
    <StorySurface
      description="Loading stays deterministic: the host shows a clear module-loading state while Vite fetches the workspace chunk."
      eyebrow="Stage states"
      maxWidthClassName="max-w-5xl"
      title="FloppyBird loading state"
    >
      <StageFrame>
        <GameStageStatus
          accent={featuredStorybookGame.accent}
          message="Importing the workspace module and its Three.js scene after the route opens."
          state="loading"
          title={`Loading ${featuredStorybookGame.title}`}
        />
      </StageFrame>
    </StorySurface>
  ),
};

export const Controls = {
  render: () => (
    <StorySurface
      description="The controls card keeps keyboard, pointer, and host-level pause interactions visible in the DOM."
      eyebrow="Controls"
      maxWidthClassName="max-w-4xl"
      title="FloppyBird controls panel"
    >
      <GameControlsCard game={featuredStorybookGame} />
    </StorySurface>
  ),
};

export const HUD = {
  render: () => (
    <StorySurface
      description="HUD events stay deterministic in Storybook by feeding the card a stable score, label, and detail string."
      eyebrow="HUD"
      maxWidthClassName="max-w-4xl"
      title="FloppyBird HUD state"
    >
      <GameHudCard
        accent={featuredStorybookGame.accent}
        detail="Speed 342 rpm"
        label="Gates cleared"
        phase="running"
        score={7}
      />
    </StorySurface>
  ),
};

export const Paused = {
  render: () => (
    <StorySurface
      description="Pause overlays remain keyboard-accessible and clearly separate from the canvas."
      eyebrow="Stage states"
      maxWidthClassName="max-w-5xl"
      title="FloppyBird paused state"
    >
      <StageFrame>
        <GameStageStatus
          actionLabel="Resume"
          accent={featuredStorybookGame.accent}
          message="Paused. Resume when you are ready to flap again."
          onAction={() => undefined}
          state="paused"
          title="Paused"
        />
      </StageFrame>
    </StorySurface>
  ),
};

export const GameOver = {
  render: () => (
    <StorySurface
      description="Game-over states preserve the final score and a single restart affordance without needing the live canvas."
      eyebrow="Stage states"
      maxWidthClassName="max-w-5xl"
      title="FloppyBird game-over state"
    >
      <StageFrame>
        <GameStageStatus
          actionLabel="Restart run"
          accent={featuredStorybookGame.accent}
          message="A gate closed in before the wings could clear it."
          onAction={() => undefined}
          score={12}
          state="game-over"
          title="Run complete"
        />
      </StageFrame>
    </StorySurface>
  ),
};
