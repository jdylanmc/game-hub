import type { GameModule } from '@game-hub/game-contract';

type GameImportMap<GameId extends string> = Record<GameId, () => Promise<GameModule>>;

export function createGameModuleLoader<const GameId extends string>(
  registeredGameIds: readonly GameId[],
  gameImportMap: GameImportMap<GameId>,
) {
  const hasGameLoader = (gameId: string): gameId is GameId =>
    Object.prototype.hasOwnProperty.call(gameImportMap, gameId);

  const loadGameModule = async (gameId: string): Promise<GameModule> => {
    if (!hasGameLoader(gameId)) {
      throw new Error(`Unknown game id "${gameId}". Registered game ids: ${registeredGameIds.join(', ')}.`);
    }

    try {
      return await gameImportMap[gameId]();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to dynamically import game "${gameId}": ${detail}`, { cause: error });
    }
  };

  return {
    hasGameLoader,
    loadGameModule,
  };
}
