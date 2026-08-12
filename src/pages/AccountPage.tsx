import { useEffect } from 'react';
import { useAuthSession, useAuthSessionActions } from '../auth/AuthSessionContext';
import {
  createSignInPath,
  createSignOutPath,
  getCurrentWebsiteReturnPath,
  isAuthenticationCompletion,
} from '../auth/navigation';
import { SiteHeader } from '../components/SiteHeader';
import { Button, buttonStyles } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

interface AccountPageProps {
  completeAuthentication?: (returnPath: string) => void;
}

function replaceLocation(returnPath: string) {
  window.location.replace(returnPath);
}

export function AccountPage({ completeAuthentication = replaceLocation }: AccountPageProps = {}) {
  const session = useAuthSession();
  const { clearSession, retrySession } = useAuthSessionActions();
  const returnPath = getCurrentWebsiteReturnPath();
  const authenticationCompletion = isAuthenticationCompletion();
  const signInPath = createSignInPath(returnPath);

  useEffect(() => {
    if (authenticationCompletion && session.state === 'authenticated') {
      completeAuthentication(returnPath);
    }
  }, [authenticationCompletion, completeAuthentication, returnPath, session.state]);

  const authenticationFailure =
    session.state === 'error'
      ? session.error
      : authenticationCompletion && session.state === 'anonymous'
        ? 'authentication_incomplete'
        : undefined;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main aria-labelledby="account-page-title" className="mx-auto max-w-5xl px-6 py-12 sm:py-16 lg:px-10 lg:py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">Game Hub account</p>
        <h1
          id="account-page-title"
          className="mt-4 max-w-3xl font-display text-4xl font-bold tracking-tight sm:text-6xl"
        >
          Sign in or create an account
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
          Microsoft Entra External ID securely handles registration, email verification, sign-in, and password reset.
          Game Hub never receives or stores your password.
        </p>

        {authenticationFailure ? (
          <Card
            aria-atomic="true"
            aria-labelledby="authentication-error-title"
            aria-live="assertive"
            as="section"
            className="mt-10 border-amber-300/30 p-6 sm:p-7"
            role="alert"
          >
            <h2 id="authentication-error-title" className="font-display text-2xl font-semibold">
              We could not complete sign-in
            </h2>
            {authenticationFailure === 'identity_resolution_conflict' ? (
              <>
                <p className="mt-3 leading-7 text-slate-300">
                  Game Hub could not safely resolve one account. No accounts were linked or merged.
                </p>
                <p className="mt-3 leading-7 text-slate-300">
                  Sign out, then retry with your original sign-in method. Credential linking is not available until a
                  policy is decided.
                </p>
                <a
                  className={buttonStyles('primary', 'mt-6')}
                  href={createSignOutPath('/account')}
                  onClick={clearSession}
                >
                  Sign out and try again
                </a>
              </>
            ) : (
              <>
                <p className="mt-3 leading-7 text-slate-300">
                  {session.state === 'error'
                    ? 'Game Hub could not verify your session. The service may be unavailable or the session may have expired. Your account was not changed.'
                    : 'Sign-in may have been canceled, the provider may be unavailable, or the request may have expired. Your account was not changed.'}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {session.state === 'error' ? <Button onClick={retrySession}>Check session again</Button> : null}
                  <a className={buttonStyles('primary')} href={signInPath}>
                    Try sign-in again
                  </a>
                </div>
              </>
            )}
          </Card>
        ) : session.state === 'loading' && authenticationCompletion ? (
          <Card
            aria-atomic="true"
            aria-labelledby="authentication-loading-title"
            aria-live="polite"
            as="section"
            className="mt-10 p-6 sm:p-7"
            role="status"
          >
            <h2 id="authentication-loading-title" className="font-display text-2xl font-semibold">
              Completing sign-in…
            </h2>
            <p className="mt-3 text-slate-300">Game Hub is resolving your account session.</p>
          </Card>
        ) : session.state === 'authenticated' ? (
          <Card
            aria-atomic="true"
            aria-labelledby="authentication-success-title"
            aria-live="polite"
            as="section"
            className="mt-10 p-6 sm:p-7"
            role="status"
          >
            <h2 id="authentication-success-title" className="font-display text-2xl font-semibold">
              {authenticationCompletion ? 'Sign-in complete' : 'You are signed in'}
            </h2>
            <p className="mt-3 text-slate-300">
              {authenticationCompletion
                ? 'Returning you to the page you requested.'
                : 'Your authenticated Game Hub session is active.'}
            </p>
          </Card>
        ) : session.state === 'anonymous' ? (
          <section aria-labelledby="account-options-title" className="mt-10">
            <h2 id="account-options-title" className="sr-only">
              Account options
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <Card aria-labelledby="sign-in-title" as="section" className="p-6 sm:p-7">
                <h3 id="sign-in-title" className="font-display text-2xl font-semibold">
                  Sign in or register
                </h3>
                <p id="sign-in-description" className="mt-3 leading-7 text-slate-300">
                  Continue to the secure Microsoft-hosted flow to use email and password, Google, or Facebook. New email
                  accounts verify the address before registration completes.
                </p>
                <a
                  aria-describedby="sign-in-description"
                  className={buttonStyles('primary', 'mt-6 w-full sm:w-auto')}
                  href={signInPath}
                >
                  Continue to secure sign-in
                </a>
              </Card>

              <Card aria-labelledby="reset-title" as="section" className="p-6 sm:p-7">
                <h3 id="reset-title" className="font-display text-2xl font-semibold">
                  Forgot your password?
                </h3>
                <p id="reset-description" className="mt-3 leading-7 text-slate-300">
                  On the secure sign-in page, enter your email, choose Next, then choose Forgot password. Microsoft
                  verifies the email before allowing a new password.
                </p>
                <a
                  aria-describedby="reset-description"
                  className={buttonStyles('secondary', 'mt-6 w-full sm:w-auto')}
                  href={signInPath}
                >
                  Reset password
                </a>
              </Card>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
