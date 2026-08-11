import { Link } from '../components/Link';
import { SiteHeader } from '../components/SiteHeader';
import { buttonStyles } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto grid max-w-4xl place-items-center px-6 py-32 text-center">
        <div>
          <p className="font-mono text-sm text-blue-300">404</p>
          <h1 className="mt-4 font-display text-5xl font-bold">Game not found</h1>
          <p className="mt-5 text-slate-400">This cabinet is empty. Head back to the hub and choose another game.</p>
          <Link className={buttonStyles('primary', 'mt-8')} href="/">
            Browse games
          </Link>
        </div>
      </main>
    </div>
  );
}
