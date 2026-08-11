import { Brand } from './Brand';
import { Button } from './ui/Button';

export function SiteHeader() {
  return (
    <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <Brand />
        <Button>Sign in</Button>
      </div>
    </header>
  );
}
