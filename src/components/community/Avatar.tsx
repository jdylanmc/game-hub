interface AvatarProps {
  alt?: string;
  className?: string;
  name: string;
  ringTone?: 'amber' | 'blue' | 'emerald' | 'violet';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  src?: string;
  status?: 'away' | 'busy' | 'offline' | 'online';
}

const sizeStyles = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-xl',
  xl: 'h-28 w-28 text-2xl',
} as const;

const ringStyles = {
  amber: 'ring-amber-400/35',
  blue: 'ring-blue-400/35',
  emerald: 'ring-emerald-400/35',
  violet: 'ring-violet-400/35',
} as const;

const statusStyles = {
  away: 'bg-amber-400',
  busy: 'bg-rose-400',
  offline: 'bg-slate-500',
  online: 'bg-emerald-400',
} as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'GH';
}

export function Avatar({ alt, className = '', name, ringTone = 'blue', size = 'md', src, status }: AvatarProps) {
  const label = alt ?? `${name} avatar`;

  return (
    <span className={`relative inline-flex ${className}`}>
      <span
        className={`inline-flex items-center justify-center overflow-hidden rounded-full ring-1 ${ringStyles[ringTone]} ${sizeStyles[size]} bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 font-semibold tracking-[0.08em] text-slate-100 shadow-lg shadow-black/25`}
        role={src ? undefined : 'img'}
        aria-label={src ? undefined : label}
      >
        {src ? (
          <img className="h-full w-full object-cover" src={src} alt={label} />
        ) : (
          <span aria-hidden="true">{getInitials(name)}</span>
        )}
      </span>
      {status ? (
        <span className="absolute bottom-0 right-0 flex items-center gap-1">
          <span className="sr-only">{status}</span>
          <span
            aria-hidden="true"
            className={`h-3.5 w-3.5 rounded-full border-2 border-slate-950 ${statusStyles[status]}`}
          />
        </span>
      ) : null}
    </span>
  );
}
