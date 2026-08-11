import type { ReactNode } from 'react';

interface StorySurfaceProps {
  children: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  maxWidthClassName?: string;
  title: string;
}

export function StorySurface({
  children,
  className = '',
  description,
  eyebrow,
  maxWidthClassName = 'max-w-6xl',
  title,
}: StorySurfaceProps) {
  return (
    <div className={`min-h-screen bg-slate-950 px-6 py-10 text-white ${className}`}>
      <div className={`mx-auto ${maxWidthClassName}`}>
        <header className="mb-8 max-w-3xl">
          {eyebrow ? (
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-blue-300">{eyebrow}</p>
          ) : null}
          <h1 className="font-display text-4xl font-bold tracking-[-0.04em] sm:text-5xl">{title}</h1>
          {description ? <p className="mt-4 text-lg leading-8 text-slate-300">{description}</p> : null}
        </header>
        {children}
      </div>
    </div>
  );
}
