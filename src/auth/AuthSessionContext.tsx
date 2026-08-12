import type { AuthSession } from './contract';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { loadAuthSession } from './session';

export type WebsiteAuthSession = AuthSession | { state: 'loading' };

const anonymousSession: AuthSession = { state: 'anonymous' };
const AuthSessionContext = createContext<WebsiteAuthSession>(anonymousSession);

interface AuthSessionProviderProps {
  children: ReactNode;
  loadSession?: () => Promise<AuthSession>;
}

export function AuthSessionProvider({ children, loadSession = loadAuthSession }: AuthSessionProviderProps) {
  const [session, setSession] = useState<WebsiteAuthSession>({
    state: 'loading',
  });

  useEffect(() => {
    let active = true;

    void loadSession().then(
      (loadedSession) => {
        if (active) {
          setSession(loadedSession);
        }
      },
      () => {
        if (active) {
          setSession(anonymousSession);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [loadSession]);

  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): WebsiteAuthSession {
  return useContext(AuthSessionContext);
}
