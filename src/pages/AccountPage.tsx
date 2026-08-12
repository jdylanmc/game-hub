import { AUTHENTICATION_CONFIGURATION } from '../auth/contract';
import { useAuthSession } from '../auth/AuthSessionContext';
import { SiteHeader } from '../components/SiteHeader';
import { buttonStyles } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export function AccountPage() {
  const session = useAuthSession();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10 lg:py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">Game Hub account</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold tracking-tight sm:text-6xl">
          Sign in or create an account
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
          Microsoft Entra External ID securely handles registration, email verification, sign-in, and password reset.
          Game Hub never receives or stores your password.
        </p>

        {session.state === 'authenticated' ? (
          <Card as="section" className="mt-10 p-7">
            <h2 className="font-display text-2xl font-semibold">You are signed in</h2>
            <p className="mt-3 text-slate-300">Your authenticated Game Hub session is active.</p>
          </Card>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Card as="section" className="p-7">
              <h2 className="font-display text-2xl font-semibold">Email and password</h2>
              <p className="mt-3 leading-7 text-slate-300">
                Continue to the secure Microsoft-hosted flow. New email addresses are verified before the local account
                is created.
              </p>
              <a className={buttonStyles('primary', 'mt-6')} href={AUTHENTICATION_CONFIGURATION.signInPath}>
                Continue with email
              </a>
            </Card>

            <Card as="section" className="p-7">
              <h2 className="font-display text-2xl font-semibold">Forgot your password?</h2>
              <p className="mt-3 leading-7 text-slate-300">
                On the secure sign-in page, enter your email, choose Next, then choose Forgot password to verify your
                email and set a new password.
              </p>
              <a className={buttonStyles('secondary', 'mt-6')} href={AUTHENTICATION_CONFIGURATION.signInPath}>
                Reset password
              </a>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
