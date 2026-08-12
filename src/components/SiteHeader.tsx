import { AUTHENTICATION_CONFIGURATION } from '../auth/contract';
import { useAuthSession } from '../auth/AuthSessionContext';
import { Brand } from './Brand';
import { buttonStyles } from './ui/Button';

export function SiteHeader() {
  const session = useAuthSession();

  return (
    <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <Brand />
        <nav aria-label="Account">
          {session.state === 'loading' ? (
            <span
              aria-label="Checking session"
              aria-live="polite"
              className="inline-flex min-h-10 items-center rounded-md border border-white/10 px-4 text-sm font-medium text-slate-400"
              role="status"
            >
              Checking session…
            </span>
          ) : null}

          {session.state === 'anonymous' ? (
            <a className={buttonStyles()} href={AUTHENTICATION_CONFIGURATION.signInPath}>
              Sign in
            </a>
          ) : null}

          {session.state === 'authenticated' ? (
            <span
              aria-label="Signed in to Game Hub"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 text-sm font-semibold text-emerald-100"
              role="status"
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-300" />
              Signed in
            </span>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
