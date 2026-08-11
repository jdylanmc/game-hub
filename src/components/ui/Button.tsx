import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-white text-slate-950 hover:bg-slate-200',
  secondary: 'border border-white/15 text-slate-200 hover:border-white/30 hover:bg-white/5',
  ghost: 'text-slate-400 hover:bg-white/5 hover:text-white',
};

export function buttonStyles(variant: ButtonVariant = 'secondary', className = ''): string {
  return `inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${variants[variant]} ${className}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className = '', type = 'button', variant = 'secondary', ...props }: ButtonProps) {
  return <button className={buttonStyles(variant, className)} type={type} {...props} />;
}
