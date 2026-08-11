import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Avatar } from './Avatar';

const defaultAcceptedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'] as const;

interface PreviewState {
  alt: string;
  isObjectUrl: boolean;
  src: string;
}

interface AvatarUploadPreviewProps {
  acceptedMimeTypes?: readonly string[];
  displayName: string;
  handle?: string;
  initialImageAlt?: string;
  initialImageSrc?: string;
}

function formatMimeTypes(types: readonly string[]): string {
  const labels = types.map((type) => type.split('/')[1]?.toUpperCase() ?? type);

  if (labels.length <= 1) {
    return labels[0] ?? '';
  }

  if (labels.length === 2) {
    return `${labels[0]} or ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, or ${labels.at(-1)}`;
}

export function AvatarUploadPreview({
  acceptedMimeTypes = defaultAcceptedMimeTypes,
  displayName,
  handle = '@gamehub',
  initialImageAlt,
  initialImageSrc,
}: AvatarUploadPreviewProps) {
  const inputId = useId();
  const hintId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(
    initialImageSrc
      ? {
          alt: initialImageAlt ?? `${displayName} avatar`,
          isObjectUrl: false,
          src: initialImageSrc,
        }
      : null,
  );

  const acceptedMimeLabel = useMemo(() => formatMimeTypes(acceptedMimeTypes), [acceptedMimeTypes]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const resetPreview = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setPreview(
      initialImageSrc
        ? {
            alt: initialImageAlt ?? `${displayName} avatar`,
            isObjectUrl: false,
            src: initialImageSrc,
          }
        : null,
    );
    setSelectedFileName(null);
    setError(null);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!acceptedMimeTypes.includes(file.type)) {
      setError(`Upload a supported image file: ${acceptedMimeLabel}.`);
      event.currentTarget.value = '';
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPreview({
      alt: `Preview of ${displayName}'s uploaded avatar from ${file.name}`,
      isObjectUrl: true,
      src: objectUrl,
    });
    setSelectedFileName(file.name);
    setError(null);
  };

  const statusMessage = error
    ? error
    : preview?.isObjectUrl
      ? `Preview updated from ${selectedFileName}.`
      : initialImageSrc
        ? 'Showing the current avatar image.'
        : 'Showing the initials fallback until an image is selected.';

  return (
    <Card as="section" className="overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.22),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.16),_transparent_40%)] p-6 lg:border-b-0 lg:border-r">
          <Badge className="bg-black/20 text-slate-100">Profile asset</Badge>
          <div className="mt-6 flex items-center gap-4">
            <Avatar
              alt={preview?.alt}
              name={displayName}
              ringTone="violet"
              size="xl"
              src={preview?.src}
              status="online"
            />
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-white">{displayName}</h2>
              <p className="mt-1 text-sm text-slate-300">{handle}</p>
              <p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">
                Accessible avatar previews for profile editing, leaderboard identity, reviews, and social voting
                surfaces.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <label className="block text-sm font-semibold text-white" htmlFor={inputId}>
            Upload avatar image
          </label>
          <p className="mt-2 text-sm leading-6 text-slate-400" id={hintId}>
            Accepted formats: {acceptedMimeLabel}. Preview URLs are created locally and revoked when you replace the
            file, reset it, or unmount the component.
          </p>
          <input
            accept={acceptedMimeTypes.join(',')}
            aria-describedby={`${hintId} ${statusId}`}
            className="mt-4 block w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 file:mr-4 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-slate-200"
            id={inputId}
            onChange={handleFileChange}
            ref={inputRef}
            type="file"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
            {selectedFileName ? <span>Selected: {selectedFileName}</span> : null}
            <Button className="px-3 py-1.5" onClick={resetPreview} variant="ghost">
              Reset preview
            </Button>
          </div>

          <p
            aria-live="polite"
            className={`mt-4 text-sm ${error ? 'text-rose-300' : 'text-slate-400'}`}
            id={statusId}
            role={error ? 'alert' : 'status'}
          >
            {statusMessage}
          </p>
        </div>
      </div>
    </Card>
  );
}
