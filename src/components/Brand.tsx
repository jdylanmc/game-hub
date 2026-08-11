import { Link } from './Link';

export function Brand() {
  return (
    <Link className="group flex items-center gap-3" href="/">
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 shadow-glow">
        <span className="h-3 w-3 rotate-45 bg-blue-400 transition-transform group-hover:rotate-[135deg]" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-white">
        Game Hub
      </span>
    </Link>
  );
}
