import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'article' | 'div' | 'section';
  interactive?: boolean;
}

export function cardStyles(interactive = false, className = ''): string {
  return `rounded-lg border border-white/10 bg-slate-900/60 shadow-sm ${
    interactive
      ? 'transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:bg-slate-900'
      : ''
  } ${className}`;
}

export function Card({
  as: Component = 'div',
  className = '',
  interactive = false,
  ...props
}: CardProps) {
  return (
    <Component
      className={cardStyles(interactive, className)}
      {...props}
    />
  );
}
