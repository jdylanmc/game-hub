import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { loadAuthSession, type WebsiteAuthSessionResult } from './session';

export type WebsiteAuthSession = WebsiteAuthSessionResult | { state: 'loading' };

const anonymousSession: WebsiteAuthSessionResult = { state: 'anonymous' };

interface AuthSessionContextValue {
  clearSession: () => void;
  retrySession: () => void;
  session: WebsiteAuthSession;
}

const AuthSessionContext = createContext<AuthSessionContextValue>({
  clearSession: () => undefined,
  retrySession: () => undefined,
  session: anonymousSession,
});

interface AuthSessionProviderProps {
  children: ReactNode;
  loadSession?: () => Promise<WebsiteAuthSessionResult>;
}

export function AuthSessionProvider({ children, loadSession = loadAuthSession }: AuthSessionProviderProps) {
  const [loadAttempt, setLoadAttempt] = useState(0);
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
          setSession({
            error: 'session_resolution_failed',
            state: 'error',
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [loadAttempt, loadSession]);

  return (
    <AuthSessionContext.Provider
      value={{
        clearSession: () => setSession(anonymousSession),
        retrySession: () => {
          setSession({ state: 'loading' });
          setLoadAttempt((attempt) => attempt + 1);
        },
        session,
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): WebsiteAuthSession {
  return useContext(AuthSessionContext).session;
}

export function useAuthSessionActions(): Pick<AuthSessionContextValue, 'clearSession' | 'retrySession'> {
  const { clearSession, retrySession } = useContext(AuthSessionContext);

  return { clearSession, retrySession };
}
