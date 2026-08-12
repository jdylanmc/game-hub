import { AUTHENTICATION_CONFIGURATION } from './auth/contract';
import { findGame, useGameCatalog } from './game-catalog';
import { GamePage } from './pages/GamePage';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { lazy, Suspense, useEffect, useState } from 'react';

const AccountPage = lazy(async () => {
  const accountPage = await import('./pages/AccountPage');
  return { default: accountPage.AccountPage };
});

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

  if (pathname === AUTHENTICATION_CONFIGURATION.accountPath) {
    return (
      <Suspense
        fallback={
          <main
            aria-label="Loading account"
            aria-live="polite"
            className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white"
            role="status"
          >
            Loading account…
          </main>
        }
      >
        <AccountPage />
      </Suspense>
    );
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
