import { useEffect, useState } from 'react';
import { getGame } from './games/catalog';
import { GamePage } from './pages/GamePage';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';

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
  const pathname = usePathname();

  if (pathname === '/') {
    return <LandingPage />;
  }

  const gameMatch = pathname.match(/^\/games\/([^/]+)$/);
  const game = gameMatch ? getGame(decodeURIComponent(gameMatch[1])) : undefined;

  return game ? <GamePage game={game} /> : <NotFoundPage />;
}
