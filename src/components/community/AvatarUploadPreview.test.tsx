import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AvatarUploadPreview } from './AvatarUploadPreview';

const createObjectURL = vi.fn<(file: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

class TestURL extends URL {
  static createObjectURL = createObjectURL;
  static revokeObjectURL = revokeObjectURL;
}

beforeEach(() => {
  createObjectURL.mockReset();
  revokeObjectURL.mockReset();
  vi.stubGlobal('URL', TestURL);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AvatarUploadPreview', () => {
  it('shows an accessible fallback and rejects unsupported files', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<AvatarUploadPreview acceptedMimeTypes={['image/png', 'image/jpeg']} displayName="Jordan Rivera" />);

    expect(screen.getByRole('img', { name: 'Jordan Rivera avatar' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Showing the initials fallback');

    await user.upload(
      screen.getByLabelText('Upload avatar image'),
      new File(['not-an-image'], 'avatar.txt', { type: 'text/plain' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Upload a supported image file: PNG or JPEG.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('previews, replaces, and resets locally selected images', async () => {
    const user = userEvent.setup();
    createObjectURL.mockReturnValueOnce('blob:first-avatar').mockReturnValueOnce('blob:second-avatar');
    render(<AvatarUploadPreview displayName="Jordan Rivera" />);
    const input = screen.getByLabelText('Upload avatar image');

    await user.upload(input, new File(['first'], 'first.png', { type: 'image/png' }));

    expect(
      screen.getByRole('img', { name: "Preview of Jordan Rivera's uploaded avatar from first.png" }),
    ).toHaveAttribute('src', 'blob:first-avatar');
    expect(screen.getByText('Selected: first.png')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Preview updated from first.png.');

    await user.upload(input, new File(['second'], 'second.jpg', { type: 'image/jpeg' }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first-avatar');
    expect(
      screen.getByRole('img', { name: "Preview of Jordan Rivera's uploaded avatar from second.jpg" }),
    ).toHaveAttribute('src', 'blob:second-avatar');

    await user.click(screen.getByRole('button', { name: 'Reset preview' }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second-avatar');
    expect(screen.getByRole('img', { name: 'Jordan Rivera avatar' })).toBeVisible();
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Showing the initials fallback');
  });
});
