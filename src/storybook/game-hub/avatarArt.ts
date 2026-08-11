function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'GH';
}

export function createAvatarDataUri(
  name: string,
  colors: readonly [string, string],
  background = '#0f172a',
): string {
  const initials = getInitials(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" role="img" aria-label="${name} avatar illustration">
      <defs>
        <linearGradient id="avatar-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="${colors[0]}" />
          <stop offset="100%" stop-color="${colors[1]}" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="64" fill="${background}" />
      <circle cx="120" cy="104" r="64" fill="url(#avatar-gradient)" opacity="0.95" />
      <rect x="40" y="154" width="160" height="44" rx="22" fill="rgba(15,23,42,0.6)" />
      <text
        x="120"
        y="132"
        fill="#f8fafc"
        font-family="Inter, ui-sans-serif, system-ui, sans-serif"
        font-size="64"
        font-weight="700"
        letter-spacing="-0.08em"
        text-anchor="middle"
      >
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
