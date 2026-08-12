import { useAuthSession, useAuthSessionActions } from '../auth/AuthSessionContext';
import { createAccountPath, createSignOutPath, getCurrentWebsiteReturnPath } from '../auth/navigation';
import { Brand } from './Brand';
import { Link } from './Link';
import { Button, buttonStyles } from './ui/Button';

export function SiteHeader() {
  const session = useAuthSession();
  const { clearSession, retrySession } = useAuthSessionActions();
  const returnPath = getCurrentWebsiteReturnPath();

  return (
    <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <Brand />
        <nav aria-label="Account" className="w-full sm:w-auto">
          {session.state === 'loading' ? (
            <span
              aria-label="Checking session"
              aria-live="polite"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-white/10 px-4 text-sm font-medium text-slate-400 sm:w-auto"
              role="status"
            >
              Checking session…
            </span>
          ) : null}

          {session.state === 'anonymous' ? (
            <>
              <span aria-label="Signed out of Game Hub" aria-live="polite" className="sr-only" role="status">
                Signed out of Game Hub
              </span>
              <Link className={buttonStyles('secondary', 'w-full sm:w-auto')} href={createAccountPath(returnPath)}>
                Sign in or create account
              </Link>
            </>
          ) : null}

          {session.state === 'error' ? (
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
              <span
                aria-label="Account session unavailable"
                className="text-right text-sm font-medium text-amber-200"
                role="status"
              >
                We could not verify your account session.
              </span>
              {session.error === 'identity_resolution_conflict' ? (
                <Link className={buttonStyles()} href={createAccountPath(returnPath)}>
                  Resolve sign-in
                </Link>
              ) : (
                <Button onClick={retrySession}>Try again</Button>
              )}
            </div>
          ) : null}

          {session.state === 'authenticated' ? (
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
              <span
                aria-label="Signed in to Game Hub"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 text-sm font-semibold text-emerald-100"
                role="status"
              >
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-300" />
                Signed in
              </span>
              <a className={buttonStyles('secondary')} href={createSignOutPath(returnPath)} onClick={clearSession}>
                Sign out
              </a>
            </div>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
