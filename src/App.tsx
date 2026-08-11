import { findGame, useGameCatalog } from './game-catalog';
import { GamePage } from './pages/GamePage';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { useEffect, useState } from 'react';

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handleNavigation = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  return pathname.replace(/\/+$/, '') || '/';
}

export function App() {
  const catalog = useGameCatalog();
  const pathname = usePathname();

  if (pathname === '/') {
    return <LandingPage catalog={catalog} />;
  }

  const gameMatch = pathname.match(/^\/games\/([^/]+)$/);

  if (!gameMatch) {
    return <NotFoundPage />;
  }

  const requestedGameId = decodeURIComponent(gameMatch[1]);

  if (catalog.status === 'ready') {
    const game = findGame(catalog.games, requestedGameId);
    return game ? <GamePage game={game} requestedGameId={requestedGameId} /> : <NotFoundPage />;
  }

  return (
    <GamePage
      catalogError={catalog.status === 'error' ? catalog.error : undefined}
      catalogLoading={catalog.status === 'loading'}
      requestedGameId={requestedGameId}
    />
  );
}
